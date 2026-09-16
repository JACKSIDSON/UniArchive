import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { listLogs, exportLogs } from '../log/logger';
import type { LogEntry } from '@shared/types';
import { LOG_ACTIONS } from '@shared/constants';

interface LogFilterPayload {
  action?: string;
  keyword?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function registerLogIpc(): void {
  handle<{ entries: LogEntry[]; total: number }>(IPC.LOG_LIST, (payload) =>
    listLogs((payload ?? {}) as LogFilterPayload)
  );

  handle<string>(IPC.LOG_EXPORT, (payload) => {
    const p = payload as LogFilterPayload & { outputPath: string };
    return exportLogs(p.outputPath, p);
  });

  /** 日志动作枚举（供 UI 下拉筛选） */
  handle<readonly string[]>('log:actions', () => LOG_ACTIONS);
}
