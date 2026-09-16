import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { VaultMeta, VaultInfo, VaultIssue, Tag } from '@shared/types';
import { APP_VERSION, FORMAT_VERSION, CATEGORIES, PRESET_TAGS, DEFAULT_SETTINGS } from '@shared/constants';
import {
  vaultPaths,
  splitCategory,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  atomicWriteFile,
  listFilesRecursive,
  dirSize,
  nowIso
} from './paths';
import { parseArchiveFile } from './frontmatter';
import { openDatabase, closeDatabase, getDb, deleteIndex } from '../db';
import { migrate } from '../db/migrate';
import { upsertArchiveIndex, searchArchives, syncTags, clearIndex } from '../db/fts';
import { logAction } from '../log/logger';
import type { Archive } from '@shared/types';

/** Vault 级配置（.uniarchive/config.json） */
export interface VaultConfig {
  recycleTtlDays: number;
  autoBackup: boolean;
  autoBackupIntervalDays: number;
  blurSensitive: boolean;
  pageSize: number;
  lastBackupAt?: string;
  pluginsEnabled: boolean;
}

const DEFAULT_VAULT_CONFIG: VaultConfig = {
  recycleTtlDays: DEFAULT_SETTINGS.recycleTtlDays,
  autoBackup: DEFAULT_SETTINGS.autoBackup,
  autoBackupIntervalDays: DEFAULT_SETTINGS.autoBackupIntervalDays,
  blurSensitive: DEFAULT_SETTINGS.blurSensitive,
  pageSize: DEFAULT_SETTINGS.pageSize,
  pluginsEnabled: true
};

interface CurrentVault {
  root: string;
  meta: VaultMeta;
}

let current: CurrentVault | null = null;

export function getCurrentVault(): CurrentVault | null {
  return current;
}

export function requireVault(): CurrentVault {
  if (!current) throw new Error('尚未打开任何档案库（Vault）');
  return current;
}

export function requireVaultRoot(): string {
  return requireVault().root;
}

export function getVaultConfig(): VaultConfig {
  const p = vaultPaths(requireVaultRoot());
  return { ...DEFAULT_VAULT_CONFIG, ...readJsonFile<Partial<VaultConfig>>(p.configJson, {}) };
}

export function updateVaultConfig(patch: Partial<VaultConfig>): VaultConfig {
  const p = vaultPaths(requireVaultRoot());
  const next = { ...getVaultConfig(), ...patch };
  writeJsonFile(p.configJson, next);
  return next;
}

/* ------------------------------------------------------------------ */
/* 创建 / 打开 / 关闭                                                   */
/* ------------------------------------------------------------------ */

const VAULT_README = (name: string): string => `# ${name}

这是一个 **UniArchive 大学电子档案库（Vault）**。

- \`archives/\`：档案正文（Markdown + YAML frontmatter），按「一级分类/二级分类」组织
- \`assets/\`：附件原始文件，按 \`年/月\` 归档
- \`.uniarchive/\`：配置、索引、标签、模板、插件、备份、日志与回收站
  - \`index.db\` 是**可删除重建**的检索索引，删除后重新打开本库即可自动重建
  - 即使卸载 UniArchive，你也可以用任意文本编辑器直接阅读 \`archives/\` 下的所有内容

本库不使用任何私有格式，数据永远属于你。
`;

export interface CreateVaultInput {
  /** 目标文件夹路径（将作为 Vault 根目录） */
  targetPath: string;
  name?: string;
}

export function createVault(input: CreateVaultInput): VaultMeta {
  const root = path.resolve(input.targetPath);
  const name = (input.name ?? path.basename(root) ?? '我的大学档案库').trim() || '我的大学档案库';
  const p = vaultPaths(root);

  ensureDir(root);
  ensureDir(p.archives);
  ensureDir(p.assets);
  for (const dir of [
    p.uniarchive,
    p.templates,
    p.plugins,
    p.themes,
    p.backups,
    p.logs,
    p.recycle
  ]) {
    ensureDir(dir);
  }
  // 完整目录树：一级/二级分类目录一次性建好
  for (const c of CATEGORIES) {
    const [top, sub] = splitCategory(c);
    ensureDir(path.join(p.archives, top, sub ?? ''));
  }

  const meta: VaultMeta = {
    vaultId: uuidv4(),
    name,
    createdAt: nowIso(),
    appVersion: APP_VERSION,
    formatVersion: FORMAT_VERSION
  };
  atomicWriteFile(p.vaultJson, `${JSON.stringify(meta, null, 2)}\n`);
  if (!fs.existsSync(p.readme)) atomicWriteFile(p.readme, VAULT_README(name));
  writeJsonFile(p.configJson, DEFAULT_VAULT_CONFIG);
  writeJsonFile(
    p.tagsJson,
    PRESET_TAGS.map((name_) => ({
      id: `tag-${Buffer.from(name_, 'utf8').toString('hex').slice(0, 32)}`,
      name: name_,
      color: undefined,
      builtin: true
    })) satisfies Tag[]
  );

  logAction({ action: 'vault.create', target: root, detail: name, vaultRoot: root });
  return meta;
}

export function openVault(vaultRoot: string): VaultMeta {
  const root = path.resolve(vaultRoot);
  const p = vaultPaths(root);
  if (!fs.existsSync(p.vaultJson)) {
    throw new Error(`不是有效的 UniArchive 档案库：缺少 vault.json（${p.vaultJson}）`);
  }
  const meta = readJsonFile<VaultMeta>(p.vaultJson, {
    vaultId: uuidv4(),
    name: path.basename(root),
    createdAt: nowIso(),
    appVersion: APP_VERSION,
    formatVersion: FORMAT_VERSION
  });

  // 自愈：缺失目录自动补齐（用户手工整理后仍可打开）
  for (const dir of [p.archives, p.assets, p.uniarchive, p.templates, p.plugins, p.themes, p.backups, p.logs, p.recycle]) {
    ensureDir(dir);
  }
  if (!fs.existsSync(p.configJson)) writeJsonFile(p.configJson, DEFAULT_VAULT_CONFIG);
  if (!fs.existsSync(p.tagsJson)) writeJsonFile(p.tagsJson, []);

  // 索引可删除重建：删除 index.db 后这里会重新建库并自动重建索引
  openDatabase(root);
  migrate();
  // current 必须在重建索引之前设置：reindexVault 需要知道当前 Vault 根目录
  current = { root, meta };
  syncTagsFromJson(root);
  const count = (getDb().prepare('SELECT COUNT(*) AS c FROM archives').get() as { c: number }).c;
  const files = listFilesRecursive(p.archives, (f) => f.toLowerCase().endsWith('.md'));
  if (count === 0 && files.length > 0) reindexVault();
  else if (count !== files.length) reindexVault();

  logAction({ action: 'vault.open', target: root, detail: meta.name, vaultRoot: root });
  return meta;
}

export function closeVault(): void {
  if (current) logAction({ action: 'vault.close', target: current.root, vaultRoot: current.root });
  closeDatabase();
  current = null;
}

/* ------------------------------------------------------------------ */
/* 信息 / 校验                                                          */
/* ------------------------------------------------------------------ */

export function getVaultInfo(): VaultInfo {
  const { root, meta } = requireVault();
  const p = vaultPaths(root);
  const db = getDb();
  const archives = (db.prepare('SELECT COUNT(*) AS c FROM archives').get() as { c: number }).c;
  const attachments = (db.prepare('SELECT COUNT(*) AS c FROM attachments').get() as { c: number }).c;
  const tags = (db.prepare('SELECT COUNT(*) AS c FROM tags').get() as { c: number }).c;
  const recycle = fs.existsSync(p.recycle)
    ? fs.readdirSync(p.recycle, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0;
  const backups = fs.existsSync(p.backups)
    ? fs.readdirSync(p.backups).filter((f) => f.endsWith('.ueap')).length
    : 0;

  return {
    ...meta,
    path: root,
    counts: { archives, attachments, tags, recycle, backups },
    sizes: { total: dirSize(root), assets: dirSize(p.assets) }
  };
}

export function validateVault(vaultRoot?: string): VaultIssue[] {
  const root = path.resolve(vaultRoot ?? (current ? current.root : ''));
  const issues: VaultIssue[] = [];
  if (!root) return [{ level: 'error', code: 'no-vault', message: '未指定档案库路径' }];
  const p = vaultPaths(root);

  if (!fs.existsSync(root)) {
    return [{ level: 'error', code: 'vault-missing', message: '档案库目录不存在', path: root }];
  }
  if (!fs.existsSync(p.vaultJson)) {
    issues.push({ level: 'error', code: 'vault-json-missing', message: '缺少 vault.json', path: p.vaultJson });
  } else {
    const meta = readJsonFile<Partial<VaultMeta>>(p.vaultJson, {});
    if (!meta.vaultId) issues.push({ level: 'error', code: 'vault-id-missing', message: 'vault.json 缺少 vaultId' });
    if (meta.formatVersion !== FORMAT_VERSION) {
      issues.push({ level: 'warn', code: 'format-version', message: `formatVersion=${meta.formatVersion ?? '未知'}，当前支持 ${FORMAT_VERSION}` });
    }
  }
  for (const [key, dir] of Object.entries({
    archives: p.archives,
    assets: p.assets,
    uniarchive: p.uniarchive
  })) {
    if (!fs.existsSync(dir)) issues.push({ level: 'warn', code: `dir-missing-${key}`, message: `缺少目录 ${key}/`, path: dir });
  }

  // 逐篇检查 Markdown 与附件
  for (const file of listFilesRecursive(p.archives, (f) => f.toLowerCase().endsWith('.md'))) {
    try {
      const parsed = parseArchiveFile(fs.readFileSync(file, 'utf8'));
      if (!parsed.frontmatter.id) {
        issues.push({ level: 'error', code: 'archive-no-id', message: '档案缺少 id', path: file });
      }
      for (const rel of parsed.frontmatter.files) {
        const abs = path.resolve(root, rel.split('/').join(path.sep));
        if (!fs.existsSync(abs)) {
          issues.push({ level: 'warn', code: 'attachment-missing', message: `附件缺失：${rel}`, path: file });
        }
      }
    } catch (err) {
      issues.push({
        level: 'error',
        code: 'archive-parse-error',
        message: `解析失败：${(err as Error).message}`,
        path: file
      });
    }
  }
  return issues;
}

/**
 * 重建索引：扫描 archives/ 下所有 .md，解析 frontmatter，写入 archives 表，再重建 FTS。
 */
export function reindexVault(): { archives: number; tookMs: number } {
  const root = requireVaultRoot();
  const p = vaultPaths(root);
  const started = Date.now();
  const db = getDb();

  clearIndex();

  const files = listFilesRecursive(p.archives, (f) => f.toLowerCase().endsWith('.md'));
  const insertAll = db.transaction(() => {
    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = parseArchiveFile(raw);
        const fm = parsed.frontmatter;
        if (!fm.id) continue;
        const relative = path.relative(root, file).split(path.sep).join('/');
        const archive: Archive = { frontmatter: fm, body: parsed.body, filePath: relative };
        upsertArchiveIndex(archive);
        for (const rel of fm.files) {
          const abs = path.resolve(root, rel.split('/').join(path.sep));
          if (!fs.existsSync(abs)) continue;
          const stat = fs.statSync(abs);
          db.prepare(
            `INSERT OR REPLACE INTO attachments (id, archive_id, path, mime, size, hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(`${fm.id}:${rel}`, fm.id, rel, guessMime(abs), stat.size, '', fm.created_at);
        }
      } catch {
        /* 单篇解析失败不影响整体重建 */
      }
    }
  });
  insertAll();
  return { archives: files.length, tookMs: Date.now() - started };
}

export function purgeIndex(): void {
  deleteIndex(requireVaultRoot());
}

/** tags.json → SQLite 同步（双向：数据库里新增的用户标签回写 json） */
export function syncTagsFromJson(root?: string): void {
  const vaultRoot = root ?? requireVaultRoot();
  const p = vaultPaths(vaultRoot);
  const list = readJsonFile<Tag[]>(p.tagsJson, []);
  const names = list.map((t) => t.name).filter(Boolean);
  if (names.length === 0) {
    writeJsonFile(
      p.tagsJson,
      PRESET_TAGS.map((n) => ({ id: `tag-${Buffer.from(n, 'utf8').toString('hex').slice(0, 32)}`, name: n, builtin: true }))
    );
    syncTagsFromJson(vaultRoot);
    return;
  }
  const db = getDb();
  const ins = db.prepare('INSERT OR IGNORE INTO tags (id, name, color, builtin) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const t of list) {
      const id = t.id || `tag-${Buffer.from(t.name, 'utf8').toString('hex').slice(0, 32)}`;
      ins.run(id, t.name, t.color ?? null, t.builtin ? 1 : 0);
    }
  });
  tx();
}

/** SQLite → tags.json 回写 */
export function flushTagsToJson(root?: string): Tag[] {
  const vaultRoot = root ?? requireVaultRoot();
  const p = vaultPaths(vaultRoot);
  const rows = getDb().prepare('SELECT id, name, color, builtin FROM tags ORDER BY name').all() as {
    id: string;
    name: string;
    color: string | null;
    builtin: number;
  }[];
  const tags: Tag[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color ?? undefined,
    builtin: r.builtin === 1
  }));
  writeJsonFile(p.tagsJson, tags);
  return tags;
}

export function guessMime(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip'
  };
  return map[ext] ?? 'application/octet-stream';
}

export { searchArchives };
