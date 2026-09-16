import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { vaultPaths } from '../core/paths';
// DECISION: 用 Vite 的 ?raw 把 schema.sql 内联进产物，dev / build / vitest 三端行为一致，
// 避免运行时依赖 __dirname 下的文件布局。
import schemaSql from './schema.sql?raw';

/**
 * SQLite 连接管理。索引是可删除重建的派生数据，不锁定用户数据。
 */

let db: DatabaseType | null = null;
let dbPath: string | null = null;

export function getDb(): DatabaseType {
  if (!db) throw new Error('数据库尚未打开');
  return db;
}

export function currentDbPath(): string | null {
  return dbPath;
}

export function isDbOpen(): boolean {
  return db !== null;
}

export function openDatabase(vaultRoot: string): DatabaseType {
  const p = vaultPaths(vaultRoot);
  fs.mkdirSync(p.uniarchive, { recursive: true });
  if (db) closeDatabase();
  db = new Database(p.indexDb);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
  dbPath = p.indexDb;
  return db;
}

export function closeDatabase(): void {
  try {
    db?.close();
  } catch {
    /* 忽略关闭异常 */
  }
  db = null;
  dbPath = null;
}

/** 删除 index.db（含 WAL/SHM 副文件）——索引可随时重建 */
export function deleteIndex(vaultRoot: string): void {
  closeDatabase();
  const p = vaultPaths(vaultRoot).indexDb;
  for (const f of [p, `${p}-wal`, `${p}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
}
