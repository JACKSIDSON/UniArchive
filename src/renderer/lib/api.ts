import type {
  AppSettings,
  Archive,
  ArchiveListItem,
  Attachment,
  AttachmentPreview,
  ConflictItem,
  IpcResult,
  ImportPreview,
  ImportReport,
  LogEntry,
  RecycleItem,
  SearchResult,
  UeapManifest,
  VaultInfo,
  VaultIssue,
  BackupItem
} from '@shared/types';
import type { UniArchiveApi } from '../../preload';

declare global {
  interface Window {
    api: UniArchiveApi;
  }
}

/**
 * 渲染进程统一入口：把 IpcResult<T> 解包为 T，失败时抛出可读错误。
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function unwrap<T>(result: IpcResult<T>): T {
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok) return result.data;
    throw new ApiError(result.error.message, result.error.code, result.error.detail);
  }
  return result as T;
}

/**
 * window.api 返回的真实结构永远是 IpcResult<T>；
 * preload 中为了书写方便把部分签名简写成了裸类型，这里统一按 IpcResult 解包。
 */
function call<T>(p: Promise<unknown>): Promise<T> {
  return p.then((r) => unwrap<T>(r as IpcResult<T>));
}

interface DialogResult {
  canceled: boolean;
  path?: string;
}

interface ReindexResult {
  archives: number;
  tookMs: number;
}

interface TagWithCount {
  id: string;
  name: string;
  color?: string;
  builtin: boolean;
  count: number;
}

interface ExportResultShape {
  outputPath: string;
  manifest: { exportType: string; exportedAt: string; encryption: { enabled: boolean } };
  archiveCount: number;
  attachmentCount: number;
  size: number;
}

interface RestoreResultShape {
  restoredArchives: number;
  restoredAssets: number;
  snapshotId: string;
}

type AddAttachmentResult =
  | { attachment: Attachment; deduped: boolean }
  | { added: Attachment[]; deduped: number };

interface VaultMetaShape {
  vaultId: string;
  name: string;
  createdAt: string;
  appVersion: string;
  formatVersion: '1.0';
}

interface DeleteResult {
  deleted: number;
  recycleId?: string;
}

export const api = {
  ping: (): Promise<string> => call<string>(window.api.ping()),
  appVersion: (): Promise<string> => call<string>(window.api.appVersion()),
  openDialog: (payload?: Parameters<UniArchiveApi['openDialog']>[0]): Promise<DialogResult> =>
    call<DialogResult>(window.api.openDialog(payload ?? {})),
  saveDialog: (payload?: Parameters<UniArchiveApi['saveDialog']>[0]): Promise<DialogResult> =>
    call<DialogResult>(window.api.saveDialog(payload ?? {})),
  openPath: (target: string): Promise<boolean> => call<boolean>(window.api.openPath(target)),
  on: window.api.on,

  vault: {
    create: (payload: { targetPath: string; name?: string; open?: boolean }) =>
      call<{ meta: VaultMetaShape; opened: boolean }>(window.api.vault.create(payload)),
    open: (path: string) => call<VaultMetaShape>(window.api.vault.open({ path })),
    close: () => call<boolean>(window.api.vault.close()),
    info: () => call<VaultInfo>(window.api.vault.info()),
    reindex: (purge = false) => call<ReindexResult>(window.api.vault.reindex({ purge })),
    validate: (path?: string) => call<VaultIssue[]>(window.api.vault.validate({ path }))
  },

  archive: {
    create: (payload: unknown) => call<Archive>(window.api.archive.create(payload)),
    get: (id: string) => call<Archive | null>(window.api.archive.get({ id })),
    update: (id: string, patch: unknown) => call<Archive>(window.api.archive.update({ id, patch })),
    remove: (payload: { id?: string; ids?: string[] }) =>
      call<DeleteResult>(window.api.archive.delete(payload)),
    list: (payload?: unknown) =>
      call<{ items: ArchiveListItem[]; total: number }>(window.api.archive.list(payload)),
    listAll: () => call<ArchiveListItem[]>(window.api.archive.listAll())
  },

  attachment: {
    add: (payload: unknown) => call<AddAttachmentResult>(window.api.attachment.add(payload)),
    remove: (archiveId: string, attachmentId: string) =>
      call<boolean>(window.api.attachment.delete({ archiveId, attachmentId })),
    preview: (payload: unknown) => call<AttachmentPreview>(window.api.attachment.preview(payload)),
    list: (archiveId: string) => call<Attachment[]>(window.api.attachment.preview({ archiveId, list: true }))
  },

  search: {
    query: (payload: unknown) => call<SearchResult>(window.api.search.query(payload))
  },

  tag: {
    list: () => call<TagWithCount[]>(window.api.tag.list()),
    create: (payload: { name: string; color?: string }) => call<TagWithCount>(window.api.tag.create(payload)),
    remove: (payload: { id?: string; name?: string }) => call<{ removed: number }>(window.api.tag.remove(payload)),
    rename: (payload: { id: string; name: string }) => call<{ updated: number }>(window.api.tag.rename(payload)),
    assign: (payload: { ids: string[]; name: string }) => call<{ updated: number }>(window.api.tag.assign(payload)),
    syncFromJson: () => call<unknown>(window.api.tag.syncFromJson()),
    rebuild: () => call<{ tags: number }>(window.api.tag.rebuild())
  },

  export: {
    ueap: (payload: unknown) => call<ExportResultShape>(window.api.export.ueap(payload)),
    template: (payload: unknown) => call<ExportResultShape>(window.api.export.template(payload))
  },

  import: {
    ueap: (payload: unknown) => call<ImportReport>(window.api.import.ueap(payload)),
    preview: (payload: { packagePath: string; password?: string }) =>
      call<ImportPreview>(window.api.import.preview(payload)),
    manifest: (packagePath: string) => call<UeapManifest>(window.api.import.manifest({ packagePath }))
  },

  backup: {
    create: (payload?: { label?: string; kind?: string; note?: string }) =>
      call<BackupItem>(window.api.backup.create(payload)),
    list: () => call<BackupItem[]>(window.api.backup.list()),
    restore: (payload: { id: string; password?: string }) =>
      call<RestoreResultShape>(window.api.backup.restore(payload)),
    remove: (id: string) => call<boolean>(window.api.backup.remove({ id })),
    prune: (keep?: number) => call<number>(window.api.backup.prune({ keep }))
  },

  recycle: {
    list: () => call<RecycleItem[]>(window.api.recycle.list()),
    restore: (recycleId: string) => call<{ restoredPath: string }>(window.api.recycle.restore({ recycleId })),
    purge: (payload?: { recycleId?: string; all?: boolean; expiredOnly?: boolean }) =>
      call<{ purged: number }>(window.api.recycle.purge(payload))
  },

  log: {
    list: (payload?: unknown) => call<{ entries: LogEntry[]; total: number }>(window.api.log.list(payload)),
    export: (payload: unknown) => call<string>(window.api.log.export(payload)),
    actions: () => call<string[]>(window.api.log.actions())
  },

  settings: {
    get: () => call<SettingsPayload>(window.api.settings.get()),
    update: (payload: { app?: unknown; vault?: unknown }) =>
      call<{ app: AppSettings; vault: unknown }>(window.api.settings.update(payload))
  },

  plugin: {
    reload: () => call(window.api.plugin.reload()),
    run: (pluginId: string, commandId: string) => call(window.api.plugin.run({ pluginId, commandId }))
  }
};

export interface SettingsPayload {
  app: AppSettings;
  vault: unknown;
  appVersion: string;
  pluginCommands: { pluginId: string; pluginName: string; commandId: string; title: string }[];
  plugins: { id: string; name: string; version: string; description?: string }[];
}

export type Api = typeof api;
