import * as React from 'react';

/**
 * 列表键盘导航：↑/↓ 选择，Enter 打开（规格书 UI 硬性要求）。
 */
export function useKeyboardNav<T>(
  items: T[],
  onOpen: (item: T, index: number) => void
): { activeIndex: number; setActiveIndex: (i: number) => void; onKeyDown: (e: React.KeyboardEvent) => void } {
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    setActiveIndex((i) => (i >= items.length ? Math.max(0, items.length - 1) : i));
  }, [items.length]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[activeIndex];
        if (item !== undefined) onOpen(item, activeIndex);
      }
    },
    [items, activeIndex, onOpen]
  );

  return { activeIndex, setActiveIndex, onKeyDown };
}

/** 防抖输入 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** 异步任务：统一 loading / error 处理 */
export function useAsync(): {
  busy: boolean;
  error: string | null;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
} {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, run };
}
