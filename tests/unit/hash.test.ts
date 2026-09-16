import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { sha256Text, sha256Buffer, sha256File, sha256Files, formatChecksums, parseChecksums, verifyChecksums } from '../../src/main/core/hash';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-hash-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('hash', () => {
  it('sha256 与 node crypto 结果一致', () => {
    const text = 'UniArchive';
    const expected = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    expect(sha256Text(text)).toBe(expected);
    expect(sha256Buffer(Buffer.from(text, 'utf8'))).toBe(expected);
  });

  it('文件 sha256 与内容 sha256 一致（含大文件分块）', () => {
    const file = path.join(dir, 'big.bin');
    const content = crypto.randomBytes(1024 * 512 + 17);
    fs.writeFileSync(file, content);
    expect(sha256File(file)).toBe(crypto.createHash('sha256').update(content).digest('hex'));
  });

  it('空字符串也有稳定摘要', () => {
    expect(sha256Text('')).toBe(crypto.createHash('sha256').update('').digest('hex'));
  });

  it('聚合摘要对文件顺序不敏感', () => {
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    fs.writeFileSync(a, 'a');
    fs.writeFileSync(b, 'b');
    expect(sha256Files([a, b])).toBe(sha256Files([b, a]));
  });

  it('checksums 文本格式化与解析往返一致', () => {
    const entries = [
      { hash: 'a'.repeat(64), path: 'vault/archives/a.md' },
      { hash: 'b'.repeat(64), path: 'vault/assets/2026/09/x.pdf' }
    ];
    const text = formatChecksums(entries);
    expect(text.split('\n')[0]).toBe(`${'a'.repeat(64)}  vault/archives/a.md`);
    expect(parseChecksums(text)).toEqual(entries);
  });

  it('内容被篡改时校验失败', () => {
    const file = path.join(dir, 'x.txt');
    fs.writeFileSync(file, 'original');
    const entries = [{ hash: sha256File(file), path: 'x.txt' }];
    fs.writeFileSync(file, 'tampered');
    const bad = verifyChecksums(entries, (p) => fs.readFileSync(path.join(dir, p)));
    expect(bad).toEqual(['x.txt']);
  });

  it('内容未变时校验通过', () => {
    const file = path.join(dir, 'y.txt');
    fs.writeFileSync(file, 'hello');
    const entries = [{ hash: sha256File(file), path: 'y.txt' }];
    expect(verifyChecksums(entries, (p) => fs.readFileSync(path.join(dir, p)))).toEqual([]);
  });
});
