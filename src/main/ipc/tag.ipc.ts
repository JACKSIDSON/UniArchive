import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { getDb } from '../db';
import { clearIndex } from '../db/fts';
import { flushTagsToJson, syncTagsFromJson, reindexVault } from '../core/vault';
import { loadArchives, updateArchive } from '../core/archive';
import type { Tag } from '@shared/types';

/**
 * 标签系统：tags.json 与 SQLite tags 表双向同步。
 */

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  builtin: number;
  count: number;
}

export interface TagWithCount extends Tag {
  count: number;
}

export function registerTagIpc(): void {
  handle<TagWithCount[]>(IPC.TAG_LIST, () => {
    const rows = getDb()
      .prepare(
        `SELECT t.id, t.name, t.color, t.builtin, COUNT(at.archive_id) AS count
         FROM tags t LEFT JOIN archive_tags at ON at.tag_id = t.id
         GROUP BY t.id ORDER BY t.builtin DESC, count DESC, t.name`
      )
      .all() as TagRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ?? undefined,
      builtin: r.builtin === 1,
      count: r.count
    }));
  });

  handle<TagWithCount>(IPC.TAG_CREATE, (payload) => {
    const p = payload as { name: string; color?: string };
    const name = p.name.trim();
    if (!name) throw new Error('标签名不能为空');
    const id = `tag-${Buffer.from(name, 'utf8').toString('hex').slice(0, 32)}`;
    getDb()
      .prepare('INSERT INTO tags (id, name, color, builtin) VALUES (?, ?, ?, 0) ON CONFLICT(name) DO UPDATE SET color = excluded.color')
      .run(id, name, p.color ?? null);
    flushTagsToJson();
    const row = getDb().prepare('SELECT id, name, color, builtin FROM tags WHERE name = ?').get(name) as TagRow;
    return { id: row.id, name: row.name, color: row.color ?? undefined, builtin: row.builtin === 1, count: 0 };
  });

  /** 删除标签：自动解除所有档案关联，并回写 tags.json */
  handle<{ removed: number }>(IPC.TAG_DELETE, (payload) => {
    const p = payload as { id?: string; name?: string };
    const db = getDb();
    const tag = p.id
      ? (db.prepare('SELECT * FROM tags WHERE id = ?').get(p.id) as TagRow | undefined)
      : (db.prepare('SELECT * FROM tags WHERE name = ?').get(p.name ?? '') as TagRow | undefined);
    if (!tag) return { removed: 0 };

    // 从所有档案的 frontmatter 中移除该标签（保证 Markdown 与索引一致）
    const archives = loadArchives();
    let touched = 0;
    for (const a of archives) {
      if (!a.frontmatter.tags.includes(tag.name)) continue;
      updateArchive(a.frontmatter.id, { tags: a.frontmatter.tags.filter((t) => t !== tag.name) });
      touched += 1;
    }
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
    flushTagsToJson();
    return { removed: touched };
  });

  /** 重命名标签 */
  handle<{ updated: number }>('tag:rename', (payload) => {
    const p = payload as { id: string; name: string };
    const db = getDb();
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(p.id) as TagRow | undefined;
    if (!tag) return { updated: 0 };
    const archives = loadArchives();
    let updated = 0;
    for (const a of archives) {
      if (!a.frontmatter.tags.includes(tag.name)) continue;
      updateArchive(a.frontmatter.id, {
        tags: a.frontmatter.tags.map((t) => (t === tag.name ? p.name : t))
      });
      updated += 1;
    }
    db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(p.name, p.id);
    flushTagsToJson();
    reindexVault();
    return { updated };
  });

  /** 从 tags.json 重新载入（双向同步的另一侧） */
  handle<Tag[]>('tag:syncFromJson', () => {
    syncTagsFromJson();
    return flushTagsToJson();
  });

  /** 批量为档案打标签 */
  handle<{ updated: number }>('tag:assign', (payload) => {
    const p = payload as { ids: string[]; name: string };
    let updated = 0;
    for (const id of p.ids) {
      const a = loadArchives([id])[0];
      if (!a) continue;
      if (a.frontmatter.tags.includes(p.name)) continue;
      updateArchive(id, { tags: [...a.frontmatter.tags, p.name] });
      updated += 1;
    }
    flushTagsToJson();
    return { updated };
  });

  /** 重建标签索引（清空 tags 表后由档案重新生成） */
  handle<{ tags: number }>('tag:rebuild', () => {
    const db = getDb();
    clearIndex();
    reindexVault();
    const n = (db.prepare('SELECT COUNT(*) AS c FROM tags').get() as { c: number }).c;
    return { tags: n };
  });
}
