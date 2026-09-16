import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault, openVault, closeVault, reindexVault } from '../../src/main/core/vault';
import { searchArchives } from '../../src/main/db/fts';
import { setLogVaultRoot } from '../../src/main/log/logger';
import { CATEGORIES } from '@shared/constants';
import type { ArchiveFrontmatter } from '@shared/types';

/**
 * 性能测试：生成 10 万条模拟档案，检索 ≤0.5s（规格书 10.3 / 11）。
 * 直接批量写入 Markdown 后一次性重建索引，模拟真实大规模档案库。
 */

const TOTAL = Number(process.env.UEAP_PERF_TOTAL ?? 100000);
let root: string;

function writeArchive(dir: string, fm: ArchiveFrontmatter, body: string): void {
  const yaml = [
    '---',
    `id: ${fm.id}`,
    `title: ${fm.title}`,
    `category: ${fm.category}`,
    `type: ${fm.type ?? '证书'}`,
    `date: ${fm.date ?? ''}`.trim(),
    'tags:',
    ...fm.tags.map((t) => `  - ${t}`),
    `issuer: ${fm.issuer ?? ''}`.trim(),
    `level: ${fm.level ?? ''}`.trim(),
    'files: []',
    `sensitive: ${fm.sensitive}`,
    `version: ${fm.version}`,
    `created_at: ${fm.created_at}`,
    `updated_at: ${fm.updated_at}`,
    '---',
    '',
    body
  ].join('\n');
  fs.writeFileSync(path.join(dir, `${fm.id}.md`), yaml, 'utf8');
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-perf-'));
  createVault({ targetPath: root, name: '性能档案库' });
  setLogVaultRoot(root);

  const archivesRoot = path.join(root, 'archives');
  for (let i = 0; i < TOTAL; i += 1) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const [top, sub] = category.split('/');
    const dir = path.join(archivesRoot, top, sub);
    fs.mkdirSync(dir, { recursive: true });
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const year = 2019 + (i % 7);
    writeArchive(
      dir,
      {
        id,
        title: `模拟档案 ${i} 号${i % 10 === 0 ? ' 评优专项' : ''}`,
        category: category as ArchiveFrontmatter['category'],
        type: i % 3 === 0 ? '证书' : '证明',
        date: `${year}-${String((i % 12) + 1).padStart(2, '0')}-01`,
        tags: i % 2 === 0 ? ['竞赛', '评优'] : ['科研'],
        issuer: '模拟大学',
        level: i % 5 === 0 ? '国家级' : '校级',
        files: [],
        sensitive: false,
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      },
      `这是第 ${i} 篇模拟档案的正文，用于验证全文检索性能。评优 竞赛 科研 关键词。`
    );
  }

  openVault(root);
  reindexVault();
}, 600000);

afterAll(() => {
  closeVault();
  setLogVaultRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('performance', () => {
  it(`10 万条档案重建索引后，中文关键词检索 ≤0.5s`, () => {
    const r = searchArchives({ keyword: '评优', limit: 20 });
    expect(r.total).toBeGreaterThan(0);
    expect(r.tookMs).toBeLessThanOrEqual(500);
  });

  it('组合筛选（分类 + 标签 + 日期范围）≤0.5s', () => {
    const r = searchArchives({
      category: CATEGORIES[0],
      tags: ['竞赛'],
      dateFrom: '2020-01-01',
      dateTo: '2023-12-31',
      limit: 20
    });
    expect(r.tookMs).toBeLessThanOrEqual(500);
  });

  it('英文 / 数字关键词检索 ≤0.5s', () => {
    const r = searchArchives({ keyword: '模拟档案 12345', limit: 20 });
    expect(r.tookMs).toBeLessThanOrEqual(500);
  });

  it('无关键词的全量分页查询 ≤0.5s', () => {
    const r = searchArchives({ limit: 50, offset: Math.max(0, Math.floor(TOTAL / 2)) });
    expect(r.hits).toHaveLength(50);
    expect(r.total).toBe(TOTAL);
    expect(r.tookMs).toBeLessThanOrEqual(500);
  });
});
