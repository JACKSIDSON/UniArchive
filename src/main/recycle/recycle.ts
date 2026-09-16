import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { RecycleItem } from '@shared/types';
import { recycleDir, vaultPaths, readJsonFile, writeJsonFile, ensureDir, nowIso, dirSize } from '../core/paths';
import { getVaultConfig, requireVaultRoot } from '../core/vault';
import { logAction } from '../log/logger';

/**
 * 回收站：.uniarchive/recycle/<recycleId>/...
 * 删除操作永不直接抹除用户文件，保留 30 天（可配置）后由 purge 清理。
 */

interface RecycleMeta {
  recycleId: string;
  kind: 'archive' | 'attachment';
  title: string;
  originalPath: string; // 相对 Vault 根
  archiveId?: string;
  deletedAt: string;
  expireAt: string;
}

function metaFile(root: string, recycleId: string): string {
  return path.join(recycleDir(root, recycleId), 'meta.json');
}

export interface MoveToRecycleInput {
  path: string;
  kind: 'archive' | 'attachment';
  title: string;
  archiveId?: string;
}

/** 把文件/目录移入回收站，返回 recycleId */
export function moveToRecycle(input: MoveToRecycleInput): string {
  const root = requireVaultRoot();
  if (!fs.existsSync(input.path)) throw new Error(`待删除文件不存在：${input.path}`);
  const recycleId = uuidv4();
  const target = recycleDir(root, recycleId);
  ensureDir(target);

  const originalPath = path.relative(root, input.path).split(path.sep).join('/');
  const ttl = getVaultConfig().recycleTtlDays;
  const deletedAt = new Date();
  const expireAt = new Date(deletedAt.getTime() + ttl * 24 * 60 * 60 * 1000);
  const meta: RecycleMeta = {
    recycleId,
    kind: input.kind,
    title: input.title,
    originalPath,
    archiveId: input.archiveId,
    deletedAt: deletedAt.toISOString(),
    expireAt: expireAt.toISOString()
  };

  const stat = fs.statSync(input.path);
  const dest = path.join(target, path.basename(input.path));
  if (stat.isDirectory()) {
    fs.cpSync(input.path, dest, { recursive: true });
    fs.rmSync(input.path, { recursive: true, force: true });
  } else {
    fs.renameSync(input.path, dest);
  }
  writeJsonFile(metaFile(root, recycleId), meta);
  return recycleId;
}

export function listRecycle(): RecycleItem[] {
  const root = requireVaultRoot();
  const dir = vaultPaths(root).recycle;
  if (!fs.existsSync(dir)) return [];
  const out: RecycleItem[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = readJsonFile<RecycleMeta | null>(metaFile(root, entry.name), null);
    if (!meta) continue;
    out.push({
      recycleId: meta.recycleId,
      kind: meta.kind,
      title: meta.title,
      originalPath: meta.originalPath,
      archiveId: meta.archiveId,
      deletedAt: meta.deletedAt,
      expireAt: meta.expireAt,
      size: dirSize(path.join(dir, entry.name))
    });
  }
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** 还原：回到原路径；若原路径已被占用则追加 .restored-<时间戳> */
export function restoreFromRecycle(recycleId: string): { restoredPath: string } {
  const root = requireVaultRoot();
  const meta = readJsonFile<RecycleMeta | null>(metaFile(root, recycleId), null);
  if (!meta) throw new Error(`回收站条目不存在：${recycleId}`);
  const src = path.join(recycleDir(root, recycleId), path.basename(meta.originalPath));
  if (!fs.existsSync(src)) throw new Error('回收站中的文件已丢失，无法还原');

  let target = path.resolve(root, meta.originalPath.split('/').join(path.sep));
  ensureDir(path.dirname(target));
  if (fs.existsSync(target)) {
    target = `${target}.restored-${Date.now()}`;
  }
  fs.cpSync(src, target, { recursive: true });
  fs.rmSync(recycleDir(root, recycleId), { recursive: true, force: true });

  logAction({
    action: 'recycle.restore',
    target: meta.archiveId ?? recycleId,
    detail: meta.originalPath
  });
  return { restoredPath: path.relative(root, target).split(path.sep).join('/') };
}

/** 彻底删除单个条目 */
export function purgeRecycleItem(recycleId: string): void {
  const root = requireVaultRoot();
  const dir = recycleDir(root, recycleId);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
  logAction({ action: 'recycle.purge', target: recycleId });
}

/** 清理过期条目（默认 30 天） */
export function purgeExpired(ttlDays?: number): number {
  const ttl = ttlDays ?? getVaultConfig().recycleTtlDays;
  const now = Date.now();
  let n = 0;
  for (const item of listRecycle()) {
    if (new Date(item.expireAt).getTime() <= now) {
      purgeRecycleItem(item.recycleId);
      n += 1;
    }
  }
  return n;
}

/** 清空回收站 */
export function purgeAll(): number {
  const items = listRecycle();
  for (const item of items) purgeRecycleItem(item.recycleId);
  return items.length;
}

export { nowIso };
