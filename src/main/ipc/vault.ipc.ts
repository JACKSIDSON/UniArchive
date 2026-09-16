import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import {
  createVault,
  openVault,
  closeVault,
  getVaultInfo,
  validateVault,
  reindexVault,
  purgeIndex,
  requireVaultRoot
} from '../core/vault';
import { setLogVaultRoot, rebuildLogsFromDisk, addRecentVault } from '../log/logger';
import { loadPlugins } from '../plugin/loader';
import { maybeAutoBackup } from '../backup/backup';
import type { VaultIssue, VaultInfo, VaultMeta } from '@shared/types';

interface CreateVaultPayload {
  targetPath: string;
  name?: string;
  /** 是否在创建后直接打开（默认 true） */
  open?: boolean;
}

interface OpenVaultPayload {
  path: string;
}

function afterOpen(root: string, name: string): void {
  rebuildLogsFromDisk(root);
  loadPlugins();
  maybeAutoBackup();
  addRecentVault({ path: root, name });
}

export function registerVaultIpc(): void {
  handle<{ meta: VaultMeta; opened: boolean }>(IPC.VAULT_CREATE, (payload) => {
    const p = payload as CreateVaultPayload;
    const meta = createVault({ targetPath: p.targetPath, name: p.name });
    let opened = false;
    if (p.open !== false) {
      setLogVaultRoot(p.targetPath);
      openVault(p.targetPath);
      afterOpen(p.targetPath, meta.name);
      opened = true;
    }
    return { meta, opened };
  });

  handle<VaultMeta>(IPC.VAULT_OPEN, (payload) => {
    const p = payload as OpenVaultPayload;
    setLogVaultRoot(p.path);
    const meta = openVault(p.path);
    afterOpen(p.path, meta.name);
    return meta;
  });

  handle<boolean>(IPC.VAULT_CLOSE, () => {
    closeVault();
    setLogVaultRoot(null);
    return true;
  });

  handle<VaultInfo>(IPC.VAULT_INFO, () => getVaultInfo());

  handle<VaultIssue[]>(IPC.VAULT_VALIDATE, (payload) => {
    const p = payload as { path?: string } | undefined;
    return validateVault(p?.path);
  });

  /**
   * 重建索引。payload.purge = true 时先删除 index.db 再重建，
   * 用于验证「索引是可丢弃的派生数据」这一不变量。
   */
  handle<{ archives: number; tookMs: number }>(IPC.VAULT_REINDEX, (payload) => {
    const p = (payload ?? {}) as { purge?: boolean };
    if (!p.purge) return reindexVault();
    const root = requireVaultRoot();
    purgeIndex();
    setLogVaultRoot(root);
    openVault(root);
    return reindexVault();
  });
}
