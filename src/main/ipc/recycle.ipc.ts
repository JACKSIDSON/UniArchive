import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { listRecycle, restoreFromRecycle, purgeRecycleItem, purgeExpired, purgeAll } from '../recycle/recycle';
import type { RecycleItem } from '@shared/types';

export function registerRecycleIpc(): void {
  handle<RecycleItem[]>(IPC.RECYCLE_LIST, () => listRecycle());

  handle<{ restoredPath: string }>(IPC.RECYCLE_RESTORE, (payload) => {
    const p = payload as { recycleId: string };
    return restoreFromRecycle(p.recycleId);
  });

  /** 彻底删除：支持单个（recycleId）与清空（all） */
  handle<{ purged: number }>(IPC.RECYCLE_PURGE, (payload) => {
    const p = (payload ?? {}) as { recycleId?: string; all?: boolean; expiredOnly?: boolean };
    if (p.all) return { purged: purgeAll() };
    if (p.expiredOnly) return { purged: purgeExpired() };
    if (p.recycleId) {
      purgeRecycleItem(p.recycleId);
      return { purged: 1 };
    }
    return { purged: 0 };
  });
}
