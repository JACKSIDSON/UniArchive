import yaml from 'js-yaml';
import matter from 'gray-matter';
import type { ArchiveFrontmatter, ArchiveCategory, ArchiveLevel } from '@shared/types';

/**
 * frontmatter 解析 / 序列化。
 *
 * DECISION: 使用 js-yaml 的 CORE_SCHEMA（而非 DEFAULT_SCHEMA），
 * 这样 `date: 2026-09-01` 不会被解析成 Date 对象，
 * 保证「解析 → 序列化 → 解析」的往返结果完全一致（规格书 10.1）。
 */

const SCHEMA = yaml.CORE_SCHEMA;

/** 输出顺序固定，与规格书 5.3 示例完全一致 */
const KEY_ORDER: (keyof ArchiveFrontmatter)[] = [
  'id',
  'title',
  'category',
  'type',
  'date',
  'tags',
  'issuer',
  'level',
  'files',
  'sensitive',
  'version',
  'created_at',
  'updated_at'
];

const LEVELS: ArchiveLevel[] = ['国家级', '省级', '市级', '校级', '院级', '其他'];

function isCategory(v: unknown): v is ArchiveCategory {
  return typeof v === 'string' && v.includes('/');
}

/** 规范化解析结果：补齐默认值、剔除 undefined */
export function normalizeFrontmatter(raw: Record<string, unknown>): ArchiveFrontmatter {
  const extraRaw = { ...raw };
  for (const k of KEY_ORDER) delete extraRaw[k];

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : typeof raw.tags === 'string' && raw.tags.length > 0
      ? [raw.tags]
      : [];

  const files = Array.isArray(raw.files)
    ? raw.files.filter((f): f is string => typeof f === 'string')
    : [];

  const level = LEVELS.includes(raw.level as ArchiveLevel) ? (raw.level as ArchiveLevel) : undefined;

  const fm: ArchiveFrontmatter = {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? '未命名档案'),
    category: isCategory(raw.category) ? raw.category : '学业档案/学籍档案',
    tags: [...new Set(tags)],
    files: [...new Set(files)],
    sensitive: raw.sensitive === true || raw.sensitive === 'true',
    version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1,
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? raw.created_at ?? new Date().toISOString())
  };

  if (typeof raw.type === 'string' && raw.type) fm.type = raw.type;
  if (typeof raw.date === 'string' && raw.date) fm.date = raw.date;
  if (typeof raw.issuer === 'string' && raw.issuer) fm.issuer = raw.issuer;
  if (level) fm.level = level;
  if (Object.keys(extraRaw).length > 0) fm.extra = extraRaw;

  return fm;
}

export interface ParsedArchiveFile {
  frontmatter: ArchiveFrontmatter;
  body: string;
  raw: string;
}

/** 解析 Markdown 文本 */
export function parseArchiveFile(content: string): ParsedArchiveFile {
  const parsed = matter(content, {
    engines: {
      yaml: {
        parse: (s: string) => (yaml.load(s, { schema: SCHEMA }) as Record<string, unknown>) ?? {},
        stringify: (o: object) => dumpFrontmatter(o as Record<string, unknown>)
      }
    }
  });
  const fm = normalizeFrontmatter((parsed.data ?? {}) as Record<string, unknown>);
  // 规格书 5.3 中 frontmatter 与正文之间有一个空行，解析时去掉这个前导换行，
  // 保证「序列化 → 解析」的正文完全一致。
  const body = (parsed.content ?? '').replace(/^\r?\n/, '');
  return { frontmatter: fm, body, raw: content };
}

/** 序列化为 YAML frontmatter 文本（不含 --- 分隔符） */
export function dumpFrontmatter(data: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  const fm = data as Partial<ArchiveFrontmatter>;
  const push = (k: string, v: unknown): void => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v) && v.length === 0 && (k === 'tags' || k === 'files')) {
      ordered[k] = [];
      return;
    }
    ordered[k] = v;
  };

  push('id', fm.id);
  push('title', fm.title);
  push('category', fm.category);
  push('type', fm.type);
  push('date', fm.date);
  push('tags', fm.tags);
  push('issuer', fm.issuer);
  push('level', fm.level);
  push('files', fm.files);
  push('sensitive', fm.sensitive);
  push('version', fm.version);
  push('created_at', fm.created_at);
  push('updated_at', fm.updated_at);
  if (fm.extra) for (const [k, v] of Object.entries(fm.extra)) ordered[k] = v;

  return yaml.dump(ordered, {
    schema: SCHEMA,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    sortKeys: false
  }).trimEnd();
}

/** 序列化完整 Markdown（frontmatter + 正文） */
export function serializeArchiveFile(fm: ArchiveFrontmatter, body: string): string {
  const yamlText = dumpFrontmatter(fm as unknown as Record<string, unknown>);
  const normalizedBody = body.replace(/^\r?\n+/, '');
  return `---\n${yamlText}\n---\n\n${normalizedBody.endsWith('\n') ? normalizedBody : `${normalizedBody}\n`}`;
}

/** 从 Markdown 文本中快速抽取 id（无需完整解析） */
export function extractId(content: string): string | undefined {
  const m = content.match(/^id:\s*([0-9a-fA-F-]{8,})\s*$/m);
  return m?.[1];
}
