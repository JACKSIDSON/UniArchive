import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { previewImport, importUeap, readManifest } from '../import/ueap';
import type { ImportPreview, ImportReport, ImportOptions, UeapManifest } from '@shared/types';

export function registerImportIpc(): void {
  handle<ImportPreview>(IPC.IMPORT_PREVIEW, (payload) => {
    const p = payload as { packagePath: string; password?: string };
    return previewImport(p.packagePath, p.password);
  });

  handle<ImportReport>(IPC.IMPORT_UEAP, (payload) => {
    const p = payload as ImportOptions & { password?: string; snapshot?: boolean };
    return importUeap(p);
  });

  handle<UeapManifest>('import:manifest', (payload) => {
    const p = payload as { packagePath: string };
    return readManifest(p.packagePath);
  });
}
