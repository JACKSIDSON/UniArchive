import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { createBackup, listBackups, deleteBackup, pruneBackups } from '../backup/backup';
import { restoreBackup } from '../backup/restore';
import type { BackupItem } from '@shared/types';
import type { RestoreResult } from '../backup/restore';
import type { BackupKind } from '../backup/backup';

export function registerBackupIpc(): void {
  handle<BackupItem>(IPC.BACKUP_CREATE, (payload) => {
    const p = (payload ?? {}) as { label?: string; kind?: BackupKind; note?: string };
    return createBackup(p);
  });

  handle<BackupItem[]>(IPC.BACKUP_LIST, () => listBackups());

  handle<RestoreResult>(IPC.BACKUP_RESTORE, (payload) => {
    const p = payload as { id: string; password?: string };
    return restoreBackup(p.id, p.password);
  });

  handle<boolean>('backup:delete', (payload) => {
    const p = payload as { id: string };
    deleteBackup(p.id);
    return true;
  });

  handle<number>('backup:prune', (payload) => {
    const p = (payload ?? {}) as { keep?: number };
    return pruneBackups(p.keep ?? 20);
  });
}
