import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sanitizeFileName,
  buildArchiveFileName,
  dedupeFileName,
  buildAttachmentFileName,
  categoryBadge,
  dateToken
} from '../../src/main/core/naming';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-naming-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('naming', () => {
  it('非法字符被替换为下划线', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('生成档案文件名符合【二级分类】-YYYY.MM-标题-标签.md', () => {
    const name = buildArchiveFileName({
      category: '荣誉实践/学科竞赛',
      date: '2026-09-01',
      title: '校级专业竞赛二等奖',
      tags: ['竞赛', '评优']
    });
    expect(name).toBe('【学科竞赛】-2026.09-校级专业竞赛二等奖-竞赛,评优.md');
  });

  it('标题中的非法字符也会被清理', () => {
    const name = buildArchiveFileName({
      category: '学业档案/学业成绩档案',
      date: '2026-01-05',
      title: '2025 秋季:成绩单',
      tags: []
    });
    expect(name).toBe('【学业成绩档案】-2026.01-2025 秋季_成绩单.md');
  });

  it('缺失日期时使用「未知时间」', () => {
    expect(dateToken()).toBe('未知时间');
    expect(dateToken('')).toBe('未知时间');
    expect(dateToken('2026-09-01')).toBe('2026.09');
  });

  it('分类徽章取二级分类', () => {
    expect(categoryBadge('荣誉实践/学科竞赛')).toBe('【学科竞赛】');
    expect(categoryBadge('学业档案')).toBe('【学业档案】');
  });

  it('重名追加 -1、-2', () => {
    const name = '【学科竞赛】-2026.09-标题.md';
    fs.writeFileSync(path.join(dir, name), 'x');
    expect(dedupeFileName(dir, name)).toBe('【学科竞赛】-2026.09-标题-1.md');
    fs.writeFileSync(path.join(dir, '【学科竞赛】-2026.09-标题-1.md'), 'x');
    expect(dedupeFileName(dir, name)).toBe('【学科竞赛】-2026.09-标题-2.md');
  });

  it('附件名格式为 <uuid>-<sanitized原文件名>', () => {
    const n = buildAttachmentFileName('abc-123', '成绩 单:2026.pdf');
    expect(n).toBe('abc-123-成绩 单_2026.pdf');
  });

  it('超长标题被截断到安全长度', () => {
    const name = buildArchiveFileName({
      category: '生活行政/个人证件',
      date: '2026-09-01',
      title: '长'.repeat(300),
      tags: []
    });
    expect(name.length).toBeLessThan(140);
    expect(name.endsWith('.md')).toBe(true);
  });
});
