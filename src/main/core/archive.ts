import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  Archive,
  ArchiveCategory,
  ArchiveFrontmatter,
  ArchiveLevel,
  ArchiveListItem,
  ArchiveListFilter
} from '@shared/types';
import { parseArchiveFile, serializeArchiveFile } from './frontmatter';
import { buildArchiveFileName, dedupeFileName, renameArchiveFileIfNeeded } from './naming';
import { archiveDir, vaultPaths, atomicWriteFile, ensureDir, listFilesRecursive, nowIso } from './paths';
import { getVaultConfig, requireVaultRoot } from './vault';
import { getDb } from '../db';
import { upsertArchiveIndex, deleteArchiveIndex, searchArchives } from '../db/fts';
import { logAction } from '../log/logger';
import { moveToRecycle } from '../recycle/recycle';

function relativeToRoot(abs: string): string {
  return path.relative(requireVaultRoot(), abs).split(path.sep).join('/');
}

function absoluteFromRoot(rel: string): string {
  return path.resolve(requireVaultRoot(), rel.split('/').join(path.sep));
}

/** 从 SQLite 或磁盘扫描解析出档案文件路径 */
export function resolveArchivePath(id: string): string | null {
  try {
    const row = getDb().prepare('SELECT file_path FROM archives WHERE id = ?').get(id) as
      | { file_path: string }
      | undefined;
    if (row) return row.file_path;
  } catch {
    /* 数据库不可用时回退到磁盘扫描 */
  }
  const root = requireVaultRoot();
  for (const file of listFilesRecursive(vaultPaths(root).archives, (f) => f.toLowerCase().endsWith('.md'))) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const m = raw.match(/^id:\s*(\S+)\s*$/m);
      if (m && m[1] === id) return relativeToRoot(file);
    } catch {
      /* 忽略不可读文件 */
    }
  }
  return null;
}

export function readArchiveFile(relativePath: string): Archive {
  const abs = absoluteFromRoot(relativePath);
  const parsed = parseArchiveFile(fs.readFileSync(abs, 'utf8'));
  return { frontmatter: parsed.frontmatter, body: parsed.body, filePath: relativePath };
}

/* ------------------------------------------------------------------ */
/* 创建                                                                */
/* ------------------------------------------------------------------ */

export interface CreateArchiveInput {
  title: string;
  category: ArchiveCategory;
  type?: string;
  date?: string;
  tags?: string[];
  issuer?: string;
  level?: ArchiveLevel;
  sensitive?: boolean;
  body?: string;
  files?: string[];
  extra?: Record<string, unknown>;
}

export function createArchive(input: CreateArchiveInput): Archive {
  const root = requireVaultRoot();
  const now = nowIso();
  const fm: ArchiveFrontmatter = {
    id: uuidv4(),
    title: input.title.trim() || '未命名档案',
    category: input.category,
    type: input.type,
    date: input.date,
    tags: [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))],
    issuer: input.issuer,
    level: input.level,
    files: input.files ?? [],
    sensitive: input.sensitive ?? false,
    version: 1,
    created_at: now,
    updated_at: now,
    extra: input.extra
  };

  const dir = archiveDir(root, fm.category);
  ensureDir(dir);
  const fileName = dedupeFileName(
    dir,
    buildArchiveFileName({ category: fm.category, date: fm.date, title: fm.title, tags: fm.tags })
  );
  const abs = path.join(dir, fileName);
  const body = input.body ?? '## 备注\n';
  atomicWriteFile(abs, serializeArchiveFile(fm, body));

  const archive: Archive = { frontmatter: fm, body, filePath: relativeToRoot(abs) };
  upsertArchiveIndex(archive);
  logAction({ action: 'archive.create', target: fm.id, detail: fm.title });
  return archive;
}

/* ------------------------------------------------------------------ */
/* 读取                                                                */
/* ------------------------------------------------------------------ */

export function getArchive(id: string): Archive | null {
  const rel = resolveArchivePath(id);
  if (!rel) return null;
  const abs = absoluteFromRoot(rel);
  if (!fs.existsSync(abs)) return null;
  return readArchiveFile(rel);
}

/* ------------------------------------------------------------------ */
/* 更新                                                                */
/* ------------------------------------------------------------------ */

export interface UpdateArchiveInput extends Partial<Omit<CreateArchiveInput, 'extra'>> {
  extra?: Record<string, unknown>;
  /** 显式指定版本号（用于冲突检测），缺省自动递增 */
  version?: number;
}

export function updateArchive(id: string, patch: UpdateArchiveInput): Archive {
  const rel = resolveArchivePath(id);
  if (!rel) throw new Error(`档案不存在：${id}`);
  const abs = absoluteFromRoot(rel);
  const current = readArchiveFile(rel);
  const fm = current.frontmatter;

  const next: ArchiveFrontmatter = {
    ...fm,
    ...(patch.title !== undefined ? { title: patch.title.trim() || fm.title } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.tags !== undefined
      ? { tags: [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))] }
      : {}),
    ...(patch.issuer !== undefined ? { issuer: patch.issuer } : {}),
    ...(patch.level !== undefined ? { level: patch.level } : {}),
    ...(patch.sensitive !== undefined ? { sensitive: patch.sensitive } : {}),
    ...(patch.files !== undefined ? { files: patch.files } : {}),
    ...(patch.extra !== undefined ? { extra: patch.extra } : {}),
    version: (patch.version ?? fm.version) + 1,
    updated_at: nowIso()
  };

  const body = patch.body !== undefined ? patch.body : current.body;
  atomicWriteFile(abs, serializeArchiveFile(next, body));

  // 文件名随分类 / 标题 / 标签同步（分类变化会移动到新目录）
  let finalRel = rel;
  const wantName = buildArchiveFileName({
    category: next.category,
    date: next.date,
    title: next.title,
    tags: next.tags
  });
  const wantDir = archiveDir(requireVaultRoot(), next.category);
  ensureDir(wantDir);
  const oldBase = path.basename(rel);
  const oldDir = path.dirname(abs);
  if (oldDir !== wantDir || oldBase !== wantName) {
    const newName = dedupeFileName(wantDir, wantName);
    const newAbs = path.join(wantDir, newName);
    if (newAbs !== abs) {
      fs.renameSync(abs, newAbs);
      finalRel = relativeToRoot(newAbs);
    }
  }

  const archive: Archive = { frontmatter: next, body, filePath: finalRel };
  upsertArchiveIndex(archive);
  logAction({ action: 'archive.update', target: id, detail: next.title });
  return archive;
}

/* ------------------------------------------------------------------ */
/* 删除（进入回收站）                                                   */
/* ------------------------------------------------------------------ */

export function deleteArchive(id: string): { recycleId: string } {
  const rel = resolveArchivePath(id);
  if (!rel) throw new Error(`档案不存在：${id}`);
  const abs = absoluteFromRoot(rel);
  const archive = readArchiveFile(rel);

  // 附件随档案一起进入回收站
  for (const file of archive.frontmatter.files) {
    const fileAbs = absoluteFromRoot(file);
    if (fs.existsSync(fileAbs)) {
      moveToRecycle({ path: fileAbs, kind: 'attachment', title: path.basename(file), archiveId: id });
    }
  }
  const recycleId = moveToRecycle({ path: abs, kind: 'archive', title: archive.frontmatter.title, archiveId: id });
  deleteArchiveIndex(id);
  logAction({ action: 'archive.delete', target: id, detail: archive.frontmatter.title });
  return { recycleId };
}

/* ------------------------------------------------------------------ */
/* 列表                                                                */
/* ------------------------------------------------------------------ */

export function listArchives(filter: ArchiveListFilter = {}): { items: ArchiveListItem[]; total: number } {
  const result = searchArchives({
    keyword: filter.keyword,
    category: filter.category,
    type: filter.type,
    level: filter.level,
    tags: filter.tag ? [filter.tag] : undefined,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    sort: (filter.sort as 'updated_desc' | 'date_desc' | 'date_asc' | 'title_asc') ?? 'date_desc',
    limit: filter.limit ?? getVaultConfig().pageSize,
    offset: filter.offset ?? 0
  });
  return { items: result.hits, total: result.total };
}

/** 供导出 / 统计使用：一次性读取全部档案（按 id 集合过滤） */
export function loadArchives(ids?: string[]): Archive[] {
  const root = requireVaultRoot();
  const files = listFilesRecursive(vaultPaths(root).archives, (f) => f.toLowerCase().endsWith('.md'));
  const set = ids ? new Set(ids) : null;
  const out: Archive[] = [];
  for (const file of files) {
    try {
      const rel = relativeToRoot(file);
      const archive = readArchiveFile(rel);
      if (set && !set.has(archive.frontmatter.id)) continue;
      out.push(archive);
    } catch {
      /* 跳过解析失败的文件 */
    }
  }
  return out;
}
