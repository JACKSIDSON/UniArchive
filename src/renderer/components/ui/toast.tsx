import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

/** 极简 Toast：所有写操作成功后给出提示 */

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev, { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => remove(id), t.variant === 'error' ? 6000 : 3200)
      );
    },
    [remove]
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: 'success' }),
      error: (title, description) => toast({ title, description, variant: 'error' }),
      info: (title, description) => toast({ title, description, variant: 'info' })
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto rounded-lg border p-3 shadow-lg backdrop-blur',
                item.variant === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : item.variant === 'error'
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-border bg-popover text-popover-foreground'
              )}
            >
              <div className="text-sm font-medium">{item.title}</div>
              {item.description ? (
                <div className="mt-0.5 whitespace-pre-wrap break-words text-xs opacity-80">{item.description}</div>
              ) : null}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
