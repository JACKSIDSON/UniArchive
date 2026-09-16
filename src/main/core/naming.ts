import fs from 'node:fs';
import path from 'node:path';
import { ILLEGAL_FILENAME_CHARS } from '@shared/constants';
import { splitCategory } from './paths';

/**
 * 命名规范（规格书 5.4）：
 * 档案文件名：【二级分类】-YYYY.MM-标题-标签1,标签2.md
 * 非法字符 \/:*?"<>| 替换为 _
 * 重名追加 -1、-2
 * 附件文件名：<uuid>-<sanitized原文件名>
 */

/** 替换非法字符为 _，并压缩空白 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120);
}

/** 【二级分类】 */
export function categoryBadge(category: string): string {
  const [top, sub] = splitCategory(category);
  return `【${sub ?? top}】`;
}

/** YYYY.MM（缺省时返回 未知时间） */
export function dateToken(date?: string): string {
  if (!date) return '未知时间';
  const m = date.match(/^(\d{4})-(\d{2})/);
  if (!m) return '未知时间';
  return `${m[1]}.${m[2]}`;
}

export interface ArchiveNameInput {
  category: string;
  date?: string;
  title: string;
  tags?: string[];
}

/** 生成档案文件名（不含路径），如 【学科竞赛】-2026.09-校级专业竞赛二等奖-竞赛,评优.md */
export function buildArchiveFileName(input: ArchiveNameInput): string {
  const parts = [
    categoryBadge(input.category),
    dateToken(input.date),
    sanitizeFileName(input.title) || '未命名',
    (input.tags ?? []).filter(Boolean).map(sanitizeFileName).join(',')
  ];
  const base = parts.filter((p) => p.length > 0 && p !== '【】').join('-');
  return `${base}.md`;
}

/** 处理重名：存在则追加 -1、-2 ... */
export function dedupeFileName(dir: string, fileName: string): string {
  if (!fs.existsSync(path.join(dir, fileName))) return fileName;
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  let i = 1;
  let candidate = `${stem}-${i}${ext}`;
  while (fs.existsSync(path.join(dir, candidate))) {
    i += 1;
    candidate = `${stem}-${i}${ext}`;
  }
  return candidate;
}

/** 附件文件名：<uuid>-<sanitized原文件名> */
export function buildAttachmentFileName(id: string, originalName: string): string {
  const safe = sanitizeFileName(originalName) || 'attachment';
  return `${id}-${safe}`;
}

/**
 * 重命名已存在的档案文件（分类/标题/标签变化后同步文件名）。
 * 返回新文件名；若无需变更则返回原文件名。
 */
export function renameArchiveFileIfNeeded(
  dir: string,
  oldFileName: string,
  nextFileName: string
): string {
  if (oldFileName === nextFileName) return oldFileName;
  const finalName = dedupeFileName(dir, nextFileName);
  fs.renameSync(path.join(dir, oldFileName), path.join(dir, finalName));
  return finalName;
}
