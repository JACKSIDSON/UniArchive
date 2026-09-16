import { contextBridge, ipcRenderer } from 'electron';
import { IPC, SYS } from '@shared/ipc-channels';

/**
 * contextBridge 暴露 window.api。
 * 渲染进程不直接访问 Node / Electron，全部走 IPC。
 */

const api = {
  /** 系统 */
  ping: (): Promise<string> => ipcRenderer.invoke(SYS.PING),
  appVersion: (): Promise<string> => ipcRenderer.invoke(SYS.APP_VERSION),
  openDialog: (payload: {
    properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; path?: string }> => ipcRenderer.invoke(SYS.OPEN_DIALOG, payload),
  saveDialog: (payload: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; path?: string }> => ipcRenderer.invoke(SYS.SAVE_DIALOG, payload),
  openPath: (target: string): Promise<boolean> => ipcRenderer.invoke(SYS.OPEN_PATH, target),

  /** 通用调用（逃生舱：任意通道） */
  invoke: <T = unknown>(channel: string, payload?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, payload) as Promise<T>,

  /** 主进程主动推送事件 */
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    const handler = (_e: unknown, ...args: unknown[]): void => listener(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /** Vault */
  vault: {
    create: (payload: { targetPath: string; name?: string; open?: boolean }) =>
      ipcRenderer.invoke(IPC.VAULT_CREATE, payload),
    open: (payload: { path: string }) => ipcRenderer.invoke(IPC.VAULT_OPEN, payload),
    close: () => ipcRenderer.invoke(IPC.VAULT_CLOSE),
    info: () => ipcRenderer.invoke(IPC.VAULT_INFO),
    reindex: (payload?: { purge?: boolean }) => ipcRenderer.invoke(IPC.VAULT_REINDEX, payload),
    validate: (payload?: { path?: string }) => ipcRenderer.invoke(IPC.VAULT_VALIDATE, payload)
  },

  /** 档案 */
  archive: {
    create: (payload: unknown) => ipcRenderer.invoke(IPC.ARCHIVE_CREATE, payload),
    get: (payload: { id: string }) => ipcRenderer.invoke(IPC.ARCHIVE_GET, payload),
    update: (payload: { id: string; patch: unknown }) => ipcRenderer.invoke(IPC.ARCHIVE_UPDATE, payload),
    delete: (payload: { id?: string; ids?: string[] }) => ipcRenderer.invoke(IPC.ARCHIVE_DELETE, payload),
    list: (payload?: unknown) => ipcRenderer.invoke(IPC.ARCHIVE_LIST, payload),
    listAll: () => ipcRenderer.invoke('archive:listAll')
  },

  /** 附件 */
  attachment: {
    add: (payload: unknown) => ipcRenderer.invoke(IPC.ATTACHMENT_ADD, payload),
    delete: (payload: { archiveId: string; attachmentId: string }) =>
      ipcRenderer.invoke(IPC.ATTACHMENT_DELETE, payload),
    preview: (payload: unknown) => ipcRenderer.invoke(IPC.ATTACHMENT_PREVIEW, payload)
  },

  /** 检索 */
  search: {
    query: (payload: unknown) => ipcRenderer.invoke(IPC.SEARCH_QUERY, payload)
  },

  /** 标签 */
  tag: {
    list: () => ipcRenderer.invoke(IPC.TAG_LIST),
    create: (payload: { name: string; color?: string }) => ipcRenderer.invoke(IPC.TAG_CREATE, payload),
    remove: (payload: { id?: string; name?: string }) => ipcRenderer.invoke(IPC.TAG_DELETE, payload),
    rename: (payload: { id: string; name: string }) => ipcRenderer.invoke('tag:rename', payload),
    assign: (payload: { ids: string[]; name: string }) => ipcRenderer.invoke('tag:assign', payload),
    syncFromJson: () => ipcRenderer.invoke('tag:syncFromJson'),
    rebuild: () => ipcRenderer.invoke('tag:rebuild')
  },

  /** 导出 / 导入 */
  export: {
    ueap: (payload: unknown) => ipcRenderer.invoke(IPC.EXPORT_UEAP, payload),
    template: (payload: unknown) => ipcRenderer.invoke(IPC.EXPORT_TEMPLATE, payload)
  },
  import: {
    ueap: (payload: unknown) => ipcRenderer.invoke(IPC.IMPORT_UEAP, payload),
    preview: (payload: { packagePath: string; password?: string }) =>
      ipcRenderer.invoke(IPC.IMPORT_PREVIEW, payload),
    manifest: (payload: { packagePath: string }) => ipcRenderer.invoke('import:manifest', payload)
  },

  /** 备份 */
  backup: {
    create: (payload?: { label?: string; kind?: string; note?: string }) =>
      ipcRenderer.invoke(IPC.BACKUP_CREATE, payload),
    list: () => ipcRenderer.invoke(IPC.BACKUP_LIST),
    restore: (payload: { id: string; password?: string }) => ipcRenderer.invoke(IPC.BACKUP_RESTORE, payload),
    remove: (payload: { id: string }) => ipcRenderer.invoke('backup:delete', payload),
    prune: (payload?: { keep?: number }) => ipcRenderer.invoke('backup:prune', payload)
  },

  /** 回收站 */
  recycle: {
    list: () => ipcRenderer.invoke(IPC.RECYCLE_LIST),
    restore: (payload: { recycleId: string }) => ipcRenderer.invoke(IPC.RECYCLE_RESTORE, payload),
    purge: (payload?: { recycleId?: string; all?: boolean; expiredOnly?: boolean }) =>
      ipcRenderer.invoke(IPC.RECYCLE_PURGE, payload)
  },

  /** 日志 */
  log: {
    list: (payload?: unknown) => ipcRenderer.invoke(IPC.LOG_LIST, payload),
    export: (payload: unknown) => ipcRenderer.invoke(IPC.LOG_EXPORT, payload),
    actions: () => ipcRenderer.invoke('log:actions')
  },

  /** 设置 */
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    update: (payload: { app?: unknown; vault?: unknown }) => ipcRenderer.invoke(IPC.SETTINGS_UPDATE, payload)
  },

  /** 插件 */
  plugin: {
    reload: () => ipcRenderer.invoke('plugin:reload'),
    run: (payload: { pluginId: string; commandId: string }) => ipcRenderer.invoke('plugin:run', payload)
  }
};

export type UniArchiveApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
