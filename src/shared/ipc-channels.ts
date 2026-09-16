/**
 * IPC 通道契约 —— 与规格书第 7 节完全一致，禁止重命名。
 */
export const IPC = {
  VAULT_CREATE: 'vault:create',
  VAULT_OPEN: 'vault:open',
  VAULT_CLOSE: 'vault:close',
  VAULT_INFO: 'vault:info',
  VAULT_REINDEX: 'vault:reindex',
  VAULT_VALIDATE: 'vault:validate',

  ARCHIVE_CREATE: 'archive:create',
  ARCHIVE_UPDATE: 'archive:update',
  ARCHIVE_DELETE: 'archive:delete',
  ARCHIVE_GET: 'archive:get',
  ARCHIVE_LIST: 'archive:list',

  ATTACHMENT_ADD: 'attachment:add',
  ATTACHMENT_DELETE: 'attachment:delete',
  ATTACHMENT_PREVIEW: 'attachment:preview',

  SEARCH_QUERY: 'search:query',

  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_DELETE: 'tag:delete',

  EXPORT_UEAP: 'export:ueap',
  EXPORT_TEMPLATE: 'export:template',
  IMPORT_UEAP: 'import:ueap',
  IMPORT_PREVIEW: 'import:preview',

  BACKUP_CREATE: 'backup:create',
  BACKUP_LIST: 'backup:list',
  BACKUP_RESTORE: 'backup:restore',

  RECYCLE_LIST: 'recycle:list',
  RECYCLE_RESTORE: 'recycle:restore',
  RECYCLE_PURGE: 'recycle:purge',

  LOG_LIST: 'log:list',
  LOG_EXPORT: 'log:export',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** 系统级通道（不用于业务数据） */
export const SYS = {
  PING: 'sys:ping',
  OPEN_DIALOG: 'sys:openDialog',
  SAVE_DIALOG: 'sys:saveDialog',
  OPEN_PATH: 'sys:openPath',
  APP_VERSION: 'sys:appVersion'
} as const;
