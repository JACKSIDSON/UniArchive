import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Attachment, AttachmentPreview } from '@shared/types';
import { attachmentDir, ensureDir, atomicWriteFile, nowIso } from './paths';
import { sha256File } from './hash';
import { buildAttachmentFileName, sanitizeFileName } from './naming';
import { requireVaultRoot, guessMime } from './vault';
import { getArchive, updateArchive } from './archive';
import { getDb } from '../db';
import { logAction } from '../log/logger';
import { moveToRecycle } from '../recycle/recycle';

/**
 * 附件管理：复制进 Vault + sha256 + 去重，按 assets/YYYY/MM/ 存放。
 * 附件永远只是「被引用」的普通文件，卸载软件后仍可直接打开。
 */

function relativeToRoot(abs: string): string {
  return path.relative(requireVaultRoot(), abs).split(path.sep).join('/');
}

function absoluteFromRoot(rel: string): string {
  return path.resolve(requireVaultRoot(), rel.split('/').join(path.sep));
}

export interface AddAttachmentInput {
  archiveId: string;
  /** 源文件绝对路径（Vault 外或 Vault 内均可） */
  sourcePath: string;
  /** 原始文件名，缺省取 sourcePath 的 basename */
  originalName?: string;
}

export interface AddAttachmentResult {
  attachment: Attachment;
  /** true 表示该 hash 已存在，未重复写入磁盘 */
  deduped: boolean;
}

export function addAttachment(input: AddAttachmentInput): AddAttachmentResult {
  if (!fs.existsSync(input.sourcePath)) throw new Error(`源文件不存在：${input.sourcePath}`);
  const root = requireVaultRoot();
  const archive = getArchive(input.archiveId);
  if (!archive) throw new Error(`档案不存在：${input.archiveId}`);

  const hash = sha256File(input.sourcePath);

  // 去重：同一档案内已存在相同内容则直接复用
  const existing = getDb()
    .prepare('SELECT * FROM attachments WHERE archive_id = ? AND hash = ?')
    .get(input.archiveId, hash) as AttachmentRow | undefined;
  if (existing && fs.existsSync(absoluteFromRoot(existing.path))) {
    const files = archive.frontmatter.files.includes(existing.path)
      ? archive.frontmatter.files
      : [...archive.frontmatter.files, existing.path];
    if (files.length !== archive.frontmatter.files.length) {
      updateArchive(input.archiveId, { files });
    }
    return {
      attachment: rowToAttachment(existing),
      deduped: true
    };
  }

  const id = uuidv4();
  const original = input.originalName ?? path.basename(input.sourcePath);
  const dir = attachmentDir(root, new Date());
  ensureDir(dir);
  const abs = path.join(dir, buildAttachmentFileName(id, sanitizeFileName(original)));

  // 复制（不移动，避免破坏用户原文件）
  fs.copyFileSync(input.sourcePath, abs);
  const stat = fs.statSync(abs);
  const rel = relativeToRoot(abs);

  const attachment: Attachment = {
    id,
    archiveId: input.archiveId,
    path: rel,
    mime: guessMime(abs),
    size: stat.size,
    hash,
    createdAt: nowIso()
  };

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO attachments (id, archive_id, path, mime, size, hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(attachment.id, attachment.archiveId, attachment.path, attachment.mime, attachment.size, attachment.hash, attachment.createdAt);

  const files = [...new Set([...archive.frontmatter.files, rel])];
  updateArchive(input.archiveId, { files });

  logAction({ action: 'attachment.add', target: input.archiveId, detail: rel });
  return { attachment, deduped: false };
}

interface AttachmentRow {
  id: string;
  archive_id: string;
  path: string;
  mime: string | null;
  size: number | null;
  hash: string | null;
  created_at: string;
}

function rowToAttachment(r: AttachmentRow): Attachment {
  return {
    id: r.id,
    archiveId: r.archive_id,
    path: r.path,
    mime: r.mime ?? 'application/octet-stream',
    size: r.size ?? 0,
    hash: r.hash ?? '',
    createdAt: r.created_at
  };
}

export function listAttachments(archiveId: string): Attachment[] {
  const rows = getDb()
    .prepare('SELECT * FROM attachments WHERE archive_id = ? ORDER BY created_at')
    .all(archiveId) as AttachmentRow[];
  return rows.map(rowToAttachment);
}

export function deleteAttachment(archiveId: string, attachmentId: string): void {
  const row = getDb()
    .prepare('SELECT * FROM attachments WHERE id = ? AND archive_id = ?')
    .get(attachmentId, archiveId) as AttachmentRow | undefined;
  if (!row) throw new Error('附件不存在');
  const abs = absoluteFromRoot(row.path);
  if (fs.existsSync(abs)) {
    moveToRecycle({ path: abs, kind: 'attachment', title: path.basename(row.path), archiveId });
  }
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId);
  const archive = getArchive(archiveId);
  if (archive) {
    updateArchive(archiveId, { files: archive.frontmatter.files.filter((f) => f !== row.path) });
  }
  logAction({ action: 'attachment.delete', target: archiveId, detail: row.path });
}

/** 附件预览：返回可直接供渲染进程使用的信息（图片/文本内联，其它走系统打开） */
export function previewAttachment(relativePath: string): AttachmentPreview {
  const abs = absoluteFromRoot(relativePath);
  if (!fs.existsSync(abs)) throw new Error(`附件不存在：${relativePath}`);
  const mime = guessMime(abs);
  const stat = fs.statSync(abs);
  const base: AttachmentPreview = {
    path: relativePath,
    absolutePath: abs,
    mime,
    size: stat.size,
    kind: mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : mime.startsWith('text/') ? 'text' : 'other'
  };
  if (base.kind === 'image' && stat.size < 8 * 1024 * 1024) {
    base.dataUrl = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
  } else if (base.kind === 'text' && stat.size < 512 * 1024) {
    base.text = fs.readFileSync(abs, 'utf8');
  }
  return base;
}

/** 重新计算附件表（索引重建后调用） */
export function rebuildAttachmentIndex(archiveId: string, files: string[]): void {
  getDb().prepare('DELETE FROM attachments WHERE archive_id = ?').run(archiveId);
  const stmt = getDb().prepare(
    `INSERT OR REPLACE INTO attachments (id, archive_id, path, mime, size, hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const rel of files) {
    const abs = absoluteFromRoot(rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    stmt.run(`${archiveId}:${rel}`, archiveId, rel, guessMime(abs), stat.size, sha256File(abs), nowIso());
  }
}

export { atomicWriteFile };
