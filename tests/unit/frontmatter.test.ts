import { describe, it, expect } from 'vitest';
import { parseArchiveFile, serializeArchiveFile, dumpFrontmatter, normalizeFrontmatter } from '../../src/main/core/frontmatter';
import type { ArchiveFrontmatter } from '@shared/types';

const SAMPLE_MD = `---
id: 8f3c2a1e-1111-2222-3333-444455556666
title: 校级专业竞赛二等奖
category: 荣誉实践/学科竞赛
type: 证书
date: 2026-09-01
tags:
  - 竞赛
  - 评优
issuer: XX大学
level: 校级
files:
  - assets/2026/09/8f3c2a1e-证书.pdf
sensitive: false
version: 1
created_at: 2026-09-12T10:00:00+08:00
updated_at: 2026-09-12T10:00:00+08:00
---

## 备注
校级专业竞赛二等奖，可用于评优和求职材料。
`;

const fm: ArchiveFrontmatter = {
  id: '8f3c2a1e-1111-2222-3333-444455556666',
  title: '校级专业竞赛二等奖',
  category: '荣誉实践/学科竞赛',
  type: '证书',
  date: '2026-09-01',
  tags: ['竞赛', '评优'],
  issuer: 'XX大学',
  level: '校级',
  files: ['assets/2026/09/8f3c2a1e-证书.pdf'],
  sensitive: false,
  version: 1,
  created_at: '2026-09-12T10:00:00+08:00',
  updated_at: '2026-09-12T10:00:00+08:00'
};

describe('frontmatter', () => {
  it('解析示例 Markdown，字段与类型正确', () => {
    const parsed = parseArchiveFile(SAMPLE_MD);
    expect(parsed.frontmatter.id).toBe(fm.id);
    expect(parsed.frontmatter.title).toBe('校级专业竞赛二等奖');
    expect(parsed.frontmatter.category).toBe('荣誉实践/学科竞赛');
    expect(parsed.frontmatter.tags).toEqual(['竞赛', '评优']);
    expect(parsed.frontmatter.files).toEqual(['assets/2026/09/8f3c2a1e-证书.pdf']);
    expect(parsed.frontmatter.sensitive).toBe(false);
    expect(parsed.frontmatter.version).toBe(1);
    expect(parsed.body).toContain('校级专业竞赛二等奖，可用于评优和求职材料。');
  });

  it('date 保持字符串，不被 YAML 转成 Date 对象', () => {
    const parsed = parseArchiveFile(SAMPLE_MD);
    expect(typeof parsed.frontmatter.date).toBe('string');
    expect(parsed.frontmatter.date).toBe('2026-09-01');
    expect(typeof parsed.frontmatter.created_at).toBe('string');
  });

  it('序列化 → 解析 往返一致', () => {
    const text = serializeArchiveFile(fm, '## 备注\n往返测试\n');
    const parsed = parseArchiveFile(text);
    expect(parsed.frontmatter).toEqual({ ...fm, files: fm.files, tags: fm.tags });
    expect(parsed.body).toBe('## 备注\n往返测试\n');
  });

  it('多次序列化结果稳定（幂等）', () => {
    const a = serializeArchiveFile(fm, 'body');
    const b = serializeArchiveFile(parseArchiveFile(a).frontmatter, 'body');
    expect(a).toBe(b);
  });

  it('输出顺序与规格书 5.3 一致', () => {
    const yaml = dumpFrontmatter(fm as unknown as Record<string, unknown>);
    const keys = yaml
      .split('\n')
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter(Boolean) as string[];
    expect(keys.slice(0, 6)).toEqual(['id', 'title', 'category', 'type', 'date', 'tags']);
    expect(keys).toContain('sensitive');
    expect(keys).toContain('updated_at');
  });

  it('缺失字段自动补齐默认值', () => {
    const n = normalizeFrontmatter({ id: 'x', title: 't' });
    expect(n.category).toBe('学业档案/学籍档案');
    expect(n.tags).toEqual([]);
    expect(n.files).toEqual([]);
    expect(n.sensitive).toBe(false);
    expect(n.version).toBe(1);
    expect(typeof n.created_at).toBe('string');
  });

  it('extra 字段会被保留', () => {
    const n = normalizeFrontmatter({ id: 'x', title: 't', custom: 42 });
    expect(n.extra).toEqual({ custom: 42 });
  });
});
