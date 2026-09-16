import crypto from 'node:crypto';
import fs from 'node:fs';

/** sha256（字符串） */
export function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** sha256（Buffer） */
export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** sha256（文件，流式读取，适合大附件） */
export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let read = fs.readSync(fd, buf, 0, buf.length, null);
    while (read > 0) {
      hash.update(buf.subarray(0, read));
      read = fs.readSync(fd, buf, 0, buf.length, null);
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** sha256（目录内所有文件的聚合摘要，用于冲突检测） */
export function sha256Files(filePaths: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const p of [...filePaths].sort()) {
    hash.update(p);
    try {
      hash.update(sha256File(p));
    } catch {
      hash.update('<missing>');
    }
  }
  return hash.digest('hex');
}

/* ---------------- checksums.sha256 ---------------- */

export interface ChecksumEntry {
  hash: string;
  path: string; // 相对包内路径，统一 posix 分隔
}

export function formatChecksums(entries: ChecksumEntry[]): string {
  return entries.map((e) => `${e.hash}  ${e.path}`).join('\n') + '\n';
}

export function parseChecksums(text: string): ChecksumEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('  ');
      if (idx <= 0) return null;
      return { hash: line.slice(0, idx).trim(), path: line.slice(idx + 2).trim() };
    })
    .filter((e): e is ChecksumEntry => e !== null);
}

export function verifyChecksums(entries: ChecksumEntry[], readFile: (p: string) => Buffer): string[] {
  const bad: string[] = [];
  for (const e of entries) {
    try {
      const actual = sha256Buffer(readFile(e.path));
      if (actual.toLowerCase() !== e.hash.toLowerCase()) bad.push(e.path);
    } catch {
      bad.push(e.path);
    }
  }
  return bad;
}
