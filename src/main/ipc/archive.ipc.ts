import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import {
  createArchive,
  getArchive,
  updateArchive,
  deleteArchive,
  listArchives,
  loadArchives
} from '../core/archive';
import type { Archive, ArchiveListItem, ArchiveListFilter } from '@shared/types';
import type { CreateArchiveInput, UpdateArchiveInput } from '../core/archive';

export function registerArchiveIpc(): void {
  handle<Archive>(IPC.ARCHIVE_CREATE, (payload) => createArchive(payload as CreateArchiveInput));

  handle<Archive | null>(IPC.ARCHIVE_GET, (payload) => {
    const p = payload as { id: string };
    return getArchive(p.id);
  });

  handle<Archive>(IPC.ARCHIVE_UPDATE, (payload) => {
    const p = payload as { id: string; patch: UpdateArchiveInput };
    return updateArchive(p.id, p.patch);
  });

  /** 删除：支持单篇（id）与批量（ids），统一进入回收站 */
  handle<{ deleted: number; recycleId?: string }>(IPC.ARCHIVE_DELETE, (payload) => {
    const p = payload as { ids?: string[]; id?: string };
    if (p.ids && Array.isArray(p.ids)) {
      let deleted = 0;
      for (const id of p.ids) {
        try {
          deleteArchive(id);
          deleted += 1;
        } catch {
          /* 单篇失败不影响其它 */
        }
      }
      return { deleted };
    }
    if (p.id) {
      const res = deleteArchive(p.id);
      return { deleted: 1, recycleId: res.recycleId };
    }
    return { deleted: 0 };
  });

  handle<{ items: ArchiveListItem[]; total: number }>(IPC.ARCHIVE_LIST, (payload) =>
    listArchives((payload ?? {}) as ArchiveListFilter)
  );

  /** 供导出范围选择：返回全部档案的精简列表 */
  handle<ArchiveListItem[]>('archive:listAll', () =>
    loadArchives().map((a) => ({
      id: a.frontmatter.id,
      title: a.frontmatter.title,
      category: a.frontmatter.category,
      type: a.frontmatter.type,
      date: a.frontmatter.date,
      issuer: a.frontmatter.issuer,
      level: a.frontmatter.level,
      sensitive: a.frontmatter.sensitive,
      version: a.frontmatter.version,
      filePath: a.filePath,
      tags: a.frontmatter.tags,
      attachmentCount: a.frontmatter.files.length,
      created_at: a.frontmatter.created_at,
      updated_at: a.frontmatter.updated_at
    }))
  );
}
