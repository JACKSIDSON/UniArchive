import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { addAttachment, deleteAttachment, listAttachments, previewAttachment } from '../core/attachment';
import type { Attachment, AttachmentPreview } from '@shared/types';

/** 单条 / 批量共用同一通道，用 payload 区分 */
type AddPayload =
  | { archiveId: string; sourcePath: string }
  | { archiveId: string; sourcePaths: string[] };

type AddResult =
  | { attachment: Attachment; deduped: boolean }
  | { added: Attachment[]; deduped: number };

type PreviewPayload = { path: string } | { archiveId: string; list: true };

export function registerAttachmentIpc(): void {
  handle<AddResult>(IPC.ATTACHMENT_ADD, (payload) => {
    const p = payload as AddPayload;
    if ('sourcePaths' in p && Array.isArray(p.sourcePaths)) {
      const added: Attachment[] = [];
      let deduped = 0;
      for (const sourcePath of p.sourcePaths) {
        try {
          const res = addAttachment({ archiveId: p.archiveId, sourcePath });
          added.push(res.attachment);
          if (res.deduped) deduped += 1;
        } catch {
          /* 单个失败继续，不阻断批量 */
        }
      }
      return { added, deduped };
    }
    return addAttachment({ archiveId: p.archiveId, sourcePath: (p as { sourcePath: string }).sourcePath });
  });

  handle<boolean>(IPC.ATTACHMENT_DELETE, (payload) => {
    const p = payload as { archiveId: string; attachmentId: string };
    deleteAttachment(p.archiveId, p.attachmentId);
    return true;
  });

  handle<AttachmentPreview | Attachment[]>(IPC.ATTACHMENT_PREVIEW, (payload) => {
    const p = payload as PreviewPayload;
    if ('list' in p && p.list) return listAttachments(p.archiveId);
    return previewAttachment((p as { path: string }).path);
  });
}
