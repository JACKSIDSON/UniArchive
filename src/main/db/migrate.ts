import { getDb } from './index';
import { ensureFts } from './fts';

/**
 * schema 版本管理。索引是派生数据，迁移只需保证结构最新即可。
 * DECISION: 使用 SQLite user_version 记录结构版本；若版本落后则按 migrations 逐级升级。
 */

export const SCHEMA_VERSION = 1;

interface Migration {
  from: number;
  to: number;
  up: (sql: (s: string) => void) => void;
}

const MIGRATIONS: Migration[] = [
  // 未来版本在此追加，例如：
  // { from: 1, to: 2, up: (exec) => exec('ALTER TABLE archives ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;') }
];

export function currentVersion(): number {
  const row = getDb().prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

export function setVersion(v: number): void {
  getDb().pragma(`user_version = ${v}`);
}

/** 执行迁移，返回最终版本号 */
export function migrate(): number {
  const db = getDb();
  let version = currentVersion();
  if (version === 0) {
    // 结构已由 schema.sql 的 CREATE TABLE IF NOT EXISTS 建立
    setVersion(SCHEMA_VERSION);
    version = SCHEMA_VERSION;
  }
  while (true) {
    const next = MIGRATIONS.find((m) => m.from === version);
    if (!next) break;
    const exec = (s: string): void => {
      db.exec(s);
    };
    db.transaction(() => {
      next.up(exec);
      setVersion(next.to);
    })();
    version = next.to;
  }
  // FTS 适配（中文二元组索引，详见 fts.ts 的 DECISION 说明）
  ensureFts();
  return version;
}
