#!/usr/bin/env node
/**
 * 在 Node ABI 与 Electron ABI 的 better-sqlite3 预编译产物之间切换。
 *
 * 背景：better-sqlite3 是原生模块，其 .node 文件与「运行时 ABI」严格绑定：
 *   - 系统 Node 22  → NODE_MODULE_VERSION 127
 *   - Electron 30   → NODE_MODULE_VERSION 123
 * 二者不可能同时满足，所以本项目把两份预编译产物都缓存在 .abi/ 下，
 * 由本脚本按当前任务（跑单测 / 跑应用）切换到对应的一份。
 *
 * 用法：
 *   node scripts/use-abi.mjs node       # 供 vitest 使用（系统 Node）
 *   node scripts/use-abi.mjs electron   # 供 electron-vite dev / 打包使用
 *   node scripts/use-abi.mjs save <dir> # 把当前生效的 .node 存回缓存
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const CACHE = path.join(root, '.abi');

const which = process.argv[2];

if (which === 'save') {
  const dest = process.argv[3];
  if (!dest) {
    console.error('[use-abi] 缺少保存目标目录：node scripts/use-abi.mjs save <dir>');
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(TARGET, path.join(dest, 'better_sqlite3.node'));
  console.log(`[use-abi] 当前 .node 已保存到 ${path.relative(root, dest)}`);
  process.exit(0);
}

if (which !== 'node' && which !== 'electron') {
  console.error('[use-abi] 用法：node scripts/use-abi.mjs <node|electron|save>');
  process.exit(1);
}

const src = path.join(CACHE, which, 'better_sqlite3.node');
if (!fs.existsSync(src)) {
  console.error(`[use-abi] 找不到 ${which} 版预编译产物：${path.relative(root, src)}`);
  console.error('[use-abi] 请参考 docs/dev-notes.md「原生模块 ABI」一节重新获取。');
  process.exit(1);
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.copyFileSync(src, TARGET);
console.log(`[use-abi] 已切换到 ${which} ABI → ${path.relative(root, TARGET)}`);
