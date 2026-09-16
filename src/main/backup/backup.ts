import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { BackupItem } from '@shared/types';
import { backupFile, vaultPaths, ensureDir, readJsonFile, writeJsonFile, nowIso } from '../core/paths';
import { requireVault, requireVaultRoot, getVaultConfig, updateVaultConfig } from '../core/vault';
import { exportUeap } from '../export/ueap';
import { logAction } from '../log/logger';

/**
 * 备份：备份包同样为 .ueap 格式（可被改名解压、可被导入），
 * 存放于 .uniarchive/backups/，不随普通导出分发。
 */

const INDEX_FILE = 'backups.json';

export type BackupKind = 'manual' | 'auto' | 'pre-import';

export interface CreateBackupInput {
  label?: string;
  kind?: BackupKind;
  note?: string;
}

function indexFile(): string {
  return backupFile(requireVaultRoot(), INDEX_FILE);
}

function readIndex(): BackupItem[] {
  return readJsonFile<BackupItem[]>(indexFile(), []);
}

function writeIndex(items: BackupItem[]): void {
  writeJsonFile(indexFile(), items);
}

function stamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function createBackup(input: CreateBackupInput = {}): BackupItem {
  const { meta } = requireVault();
  const root = requireVaultRoot();
  const p = vaultPaths(root);
  ensureDir(p.backups);

  const now = new Date();
  const kind = input.kind ?? 'manual';
  const safeLabel = (input.label ?? '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const fileName = `${stamp(now)}-${kind}${safeLabel ? `-${safeLabel}` : ''}.ueap`;
  const outputPath = backupFile(root, fileName);

  exportUeap({
    scope: { kind: 'full' },
    includeAttachments: true,
    outputPath
  });

  const item: BackupItem = {
    id: uuidv4(),
    name: fileName,
    createdAt: nowIso(),
    size: fs.statSync(outputPath).size,
    kind,
    vaultId: meta.vaultId,
    note: input.note
  };
  const items = [item, ...readIndex()];
  writeIndex(items);
  updateVaultConfig({ lastBackupAt: item.createdAt });

  logAction({ action: 'backup.create', target: fileName, detail: `${kind}｜${(item.size / 1024).toFixed(1)} KB` });
  return item;
}

/** 导入前快照（供 import 模块通过 provider 调用） */
export function createSnapshot(label: string): string {
  return createBackup({ label, kind: 'pre-import', note: label }).id;
}

export function listBackups(): BackupItem[] {
  const root = requireVaultRoot();
  const items = readIndex().filter((b) => fs.existsSync(backupFile(root, b.name)));
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackupPath(id: string): string {
  const item = readIndex().find((b) => b.id === id);
  if (!item) throw new Error(`备份不存在：${id}`);
  return backupFile(requireVaultRoot(), item.name);
}

export function deleteBackup(id: string): void {
  const root = requireVaultRoot();
  const items = readIndex();
  const item = items.find((b) => b.id === id);
  if (!item) return;
  const file = backupFile(root, item.name);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  writeIndex(items.filter((b) => b.id !== id));
}

/** 自动备份：按配置间隔判断是否过期 */
export function maybeAutoBackup(): BackupItem | null {
  const cfg = getVaultConfig();
  if (!cfg.autoBackup) return null;
  const last = cfg.lastBackupAt ? Date.parse(cfg.lastBackupAt) : 0;
  const interval = Math.max(1, cfg.autoBackupIntervalDays) * 24 * 60 * 60 * 1000;
  if (Date.now() - last < interval) return null;
  return createBackup({ kind: 'auto', note: '自动备份' });
}

/** 保留最近 N 份备份，删除更旧的（防止无限增长） */
export function pruneBackups(keep = 20): number {
  const items = listBackups();
  let n = 0;
  for (const item of items.slice(keep)) {
    deleteBackup(item.id);
    n += 1;
  }
  return n;
}

export { path as nodePath };
