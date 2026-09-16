/**
 * 全局共享类型定义 —— 与规格书第 4 节完全一致，禁止重命名。
 */

export type ArchiveCategory =
  | '学业档案/学籍档案'
  | '学业档案/课程资料档案'
  | '学业档案/学业成绩档案'
  | '学业档案/作业考试档案'
  | '学业档案/教材工具档案'
  | '学业档案/科研学业档案'
  | '荣誉实践/荣誉奖项'
  | '荣誉实践/学科竞赛'
  | '荣誉实践/学生工作任职'
  | '荣誉实践/志愿服务'
  | '荣誉实践/实习实践'
  | '荣誉实践/科研创新'
  | '生活行政/个人证件'
  | '生活行政/健康档案'
  | '生活行政/校园行政'
  | '生活行政/缴费凭证'
  | '生活行政/校园凭证';

export type ArchiveLevel = '国家级' | '省级' | '市级' | '校级' | '院级' | '其他';

export interface ArchiveFrontmatter {
  id: string; // UUID v4
  title: string;
  category: ArchiveCategory;
  type?: string; // 证书/成绩单/证明...
  date?: string; // ISO 8601，如 2026-09-01
  tags: string[];
  issuer?: string;
  level?: ArchiveLevel;
  files: string[]; // 相对 Vault 根的路径
  sensitive: boolean;
  version: number;
  created_at: string; // ISO 8601
  updated_at: string;
  extra?: Record<string, unknown>;
}

export interface Archive {
  frontmatter: ArchiveFrontmatter;
  body: string; // Markdown 正文
  filePath: string; // 相对 Vault 根
}

export interface VaultMeta {
  vaultId: string;
  name: string;
  createdAt: string;
  appVersion: string;
  formatVersion: '1.0';
}

export interface Attachment {
  id: string;
  archiveId: string;
  path: string; // 相对 Vault 根
  mime: string;
  size: number;
  hash: string; // sha256
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  builtin: boolean;
}

export type LogAction =
  | 'vault.create' | 'vault.open' | 'vault.close'
  | 'archive.create' | 'archive.update' | 'archive.delete'
  | 'attachment.add' | 'attachment.delete'
  | 'export.ueap' | 'import.ueap'
  | 'backup.create' | 'backup.restore'
  | 'recycle.restore' | 'recycle.purge'
  | 'settings.update';

export interface LogEntry {
  id: string;
  action: LogAction;
  target?: string;
  detail?: string;
  timestamp: string;
}

export type ExportScopeKind = 'full' | 'category' | 'filter' | 'template';

export interface ExportOptions {
  scope:
    | { kind: 'full' }
    | { kind: 'category'; category: ArchiveCategory }
    | { kind: 'filter'; archiveIds: string[] }
    | { kind: 'template'; template: '评优' | '求职' | '升学' | '答辩' };
  includeAttachments: boolean;
  encrypt?: { password: string };
  outputPath: string;
}

export interface ImportOptions {
  packagePath: string;
  mode: 'new' | 'merge' | 'overwrite' | 'add-only' | 'preview';
  conflictStrategy: 'skip' | 'overwrite' | 'keep-both' | 'newer-wins' | 'ask';
  targetVaultPath?: string;
}

export interface ConflictItem {
  archiveId: string;
  title: string;
  reason: 'id-exists' | 'hash-differs' | 'path-conflict';
  resolution?: 'skip' | 'overwrite' | 'keep-both' | 'newer-wins';
}

export interface UeapManifest {
  format: 'UEAP';
  version: '1.0';
  app: 'UniArchive';
  appVersion: string;
  vaultId: string;
  vaultName: string;
  exportType: string;
  exportedAt: string;
  exportedBy?: string;
  encryption: {
    enabled: boolean;
    algorithm: 'AES-256-GCM' | null;
    kdf?: { name: 'argon2id'; memory: number; iterations: number; parallelism: number };
    salt?: string;
    iv?: string;
    tag?: string;
  };
  checksums: 'checksums.sha256';
  compatibility: { minAppVersion: string; formatVersion: '1.0' };
}

/* ------------------------------------------------------------------ */
/* IPC / 辅助类型                                                       */
/* ------------------------------------------------------------------ */

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; detail?: unknown } };

export interface ArchiveListFilter {
  category?: string;
  type?: string;
  level?: string;
  tag?: string;
  sensitive?: boolean;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  sort?: 'updated_desc' | 'updated_asc' | 'date_desc' | 'date_asc' | 'title_asc';
  limit?: number;
  offset?: number;
}

export interface ArchiveListItem {
  id: string;
  title: string;
  category: ArchiveCategory;
  type?: string;
  date?: string;
  issuer?: string;
  level?: ArchiveLevel;
  sensitive: boolean;
  version: number;
  filePath: string;
  tags: string[];
  attachmentCount: number;
  created_at: string;
  updated_at: string;
}

export interface SearchQuery {
  keyword?: string;
  category?: string;
  tags?: string[];
  type?: string;
  level?: string;
  dateFrom?: string;
  dateTo?: string;
  includeBody?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchHit extends ArchiveListItem {
  score: number;
  snippet?: string;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  tookMs: number;
}

export interface VaultInfo extends VaultMeta {
  path: string;
  counts: {
    archives: number;
    attachments: number;
    tags: number;
    recycle: number;
    backups: number;
  };
  sizes: { total: number; assets: number };
}

export interface VaultIssue {
  level: 'error' | 'warn';
  code: string;
  message: string;
  path?: string;
}

export interface RecycleItem {
  recycleId: string;
  kind: 'archive' | 'attachment';
  title: string;
  originalPath: string; // 相对 Vault 根
  archiveId?: string;
  deletedAt: string;
  expireAt: string;
  size: number;
}

export interface BackupItem {
  id: string;
  name: string;
  createdAt: string;
  size: number;
  kind: 'manual' | 'auto' | 'pre-import';
  vaultId: string;
  note?: string;
}

export interface ImportPreview {
  manifest: UeapManifest;
  archiveCount: number;
  attachmentCount: number;
  conflicts: ConflictItem[];
  sample: ArchiveListItem[];
}

/** 附件预览信息（渲染进程可直接消费） */
export interface AttachmentPreview {
  path: string;
  absolutePath: string;
  mime: string;
  size: number;
  kind: 'image' | 'pdf' | 'text' | 'other';
  dataUrl?: string;
  text?: string;
}

export interface ImportReport {
  mode: ImportOptions['mode'];
  created: number;
  updated: number;
  skipped: number;
  conflictCopies: number;
  snapshotId?: string;
  targetVaultPath: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  recentVaults: { path: string; name: string; lastOpenedAt: string }[];
  autoBackup: boolean;
  autoBackupIntervalDays: number;
  recycleTtlDays: number;
  blurSensitive: boolean;
  pageSize: number;
  lastVaultPath?: string;
}
