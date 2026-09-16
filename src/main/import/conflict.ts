import { v4 as uuidv4 } from 'uuid';
import type { Archive, ConflictItem } from '@shared/types';
import { sha256Text } from '../core/hash';

/**
 * 冲突检测与策略（规格书 Phase 7）。
 * 本模块保持纯函数，便于单元测试覆盖五种策略。
 */

export type ConflictStrategy = 'skip' | 'overwrite' | 'keep-both' | 'newer-wins';

export type ResolutionAction = 'skip' | 'overwrite' | 'keep-both' | 'newer-wins';

export interface ConflictContext {
  /** 待导入档案 */
  incoming: Archive;
  /** Vault 中同 id 的档案 */
  existing?: Archive;
  /** 目标文件相对路径是否已被其它档案占用 */
  pathConflictWith?: string;
}

/** 生成稳定内容摘要（用于判断内容是否真的不同） */
export function archiveContentHash(archive: Archive): string {
  return sha256Text(
    [
      archive.frontmatter.title,
      archive.frontmatter.category,
      archive.body,
      (archive.frontmatter.files ?? []).slice().sort().join('|'),
      (archive.frontmatter.tags ?? []).slice().sort().join('|')
    ].join('\u0000')
  );
}

export function detectConflict(ctx: ConflictContext): ConflictItem | null {
  const { incoming, existing, pathConflictWith } = ctx;
  if (pathConflictWith && !existing) {
    return { archiveId: incoming.frontmatter.id, title: incoming.frontmatter.title, reason: 'path-conflict' };
  }
  if (!existing) return null;
  if (archiveContentHash(incoming) !== archiveContentHash(existing)) {
    return { archiveId: incoming.frontmatter.id, title: incoming.frontmatter.title, reason: 'hash-differs' };
  }
  return { archiveId: incoming.frontmatter.id, title: incoming.frontmatter.title, reason: 'id-exists' };
}

export interface Resolution {
  action: ResolutionAction;
  /** 最终应写入 Vault 的档案；skip 时为 null */
  archive: Archive | null;
  /** keep-both 时为 true */
  renamed: boolean;
}

/**
 * 应用冲突策略。
 * - skip        ：不导入
 * - overwrite   ：用 incoming 覆盖（保留原 created_at）
 * - keep-both   ：incoming 生成新 id 与「（冲突副本）」标题后缀
 * - newer-wins  ：比较 updated_at，新的胜出；相同则视为 skip
 */
export function resolveConflict(
  ctx: ConflictContext,
  strategy: ConflictStrategy,
  now: () => string = () => new Date().toISOString()
): Resolution {
  const { incoming, existing } = ctx;

  if (!existing) {
    return { action: 'overwrite', archive: incoming, renamed: false };
  }

  switch (strategy) {
    case 'skip':
      return { action: 'skip', archive: null, renamed: false };

    case 'overwrite':
      return {
        action: 'overwrite',
        archive: {
          ...incoming,
          frontmatter: {
            ...incoming.frontmatter,
            created_at: existing.frontmatter.created_at,
            version: Math.max(existing.frontmatter.version, incoming.frontmatter.version) + 1,
            updated_at: now()
          }
        },
        renamed: false
      };

    case 'keep-both':
      return {
        action: 'keep-both',
        archive: {
          ...incoming,
          frontmatter: {
            ...incoming.frontmatter,
            id: uuidv4(),
            title: `${incoming.frontmatter.title}（冲突副本）`,
            version: 1,
            created_at: existing.frontmatter.created_at ?? now(),
            updated_at: now()
          }
        },
        renamed: true
      };

    case 'newer-wins': {
      const incomingTime = Date.parse(incoming.frontmatter.updated_at || '0') || 0;
      const existingTime = Date.parse(existing.frontmatter.updated_at || '0') || 0;
      if (incomingTime > existingTime) {
        return {
          action: 'newer-wins',
          archive: {
            ...incoming,
            frontmatter: {
              ...incoming.frontmatter,
              created_at: existing.frontmatter.created_at,
              version: existing.frontmatter.version + 1,
              updated_at: now()
            }
          },
          renamed: false
        };
      }
      return { action: 'skip', archive: null, renamed: false };
    }

    default:
      return { action: 'skip', archive: null, renamed: false };
  }
}

/** 批量检测（导入预览用） */
export function detectAll(
  incoming: Archive[],
  findExisting: (id: string) => Archive | undefined,
  findPathOwner: (relPath: string) => string | undefined
): ConflictItem[] {
  const out: ConflictItem[] = [];
  for (const a of incoming) {
    const existing = findExisting(a.frontmatter.id);
    const owner = findPathOwner(a.filePath);
    const pathConflictWith = owner && (!existing || owner !== existing.frontmatter.id) ? owner : undefined;
    const item = detectConflict({ incoming: a, existing, pathConflictWith });
    if (item) out.push(item);
  }
  return out;
}
