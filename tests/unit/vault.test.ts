import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createVault, openVault, closeVault, getVaultInfo, validateVault, reindexVault, purgeIndex } from '../../src/main/core/vault';
import { createArchive, getArchive, updateArchive, deleteArchive, listArchives } from '../../src/main/core/archive';
import { addAttachment, listAttachments, deleteAttachment } from '../../src/main/core/attachment';
import { searchArchives } from '../../src/main/db/fts';
import { listRecycle, restoreFromRecycle } from '../../src/main/recycle/recycle';
import { setLogVaultRoot } from '../../src/main/log/logger';
import { vaultPaths } from '../../src/main/core/paths';
import { exportUeap } from '../../src/main/export/ueap';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-vault-'));
  createVault({ targetPath: root, name: '测试档案库' });
  setLogVaultRoot(root);
  openVault(root);
});

afterEach(() => {
  closeVault();
  setLogVaultRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('vault', () => {
  it('新建 Vault 生成完整目录树', () => {
    const p = vaultPaths(root);
    for (const d of [p.archives, p.assets, p.uniarchive, p.templates, p.plugins, p.themes, p.backups, p.logs, p.recycle]) {
      expect(fs.existsSync(d)).toBe(true);
    }
    expect(fs.existsSync(p.vaultJson)).toBe(true);
    expect(fs.existsSync(p.readme)).toBe(true);
    expect(fs.existsSync(p.configJson)).toBe(true);
    expect(fs.existsSync(p.tagsJson)).toBe(true);
    expect(fs.existsSync(path.join(p.archives, '荣誉实践', '学科竞赛'))).toBe(true);
  });

  it('vault.json 字段完整', () => {
    const meta = JSON.parse(fs.readFileSync(vaultPaths(root).vaultJson, 'utf8'));
    expect(meta.vaultId).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta.name).toBe('测试档案库');
    expect(meta.formatVersion).toBe('1.0');
  });

  it('打开已有 Vault 会校验 vault.json', () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-bad-'));
    expect(() => openVault(bad)).toThrow();
    fs.rmSync(bad, { recursive: true, force: true });
  });

  it('删除 index.db 后可重建索引且结果一致', () => {
    createArchive({ title: '索引测试档案', category: '荣誉实践/荣誉奖项', tags: ['评优'] });
    const before = searchArchives({ keyword: '索引测试档案' }).total;
    purgeIndex();
    expect(fs.existsSync(vaultPaths(root).indexDb)).toBe(false);
    openVault(root);
    reindexVault();
    const after = searchArchives({ keyword: '索引测试档案' }).total;
    expect(before).toBe(1);
    expect(after).toBe(before);
  });

  it('getVaultInfo 返回统计', () => {
    createArchive({ title: 'A', category: '学业档案/学籍档案' });
    const info = getVaultInfo();
    expect(info.name).toBe('测试档案库');
    expect(info.counts.archives).toBe(1);
    expect(info.path).toBe(root);
  });

  it('validateVault 能发现附件缺失', () => {
    const a = createArchive({ title: '缺附件', category: '生活行政/缴费凭证', files: ['assets/2026/09/not-exist.pdf'] });
    updateArchive(a.frontmatter.id, { files: ['assets/2026/09/not-exist.pdf'] });
    const issues = validateVault(root);
    expect(issues.some((i) => i.code === 'attachment-missing')).toBe(true);
  });
});

describe('archive', () => {
  it('创建档案后文件落盘且命名正确', () => {
    const a = createArchive({
      title: '校级专业竞赛二等奖',
      category: '荣誉实践/学科竞赛',
      date: '2026-09-01',
      tags: ['竞赛', '评优']
    });
    const abs = path.join(root, a.filePath.split('/').join(path.sep));
    expect(fs.existsSync(abs)).toBe(true);
    expect(path.basename(abs)).toBe('【学科竞赛】-2026.09-校级专业竞赛二等奖-竞赛,评优.md');
    expect(a.filePath.startsWith('archives/')).toBe(true);
  });

  it('Markdown 内容与规格书 5.3 格式一致', () => {
    const a = createArchive({
      title: '校级专业竞赛二等奖',
      category: '荣誉实践/学科竞赛',
      type: '证书',
      date: '2026-09-01',
      tags: ['竞赛', '评优'],
      issuer: 'XX大学',
      level: '校级',
      body: '## 备注\n测试'
    });
    const raw = fs.readFileSync(path.join(root, a.filePath.split('/').join(path.sep)), 'utf8');
    expect(raw.startsWith('---\nid: ')).toBe(true);
    expect(raw).toContain('title: 校级专业竞赛二等奖');
    expect(raw).toContain('category: 荣誉实践/学科竞赛');
    expect(raw).toContain('date: 2026-09-01');
    expect(raw).toContain('tags:\n  - 竞赛\n  - 评优');
    expect(raw).toContain('sensitive: false');
    expect(raw).toContain('version: 1');
    expect(raw).toContain('---\n\n## 备注\n测试');
  });

  it('更新档案时 updated_at 变化、version 递增', () => {
    const a = createArchive({ title: '原始标题', category: '学业档案/学籍档案' });
    const updated = updateArchive(a.frontmatter.id, { title: '新标题' });
    expect(updated.frontmatter.version).toBe(2);
    expect(updated.frontmatter.title).toBe('新标题');
    expect(updated.frontmatter.created_at).toBe(a.frontmatter.created_at);
    // 文件名随标题同步
    expect(path.basename(updated.filePath)).toContain('新标题');
  });

  it('删除档案进入回收站，且可还原', () => {
    const a = createArchive({ title: '待删除', category: '学业档案/学籍档案' });
    deleteArchive(a.frontmatter.id);
    expect(getArchive(a.frontmatter.id)).toBeNull();
    const items = listRecycle();
    expect(items).toHaveLength(1);
    restoreFromRecycle(items[0].recycleId);
    reindexVault();
    expect(getArchive(a.frontmatter.id)).not.toBeNull();
  });

  it('切换分类会移动文件目录', () => {
    const a = createArchive({ title: '换分类', category: '学业档案/学籍档案' });
    const moved = updateArchive(a.frontmatter.id, { category: '荣誉实践/荣誉奖项' });
    expect(moved.filePath).toContain('荣誉实践/荣誉奖项');
    expect(fs.existsSync(path.join(root, moved.filePath.split('/').join(path.sep)))).toBe(true);
  });

  it('列表支持分类 / 标签 / 日期范围组合筛选', () => {
    createArchive({ title: '甲', category: '荣誉实践/荣誉奖项', tags: ['评优'], date: '2026-01-01' });
    createArchive({ title: '乙', category: '荣誉实践/学科竞赛', tags: ['竞赛'], date: '2026-06-01' });
    expect(listArchives({ category: '荣誉实践/荣誉奖项' }).total).toBe(1);
    expect(listArchives({ tag: '竞赛' }).total).toBe(1);
    expect(listArchives({ dateFrom: '2026-03-01' }).total).toBe(1);
    expect(listArchives({ dateTo: '2026-03-01' }).total).toBe(1);
  });
});

describe('attachment', () => {
  it('上传同名文件不覆盖，返回已存在记录（去重）', () => {
    const a = createArchive({ title: '带附件', category: '学业档案/课程资料档案' });
    const src = path.join(root, 'source.txt');
    fs.writeFileSync(src, 'hello attachment');

    const first = addAttachment({ archiveId: a.frontmatter.id, sourcePath: src });
    expect(first.deduped).toBe(false);
    const second = addAttachment({ archiveId: a.frontmatter.id, sourcePath: src });
    expect(second.deduped).toBe(true);
    expect(second.attachment.path).toBe(first.attachment.path);
    expect(listAttachments(a.frontmatter.id)).toHaveLength(1);
  });

  it('附件按 assets/YYYY/MM 存放且文件名带 uuid', () => {
    const a = createArchive({ title: '带附件2', category: '学业档案/课程资料档案' });
    const src = path.join(root, 'doc.txt');
    fs.writeFileSync(src, 'x');
    const { attachment } = addAttachment({ archiveId: a.frontmatter.id, sourcePath: src });
    expect(attachment.path).toMatch(/^assets\/\d{4}\/\d{2}\/[0-9a-f-]{36}-doc\.txt$/);
    expect(fs.existsSync(path.join(root, attachment.path.split('/').join(path.sep)))).toBe(true);
    expect(attachment.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('删除附件进入回收站', () => {
    const a = createArchive({ title: '带附件3', category: '学业档案/课程资料档案' });
    const src = path.join(root, 'doc3.txt');
    fs.writeFileSync(src, 'y');
    const { attachment } = addAttachment({ archiveId: a.frontmatter.id, sourcePath: src });
    deleteAttachment(a.frontmatter.id, attachment.id);
    expect(fs.existsSync(path.join(root, attachment.path.split('/').join(path.sep)))).toBe(false);
    expect(listRecycle().length).toBeGreaterThan(0);
  });
});

describe('ueap 包结构', () => {
  it('导出包改名为 .zip 可直接解压，且不含 index.db / logs / backups / recycle', () => {
    createArchive({ title: '打包测试', category: '荣誉实践/荣誉奖项' });
    const out = path.join(root, 'out.ueap');
    exportUeap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: out });

    const zipPath = path.join(root, 'out.zip');
    fs.copyFileSync(out, zipPath);
    const zip = new AdmZip(zipPath);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('manifest.json');
    expect(names).toContain('checksums.sha256');
    expect(names).toContain('README.md');
    expect(names.some((n) => n.startsWith('vault/archives/'))).toBe(true);
    expect(names.some((n) => n.includes('index.db'))).toBe(false);
    expect(names.some((n) => n.includes('/logs/'))).toBe(false);
    expect(names.some((n) => n.includes('/backups/'))).toBe(false);
    expect(names.some((n) => n.includes('/recycle/'))).toBe(false);
  });
});
