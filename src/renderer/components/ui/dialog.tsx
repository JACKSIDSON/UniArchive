import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { Button } from './primitives';

/** 轻量 Dialog（无第三方依赖，符合 shadcn 视觉规范） */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'default'
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'default' | 'lg' | 'xl';
}): React.ReactElement | null {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 max-h-[88vh] w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl',
          size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg'
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div>
            <div className="text-base font-semibold">{title}</div>
            {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
          </div>
          <button
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-4 scrollbar-thin">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** 二次确认对话框（删除操作必须走这里） */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认删除',
  destructive = true,
  loading,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}): React.ReactElement {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={typeof description === 'string' ? description : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} loading={loading} onClick={() => void onConfirm()}>
            {confirmText}
          </Button>
        </>
      }
    >
      {typeof description !== 'string' ? description : null}
    </Dialog>
  );
}
