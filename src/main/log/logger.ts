import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { AppSettings, LogAction, LogEntry } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { logFile, appSettingsFile, ensureDir, readJsonFile, writeJsonFile, atomicWriteFile } from '../core/paths';
import { getDb, isDbOpen } from '../db';

/**
 * 操作日志：所有写操作都会落盘。
 * - JSONL：.uniarchive/logs/YYYY-MM.jsonl（纯文本，可被外部工具读取）
 * - SQLite logs 表：供 UI 快速筛选
 */

let vaultRoot: string | null = null;

export function setLogVaultRoot(root: string | null): void {
  vaultRoot = root;
}

export interface LogInput {
  action: LogAction;
  target?: string;
  detail?: string;
  /** 未打开 Vault 时（如创建 Vault 过程中）显式指定根目录 */
  vaultRoot?: string;
  timestamp?: string;
}

export function logAction(input: LogInput): LogEntry {
  const entry: LogEntry = {
    id: uuidv4(),
    action: input.action,
    target: input.target,
    detail: input.detail,
    timestamp: input.timestamp ?? new Date().toISOString()
  };

  const root = input.vaultRoot ?? vaultRoot;
  if (root) {
    try {
      // 1) JSONL 追加
      const file = logFile(root, new Date(entry.timestamp));
      ensureDir(path.dirname(file));
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      /* 日志失败不影响主流程 */
    }
    try {
      // 2) SQLite（仅当日志目标就是当前打开的档案库，避免跨库写入）
      if (isDbOpen() && root === vaultRoot) {
        getDb()
          .prepare('INSERT INTO logs (id, action, target, detail, timestamp) VALUES (?, ?, ?, ?, ?)')
          .run(entry.id, entry.action, entry.target ?? null, entry.detail ?? null, entry.timestamp);
      }
    } catch {
      /* 忽略 */
    }
  }
  return entry;
}

export interface LogFilter {
  action?: string;
  keyword?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function listLogs(filter: LogFilter = {}): { entries: LogEntry[]; total: number } {
  if (!isDbOpen()) return { entries: [], total: 0 };
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.action) {
    where.push('action = ?');
    params.push(filter.action);
  }
  if (filter.keyword) {
    where.push('(target LIKE ? OR detail LIKE ? OR action LIKE ?)');
    params.push(`%${filter.keyword}%`, `%${filter.keyword}%`, `%${filter.keyword}%`);
  }
  if (filter.from) {
    where.push('timestamp >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('timestamp <= ?');
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM logs ${whereSql}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM logs ${whereSql} ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(filter.limit ?? 200, 2000), filter.offset ?? 0) as LogEntry[];
  return { entries: rows, total };
}

/** 导出日志为 JSON 文件 */
export function exportLogs(outputPath: string, filter: LogFilter = {}): string {
  const { entries } = listLogs({ ...filter, limit: 100000 });
  atomicWriteFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`);
  return outputPath;
}

/** 从 JSONL 重建 logs 表（索引可重建原则） */
export function rebuildLogsFromDisk(root: string): number {
  if (!isDbOpen()) return 0;
  const db = getDb();
  db.exec('DELETE FROM logs');
  const dir = path.dirname(logFile(root));
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO logs (id, action, target, detail, timestamp) VALUES (?, ?, ?, ?, ?)'
  );
  let n = 0;
  const tx = db.transaction(() => {
    for (const f of files) {
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const e = JSON.parse(line) as LogEntry;
          insert.run(e.id, e.action, e.target ?? null, e.detail ?? null, e.timestamp);
          n += 1;
        } catch {
          /* 跳过损坏行 */
        }
      }
    }
  });
  tx();
  return n;
}

/* 应用级设置（userData/settings.json）——DECISION: 目录结构固定，读写逻辑放于 logger 同级复用 */
export function readAppSettings<T>(file: string, fallback: T): T {
  return readJsonFile<T>(file, fallback);
}

export function writeAppSettings(file: string, value: unknown): void {
  writeJsonFile(file, value);
}

const MAX_RECENT = 12;

export function addRecentVault(entry: { path: string; name: string }): AppSettings {
  const file = appSettingsFile();
  const settings = readJsonFile<AppSettings>(file, { ...DEFAULT_SETTINGS });
  const rest = settings.recentVaults.filter((v) => v.path !== entry.path);
  settings.recentVaults = [{ ...entry, lastOpenedAt: new Date().toISOString() }, ...rest].slice(0, MAX_RECENT);
  settings.lastVaultPath = entry.path;
  writeJsonFile(file, settings);
  return settings;
}
