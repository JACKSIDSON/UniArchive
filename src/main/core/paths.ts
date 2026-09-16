import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';

/**
 * 所有路径解析函数 —— 全部使用 path.join，禁止硬编码分隔符。
 */

export interface VaultPaths {
  root: string;
  vaultJson: string;
  readme: string;
  archives: string;
  assets: string;
  uniarchive: string;
  configJson: string;
  indexDb: string;
  tagsJson: string;
  templates: string;
  plugins: string;
  themes: string;
  backups: string;
  logs: string;
  recycle: string;
}

export function vaultPaths(vaultRoot: string): VaultPaths {
  const root = path.resolve(vaultRoot);
  const uni = path.join(root, '.uniarchive');
  return {
    root,
    vaultJson: path.join(root, 'vault.json'),
    readme: path.join(root, 'README.md'),
    archives: path.join(root, 'archives'),
    assets: path.join(root, 'assets'),
    uniarchive: uni,
    configJson: path.join(uni, 'config.json'),
    indexDb: path.join(uni, 'index.db'),
    tagsJson: path.join(uni, 'tags.json'),
    templates: path.join(uni, 'templates'),
    plugins: path.join(uni, 'plugins'),
    themes: path.join(uni, 'themes'),
    backups: path.join(uni, 'backups'),
    logs: path.join(uni, 'logs'),
    recycle: path.join(uni, 'recycle')
  };
}

/** 档案目录：archives/<一级分类>/<二级分类>/ */
export function archiveDir(vaultRoot: string, category: string): string {
  const [top, sub] = splitCategory(category);
  return path.join(vaultPaths(vaultRoot).archives, top, sub ?? '');
}

/** 附件目录：assets/<YYYY>/<MM>/ */
export function attachmentDir(vaultRoot: string, date: Date = new Date()): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return path.join(vaultPaths(vaultRoot).assets, yyyy, mm);
}

/** 回收站条目目录：.uniarchive/recycle/<recycleId>/ */
export function recycleDir(vaultRoot: string, recycleId: string): string {
  return path.join(vaultPaths(vaultRoot).recycle, recycleId);
}

export function backupFile(vaultRoot: string, fileName: string): string {
  return path.join(vaultPaths(vaultRoot).backups, fileName);
}

export function logFile(vaultRoot: string, date: Date = new Date()): string {
  const name = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.jsonl`;
  return path.join(vaultPaths(vaultRoot).logs, name);
}

export function splitCategory(category: string): [string, string | undefined] {
  const parts = category.split('/');
  return [parts[0] ?? '未分类', parts[1]];
}

/** 把绝对路径转成相对 Vault 根的路径（统一使用 posix 分隔符存储） */
export function toVaultRelative(vaultRoot: string, absolutePath: string): string {
  return path.relative(path.resolve(vaultRoot), path.resolve(absolutePath)).split(path.sep).join('/');
}

/** 把相对 Vault 根的路径转成绝对路径（跨平台） */
export function fromVaultRelative(vaultRoot: string, relativePath: string): string {
  return path.resolve(vaultRoot, relativePath.split('/').join(path.sep));
}

/** 确保该路径位于 Vault 内（防止 ../ 越界写入） */
export function isInsideVault(vaultRoot: string, targetPath: string): boolean {
  const rel = path.relative(path.resolve(vaultRoot), path.resolve(targetPath));
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/* ------------------------------------------------------------------ */
/* 应用级路径（Electron userData）—— DECISION: 规格书目录结构固定，          */
/* 未新增 core/settings.ts，应用级配置读写放于此处。                        */
/* ------------------------------------------------------------------ */

let injectedUserDataDir: string | undefined;

/**
 * 由主进程在 app.ready 后注入真实的 userData 目录。
 * DECISION: core 层不直接 import electron，保证单元测试可在纯 Node 环境运行。
 */
export function setUserDataDir(dir: string): void {
  injectedUserDataDir = dir;
}

export function appUserDataDir(): string {
  if (injectedUserDataDir) return injectedUserDataDir;
  if (process.env.UNIARCHIVE_USER_DATA) return process.env.UNIARCHIVE_USER_DATA;
  return path.join(os.homedir(), '.uniarchive');
}

export function appSettingsFile(): string {
  return path.join(appUserDataDir(), 'settings.json');
}

/* ------------------------------------------------------------------ */
/* 通用文件工具（原子写 / JSON / 递归遍历）                                */
/* ------------------------------------------------------------------ */

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 原子写入：先写临时文件，再 rename，防止写入中断损坏原文件。
 */
export function atomicWriteFile(target: string, data: string | Buffer): void {
  ensureDir(path.dirname(target));
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}

export async function atomicWriteFileAsync(target: string, data: string | Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, target);
}

export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(file: string, value: unknown): void {
  atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** 递归列出目录下所有文件（返回绝对路径） */
export function listFilesRecursive(dir: string, filter?: (abs: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && (!filter || filter(abs))) out.push(abs);
    }
  };
  walk(dir);
  return out;
}

export function dirSize(dir: string): number {
  let total = 0;
  for (const f of listFilesRecursive(dir)) {
    try {
      total += fs.statSync(f).size;
    } catch {
      /* 忽略无法读取的文件 */
    }
  }
  return total;
}

export function nowIso(): string {
  return new Date().toISOString();
}
