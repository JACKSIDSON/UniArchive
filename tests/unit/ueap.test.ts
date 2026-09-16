import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createVault, openVault, closeVault, reindexVault } from '../../src/main/core/vault';
import { createArchive, getArchive, loadArchives, updateArchive } from '../../src/main/core/archive';
import { addAttachment } from '../../src/main/core/attachment';
import { exportUeap } from '../../src/main/export/ueap';
import { importUeap, previewImport, openPackage, readManifest } from '../../src/main/import/ueap';
import { setLogVaultRoot } from '../../src/main/log/logger';

let vaultA: string;
let vaultB: string;

function seed(vault: string): void {
  createVault({ targetPath: vault, name: '源档案库' });
  setLogVaultRoot(vault);
  openVault(vault);
  const a = createArchive({
    title: '校级专业竞赛二等奖',
    category: '荣誉实践/学科竞赛',
    type: '证书',
    date: '2026-09-01',
    tags: ['竞赛', '评优'],
    issuer: 'XX大学',
    level: '校级',
    body: '## 备注\n可用于评优和求职材料。'
  });
  const src = path.join(vault, 'cert.txt');
  fs.writeFileSync(src, 'certificate-bytes');
  addAttachment({ archiveId: a.frontmatter.id, sourcePath: src });
  createArchive({ title: '学业成绩单', category: '学业档案/学业成绩档案', tags: ['成绩'], body: '绩点 3.8' });
  closeVault();
}

beforeEach(() => {
  vaultA = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-ueap-a-'));
  vaultB = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-ueap-b-'));
  seed(vaultA);
  // 目标档案库：先建好目录树，导入测试再往里写
  createVault({ targetPath: vaultB, name: '目标档案库' });
});

afterEach(() => {
  try {
    closeVault();
  } catch {
    /* 忽略 */
  }
  setLogVaultRoot(null);
  fs.rmSync(vaultA, { recursive: true, force: true });
  fs.rmSync(vaultB, { recursive: true, force: true });
});

describe('ueap 导出 / 导入', () => {
  it('导出→导入往返数据一致（new 模式）', () => {
    setLogVaultRoot(vaultA);
    openVault(vaultA);
    const out = path.join(vaultA, 'export.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });
    const source = loadArchives();

    setLogVaultRoot(vaultB);
    openVault(vaultB);
    const report = importUeap({
      packagePath: out,
      mode: 'new',
      conflictStrategy: 'keep-both',
      targetVaultPath: vaultB,
      snapshot: false
    });
    expect(report.created).toBe(source.length);

    reindexVault();
    const imported = loadArchives();
    expect(imported).toHaveLength(source.length);
    const titles = imported.map((a) => a.frontmatter.title).sort();
    expect(titles).toEqual(source.map((a) => a.frontmatter.title).sort());

    const target = imported.find((a) => a.frontmatter.title === '校级专业竞赛二等奖');
    const origin = source.find((a) => a.frontmatter.title === '校级专业竞赛二等奖');
    expect(target?.body).toBe(origin?.body);
    expect(target?.frontmatter.tags).toEqual(origin?.frontmatter.tags);
    expect(target?.frontmatter.files).toHaveLength(1);
    expect(fs.existsSync(path.join(vaultB, target!.frontmatter.files[0].split('/').join(path.sep)))).toBe(true);
  });

  it('manifest 字段完整且不加密时 encryption.enabled=false', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'm.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });
    const m = readManifest(out);
    expect(m.format).toBe('UEAP');
    expect(m.version).toBe('1.0');
    expect(m.app).toBe('UniArchive');
    expect(m.encryption.enabled).toBe(false);
    expect(m.encryption.algorithm).toBeNull();
    expect(m.checksums).toBe('checksums.sha256');
    expect(m.compatibility.formatVersion).toBe('1.0');
  });

  it('加密导出：正确密码可导入，错误密码失败', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'enc.ueap');
    exportUeap({
      scope: { kind: 'full' },
      includeAttachments: true,
      outputPath: out,
      encrypt: { password: 'strong-password' }
    });
    expect(readManifest(out).encryption.enabled).toBe(true);
    expect(readManifest(out).encryption.algorithm).toBe('AES-256-GCM');

    // 错误密码
    expect(() => openPackage(out, 'wrong-password')).toThrow();

    // 正确密码
    openVault(vaultB);
    const report = importUeap({
      packagePath: out,
      mode: 'merge',
      conflictStrategy: 'keep-both',
      password: 'strong-password',
      snapshot: false
    });
    expect(report.created).toBe(2);
  });

  it('校验和不匹配时导入报错', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'bad.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });

    // 篡改 checksums.sha256（ASCII 文件名，adm-zip 可稳定替换）
    const zip = new AdmZip(out);
    zip.updateFile('checksums.sha256', Buffer.from(`${'0'.repeat(64)}  vault/vault.json\n`, 'utf8'));
    zip.writeZip(out);

    expect(() => openPackage(out)).toThrow(/校验和/);
  });

  it('冲突时 keep-both 生成冲突副本', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'conflict.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });

    openVault(vaultB);
    importUeap({ packagePath: out, mode: 'merge', conflictStrategy: 'keep-both', snapshot: false });
    reindexVault();

    // 修改 B 中档案后再导入一次，制造 hash-differs 冲突
    const list = loadArchives();
    for (const a of list) {
      updateArchive(a.frontmatter.id, { body: '本地修改过的内容' });
    }
    const report = importUeap({ packagePath: out, mode: 'merge', conflictStrategy: 'keep-both', snapshot: false });
    expect(report.conflictCopies).toBeGreaterThan(0);
    reindexVault();
    expect(loadArchives().some((a) => a.frontmatter.title.includes('（冲突副本）'))).toBe(true);
  });

  it('skip 策略不会改动本地档案', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'skip.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });

    openVault(vaultB);
    importUeap({ packagePath: out, mode: 'merge', conflictStrategy: 'keep-both', snapshot: false });
    reindexVault();
    const before = loadArchives().map((a) => `${a.frontmatter.id}:${a.body}`).sort();

    const report = importUeap({ packagePath: out, mode: 'merge', conflictStrategy: 'skip', snapshot: false });
    expect(report.skipped).toBeGreaterThan(0);
    reindexVault();
    const after = loadArchives().map((a) => `${a.frontmatter.id}:${a.body}`).sort();
    expect(after).toEqual(before);
  });

  it('add-only 模式只新增不覆盖', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'addonly.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });
    openVault(vaultB);
    const r1 = importUeap({ packagePath: out, mode: 'add-only', conflictStrategy: 'skip', snapshot: false });
    expect(r1.created).toBe(2);
    const r2 = importUeap({ packagePath: out, mode: 'add-only', conflictStrategy: 'skip', snapshot: false });
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(2);
  });

  it('预览模式返回冲突与清单且不落盘', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'preview.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });
    openVault(vaultB);
    const p = previewImport(out);
    expect(p.archiveCount).toBe(2);
    expect(p.conflicts).toHaveLength(0);
    expect(p.sample).toHaveLength(2);
    expect(loadArchives()).toHaveLength(0);
  });

  it('按模板导出只包含匹配档案', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'tpl.ueap');
    exportUeap({
      scope: { kind: 'template', template: '评优' },
      includeAttachments: true,
      outputPath: out
    });
    const pkg = openPackage(out);
    const files = fs
      .readdirSync(path.join(pkg.vaultDir, 'archives', '荣誉实践', '学科竞赛'), { recursive: true })
      .filter((f) => String(f).endsWith('.md'));
    expect(files.length).toBe(1);
    expect(pkg.manifest.exportType).toBe('template:评优');
    pkg.cleanup();
  });

  it('new 模式导入后可正常读取档案', () => {
    openVault(vaultA);
    const out = path.join(vaultA, 'newmode.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });
    openVault(vaultB);
    importUeap({
      packagePath: out,
      mode: 'new',
      conflictStrategy: 'keep-both',
      targetVaultPath: vaultB,
      snapshot: false
    });
    reindexVault();
    const all = loadArchives();
    const one = all[0];
    expect(getArchive(one.frontmatter.id)).not.toBeNull();
  });
});
