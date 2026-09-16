import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { Archive } from '@shared/types';
import {
  detectConflict,
  resolveConflict,
  archiveContentHash,
  detectAll,
  type ConflictStrategy
} from '../../src/main/import/conflict';

function makeArchive(over: Partial<Archive['frontmatter']> = {}, body = '正文'): Archive {
  return {
    frontmatter: {
      id: 'id-1',
      title: '校级竞赛二等奖',
      category: '荣誉实践/学科竞赛',
      type: '证书',
      date: '2026-09-01',
      tags: ['竞赛'],
      issuer: 'XX大学',
      level: '校级',
      files: [],
      sensitive: false,
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...over
    },
    body,
    filePath: 'archives/荣誉实践/学科竞赛/【学科竞赛】-2026.09-校级竞赛二等奖.md'
  };
}

const NOW = () => '2026-06-01T00:00:00.000Z';

describe('conflict', () => {
  it('无冲突时返回 null', () => {
    expect(detectConflict({ incoming: makeArchive() })).toBeNull();
  });

  it('同 id 内容不同 → hash-differs', () => {
    const item = detectConflict({ incoming: makeArchive({ title: '新标题' }), existing: makeArchive() });
    expect(item?.reason).toBe('hash-differs');
  });

  it('同 id 内容相同 → id-exists', () => {
    const item = detectConflict({ incoming: makeArchive(), existing: makeArchive() });
    expect(item?.reason).toBe('id-exists');
  });

  it('路径被其它档案占用 → path-conflict', () => {
    const item = detectConflict({
      incoming: makeArchive(),
      pathConflictWith: 'other-id'
    });
    expect(item?.reason).toBe('path-conflict');
  });

  it('内容摘要对正文与标签敏感', () => {
    expect(archiveContentHash(makeArchive())).not.toBe(archiveContentHash(makeArchive({}, 'x')));
    expect(archiveContentHash(makeArchive())).toBe(archiveContentHash(makeArchive()));
  });

  describe('五种策略', () => {
    const existing = makeArchive();

    it('skip：不导入', () => {
      const r = resolveConflict({ incoming: makeArchive({ title: '新' }), existing }, 'skip', NOW);
      expect(r.action).toBe('skip');
      expect(r.archive).toBeNull();
    });

    it('overwrite：覆盖且保留 created_at、版本递增', () => {
      const r = resolveConflict({ incoming: makeArchive({ title: '新' }), existing }, 'overwrite', NOW);
      expect(r.action).toBe('overwrite');
      expect(r.archive?.frontmatter.title).toBe('新');
      expect(r.archive?.frontmatter.created_at).toBe('2026-01-01T00:00:00.000Z');
      expect(r.archive?.frontmatter.version).toBe(2);
    });

    it('keep-both：生成新 id 与「（冲突副本）」标题', () => {
      const r = resolveConflict({ incoming: makeArchive(), existing }, 'keep-both', NOW);
      expect(r.action).toBe('keep-both');
      expect(r.renamed).toBe(true);
      expect(r.archive?.frontmatter.id).not.toBe('id-1');
      expect(r.archive?.frontmatter.title).toContain('（冲突副本）');
      expect(r.archive?.frontmatter.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('newer-wins：新者胜', () => {
      const newer = makeArchive({ updated_at: '2026-05-01T00:00:00.000Z' });
      const r = resolveConflict({ incoming: newer, existing }, 'newer-wins', NOW);
      expect(r.action).toBe('newer-wins');
      expect(r.archive?.frontmatter.version).toBe(2);
    });

    it('newer-wins：旧的不覆盖，等同 skip', () => {
      const older = makeArchive({ updated_at: '2025-01-01T00:00:00.000Z' });
      const r = resolveConflict({ incoming: older, existing }, 'newer-wins', NOW);
      expect(r.action).toBe('skip');
    });

    it('无已存在档案时直接写入', () => {
      for (const s of ['skip', 'overwrite', 'keep-both', 'newer-wins'] as ConflictStrategy[]) {
        const r = resolveConflict({ incoming: makeArchive() }, s, NOW);
        expect(r.action).toBe('overwrite');
      }
    });
  });

  it('批量检测', () => {
    const incoming = [makeArchive({ id: 'a' }), makeArchive({ id: 'b' })];
    const existingMap = new Map([['a', makeArchive({ id: 'a' })]]);
    const conflicts = detectAll(
      incoming,
      (id) => existingMap.get(id),
      () => undefined
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].archiveId).toBe('a');
  });

  it('UUID 唯一性（数据不变量）', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuidv4()));
    expect(ids.size).toBe(500);
  });
});
