import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { exportUeap, exportByTemplate } from '../export/ueap';
import type { ExportResult } from '../export/ueap';
import type { ExportOptions } from '@shared/types';

export function registerExportIpc(): void {
  handle<ExportResult>(IPC.EXPORT_UEAP, (payload) => exportUeap(payload as ExportOptions));

  handle<ExportResult>(IPC.EXPORT_TEMPLATE, (payload) => {
    const p = payload as {
      template: '评优' | '求职' | '升学' | '答辩';
      includeAttachments: boolean;
      outputPath: string;
      encrypt?: { password: string };
    };
    return exportByTemplate(p.template, {
      includeAttachments: p.includeAttachments,
      outputPath: p.outputPath,
      encrypt: p.encrypt
    });
  });
}
