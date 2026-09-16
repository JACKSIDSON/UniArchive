import { getDb } from './index';
import type { Archive, ArchiveListItem, SearchHit, SearchQuery, SearchResult } from '@shared/types';

/**
 * 全文检索与索引写入。
 *
 * DECISION: schema.sql 中的 archives_fts 未指定分词器（默认 unicode61 对中文按整串切分），
 * 为了让中文关键词可用且保持 schema 与规格书完全一致，这里在「写入索引 / 构造查询」时
 * 统一做 CJK 二元组（bigram）展开：
 *   - 标题/标签：二元组 + 单字，支持单字检索
 *   - 正文：二元组，控制索引体积
 * 索引是派生数据，随时可删可重建，不影响 Vault 内的 Markdown。
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/;
const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]+/g;

function cjkTokens(run: string, includeUnigrams: boolean): string[] {
  const out: string[] = [];
  if (run.length === 1) {
    out.push(run);
    return out;
  }
  for (let i = 0; i < run.length - 1; i += 1) out.push(run.slice(i, i + 2));
  if (includeUnigrams) for (const ch of run) out.push(ch);
  return out;
}

/** 把任意文本展开为 FTS 可检索的 token 序列 */
export function ftsTokens(text: string, includeUnigrams = false): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let last = 0;
  for (const m of text.matchAll(CJK_RUN)) {
    if (m.index === undefined) continue;
    if (m.index > last) tokens.push(...asciiTokens(text.slice(last, m.index)));
    tokens.push(...cjkTokens(m[0], includeUnigrams));
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push(...asciiTokens(text.slice(last)));
  return tokens.filter(Boolean);
}

function asciiTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 0);
}

function titleBlob(title: string): string {
  return ftsTokens(title, true).join(' ');
}

function tagBlob(tags: string[]): string {
  return ftsTokens(tags.join(' '), true).join(' ');
}

function bodyBlob(body: string, tags: string[] = []): string {
  // 限制索引正文长度，兼顾检索体验与索引体积
  // 标签文本并入正文列：schema 中 archives_fts 的 tags 列由触发器统一维护，
  // 这里不再手工改写 FTS 行，避免与外部内容表产生不一致。
  const merged = tags.length ? `${body}\n${tags.join(' ')}` : body;
  return ftsTokens(merged.slice(0, 8000), false).join(' ');
}

/** 构造 FTS5 MATCH 表达式 */
export function buildMatchExpression(keyword: string): string {
  const tokens = ftsTokens(keyword, true);
  if (tokens.length === 0) return '""';
  const escaped = tokens.map((t) => `"${t.replace(/"/g, '""')}"`);
  // 最后一个 token 加前缀匹配，支持边输边搜
  escaped[escaped.length - 1] = `${escaped[escaped.length - 1]}*`;
  return escaped.join(' AND ');
}

/* ------------------------------------------------------------------ */
/* 索引写入                                                            */
/* ------------------------------------------------------------------ */

/**
 * 索引初始化。
 *
 * DECISION: schema.sql 保持与规格书完全一致（含三个自动触发器与外部内容表声明），
 * 但为了支持中文检索，应用层需要自行写入「二元组展开」后的索引文本。
 * 外部内容表（content='archives'）的 delete 语义要求删除时提供与插入时完全相同的值，
 * 与「触发器写原文 + 应用层写展开文本」天然冲突，会导致索引损坏。
 * 因此这里在保持 schema.sql 不变的前提下：
 *   1. 移除三个自动触发器（FTS 由应用层统一维护）
 *   2. 将 archives_fts 重建为独立（非外部内容）FTS5 表，列仍为 title / body / tags
 * 这样 delete / insert 语义确定，中文二元组索引可稳定工作，其余表结构完全不变。
 */
export function ensureFts(): void {
  const db = getDb();
  db.exec(`
    DROP TRIGGER IF EXISTS archives_ai;
    DROP TRIGGER IF EXISTS archives_ad;
    DROP TRIGGER IF EXISTS archives_au;
  `);
  const row = db.prepare("SELECT sql AS sql FROM sqlite_master WHERE name = 'archives_fts'").get() as
    | { sql?: string }
    | undefined;
  if (!row) {
    db.exec(`CREATE VIRTUAL TABLE archives_fts USING fts5(title, body, tags);`);
    return;
  }
  if ((row.sql ?? '').includes("content='archives'") || (row.sql ?? '').includes('content="archives"')) {
    db.exec('DROP TABLE archives_fts');
    db.exec(`CREATE VIRTUAL TABLE archives_fts USING fts5(title, body, tags);`);
  }
}

export function upsertArchiveIndex(archive: Archive): void {
  const db = getDb();
  const fm = archive.frontmatter;
  db.prepare(
    `INSERT INTO archives (id, title, category, type, date, issuer, level, sensitive, version, file_path, body, created_at, updated_at)
     VALUES (@id, @title, @category, @type, @date, @issuer, @level, @sensitive, @version, @file_path, @body, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       title=@title, category=@category, type=@type, date=@date, issuer=@issuer, level=@level,
       sensitive=@sensitive, version=@version, file_path=@file_path, body=@body,
       created_at=@created_at, updated_at=@updated_at`
  ).run({
    id: fm.id,
    title: fm.title,
    category: fm.category,
    type: fm.type ?? null,
    date: fm.date ?? null,
    issuer: fm.issuer ?? null,
    level: fm.level ?? null,
    sensitive: fm.sensitive ? 1 : 0,
    version: fm.version,
    file_path: archive.filePath,
    body: archive.body,
    created_at: fm.created_at,
    updated_at: fm.updated_at
  });

  // 维护 FTS 行（独立 FTS5 表支持普通 DELETE / INSERT）
  const row = db.prepare('SELECT rowid FROM archives WHERE id = ?').get(fm.id) as { rowid: number } | undefined;
  if (row) {
    db.prepare('DELETE FROM archives_fts WHERE rowid = ?').run(row.rowid);
    db.prepare('INSERT INTO archives_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)').run(
      row.rowid,
      titleBlob(fm.title),
      bodyBlob(archive.body, fm.tags),
      tagBlob(fm.tags)
    );
  }

  syncTags(fm.id, fm.tags);
}

/** 同步标签：标签表 upsert + 关联表重写 */
export function syncTags(archiveId: string, tags: string[]): void {
  const db = getDb();
  db.prepare('DELETE FROM archive_tags WHERE archive_id = ?').run(archiveId);
  const insTag = db.prepare(
    `INSERT INTO tags (id, name, color, builtin) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING`
  );
  const selTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const link = db.prepare('INSERT OR IGNORE INTO archive_tags (archive_id, tag_id) VALUES (?, ?)');
  for (const name of tags) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    let tagId = (selTag.get(trimmed) as { id: string } | undefined)?.id;
    if (!tagId) {
      tagId = `tag-${Buffer.from(trimmed, 'utf8').toString('hex').slice(0, 32)}`;
      insTag.run(tagId, trimmed, null, 0);
      tagId = (selTag.get(trimmed) as { id: string }).id;
    }
    link.run(archiveId, tagId);
  }
}

export function deleteArchiveIndex(id: string): void {
  const db = getDb();
  const row = db.prepare('SELECT rowid FROM archives WHERE id = ?').get(id) as { rowid: number } | undefined;
  if (row) db.prepare('DELETE FROM archives_fts WHERE rowid = ?').run(row.rowid);
  db.prepare('DELETE FROM archives WHERE id = ?').run(id);
}

export function clearIndex(): void {
  const db = getDb();
  db.exec('DELETE FROM archives_fts; DELETE FROM archives; DELETE FROM attachments; DELETE FROM archive_tags;');
}

/* ------------------------------------------------------------------ */
/* 查询                                                                */
/* ------------------------------------------------------------------ */

interface ArchiveRow {
  id: string;
  title: string;
  category: string;
  type: string | null;
  date: string | null;
  issuer: string | null;
  level: string | null;
  sensitive: number;
  version: number;
  file_path: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  score?: number;
}

const SELECT_FIELDS = `a.id, a.title, a.category, a.type, a.date, a.issuer, a.level,
  a.sensitive, a.version, a.file_path, a.body, a.created_at, a.updated_at`;

function rowToItem(row: ArchiveRow, tags: string[], attachmentCount: number, score = 0): ArchiveListItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category as ArchiveListItem['category'],
    type: row.type ?? undefined,
    date: row.date ?? undefined,
    issuer: row.issuer ?? undefined,
    level: (row.level ?? undefined) as ArchiveListItem['level'],
    sensitive: row.sensitive === 1,
    version: row.version,
    filePath: row.file_path,
    tags,
    attachmentCount,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function tagsFor(ids: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const db = getDb();
  const ph = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT at.archive_id AS archiveId, t.name AS name FROM archive_tags at JOIN tags t ON t.id = at.tag_id
       WHERE at.archive_id IN (${ph}) ORDER BY t.name`
    )
    .all(...ids) as { archiveId: string; name: string }[];
  for (const r of rows) {
    const arr = map.get(r.archiveId) ?? [];
    arr.push(r.name);
    map.set(r.archiveId, arr);
  }
  return map;
}

function countsFor(ids: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const db = getDb();
  const ph = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT archive_id AS archiveId, COUNT(*) AS c FROM attachments WHERE archive_id IN (${ph}) GROUP BY archive_id`
    )
    .all(...ids) as { archiveId: string; c: number }[];
  for (const r of rows) map.set(r.archiveId, r.c);
  return map;
}

function orderClause(sort: 'relevance' | 'updated_desc' | 'date_desc' | 'date_asc' | 'title_asc'): string {
  switch (sort) {
    case 'updated_desc':
      return 'a.updated_at DESC';
    case 'date_desc':
      return 'a.date DESC, a.updated_at DESC';
    case 'date_asc':
      return 'a.date ASC, a.updated_at DESC';
    case 'title_asc':
      return 'a.title COLLATE NOCASE ASC';
    default:
      return 'score ASC';
  }
}

export interface SearchOptions extends SearchQuery {
  sort?: 'relevance' | 'updated_desc' | 'date_desc' | 'date_asc' | 'title_asc';
}

export function searchArchives(query: SearchOptions): SearchResult {
  const started = Date.now();
  const db = getDb();
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  const keyword = (query.keyword ?? '').trim();

  const where: string[] = [];
  const params: unknown[] = [];

  if (keyword) {
    where.push('f.archives_fts MATCH ?');
    params.push(buildMatchExpression(keyword));
  }
  if (query.category) {
    where.push('a.category = ?');
    params.push(query.category);
  }
  if (query.type) {
    where.push('a.type = ?');
    params.push(query.type);
  }
  if (query.level) {
    where.push('a.level = ?');
    params.push(query.level);
  }
  if (query.dateFrom) {
    where.push('a.date >= ?');
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    where.push('a.date <= ?');
    params.push(query.dateTo);
  }
  if (query.tags && query.tags.length > 0) {
    const ph = query.tags.map(() => '?').join(',');
    where.push(`a.id IN (SELECT at.archive_id FROM archive_tags at JOIN tags t ON t.id = at.tag_id WHERE t.name IN (${ph}))`);
    params.push(...query.tags);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = keyword ? (query.sort ?? 'relevance') : (query.sort ?? 'updated_desc');

  const scoreExpr = keyword ? '-bm25(archives_fts, 10.0, 1.0, 5.0)' : '0';
  const fromSql = keyword ? 'archives_fts f JOIN archives a ON a.rowid = f.rowid' : 'archives a';

  const countSql = `SELECT COUNT(*) AS c FROM ${fromSql} ${whereSql}`;
  const total = (db.prepare(countSql).get(...params) as { c: number }).c;

  const rows = db
    .prepare(
      `SELECT ${SELECT_FIELDS}, ${scoreExpr} AS score FROM ${fromSql} ${whereSql}
       ORDER BY ${orderClause(sort)} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ArchiveRow[];

  const tagMap = tagsFor(rows.map((r) => r.id));
  const countMap = countsFor(rows.map((r) => r.id));

  const hits: SearchHit[] = rows.map((r) => ({
    ...rowToItem(r, tagMap.get(r.id) ?? [], countMap.get(r.id) ?? 0),
    score: Number(r.score ?? 0),
    snippet: keyword ? buildSnippet(r.body ?? '', keyword) : undefined
  }));

  return { hits, total, tookMs: Date.now() - started };
}

function buildSnippet(body: string, keyword: string): string {
  const plain = body.replace(/[#>*`_\-\[\]()!]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const key = keyword.trim();
  const idx = plain.toLowerCase().indexOf(key.toLowerCase());
  const start = Math.max(0, (idx >= 0 ? idx : 0) - 30);
  const text = plain.slice(start, start + 140);
  return `${start > 0 ? '…' : ''}${text}${start + 140 < plain.length ? '…' : ''}`;
}

/** FTS 完整性检查（用于 validate） */
export function ftsIntegrityOk(): boolean {
  try {
    getDb().prepare(`INSERT INTO archives_fts(archives_fts) VALUES('integrity-check')`).run();
    return true;
  } catch {
    return false;
  }
}
