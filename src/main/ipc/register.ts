import { ipcMain, dialog, shell, app } from 'electron';
import type { IpcResult } from '@shared/types';
import { IPC, SYS } from '@shared/ipc-channels';
import { APP_VERSION } from '@shared/constants';
import { registerVaultIpc } from './vault.ipc';
import { registerArchiveIpc } from './archive.ipc';
import { registerAttachmentIpc } from './attachment.ipc';
import { registerSearchIpc } from './search.ipc';
import { registerTagIpc } from './tag.ipc';
import { registerExportIpc } from './export.ipc';
import { registerImportIpc } from './import.ipc';
import { registerBackupIpc } from './backup.ipc';
import { registerRecycleIpc } from './recycle.ipc';
import { registerLogIpc } from './log.ipc';
import { registerSettingsIpc } from './settings.ipc';

/**
 * IPC 统一契约：所有通道返回 IpcResult<T>。
 */

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, detail?: unknown): IpcResult<never> {
  return { ok: false, error: { code, message, detail } };
}

type Handler<T> = (payload: unknown) => T | Promise<T>;

export function handle<T = unknown>(channel: string, fn: Handler<T>): void {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    try {
      return ok(await fn(payload));
    } catch (err) {
      const e = err as Error & { code?: string };
      return fail(e.code ?? 'INTERNAL_ERROR', e.message ?? '未知错误', process.env.NODE_ENV === 'development' ? e.stack : undefined);
    }
  });
}

export function registerIpc(): void {
  registerVaultIpc();
  registerArchiveIpc();
  registerAttachmentIpc();
  registerSearchIpc();
  registerTagIpc();
  registerExportIpc();
  registerImportIpc();
  registerBackupIpc();
  registerRecycleIpc();
  registerLogIpc();
  registerSettingsIpc();

  // 系统级通道
  handle<string>(SYS.PING, () => 'pong');
  handle<string>(SYS.APP_VERSION, () => APP_VERSION);

  handle<{ canceled: boolean; path?: string }>(SYS.OPEN_DIALOG, async (payload) => {
    const opts = (payload ?? {}) as { properties?: ('openFile' | 'openDirectory' | 'multiSelections')[]; filters?: { name: string; extensions: string[] }[] };
    const res = await dialog.showOpenDialog({
      properties: opts.properties ?? ['openDirectory'],
      filters: opts.filters
    });
    return { canceled: res.canceled, path: res.filePaths[0] };
  });

  handle<{ canceled: boolean; path?: string }>(SYS.SAVE_DIALOG, async (payload) => {
    const opts = (payload ?? {}) as { defaultPath?: string; filters?: { name: string; extensions: string[] }[] };
    const res = await dialog.showSaveDialog({
      defaultPath: opts.defaultPath,
      filters: opts.filters ?? [{ name: 'UEAP 包', extensions: ['ueap'] }]
    });
    return { canceled: res.canceled, path: res.filePath };
  });

  handle<boolean>(SYS.OPEN_PATH, async (payload) => {
    const target = String(payload ?? '');
    if (!target) return false;
    await shell.openPath(target);
    return true;
  });
}

export { IPC, app };
