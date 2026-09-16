import * as React from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { Button, Card, Badge, EmptyState } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import { formatBytes, formatDateTime, daysLeft } from '../lib/utils';
import type { RecycleItem } from '@shared/types';

export default function Recycle(): React.ReactElement {
  const toast = useToast();
  const { refresh } = useAppStore();
  const [items, setItems] = React.useState<RecycleItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pendingPurge, setPendingPurge] = React.useState<RecycleItem | null>(null);
  const [pendingPurgeAll, setPendingPurgeAll] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = (await api.recycle.list()) as RecycleItem[];
      setItems(list);
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onRestore = async (item: RecycleItem): Promise<void> => {
    setBusy(true);
    try {
      const res = (await api.recycle.restore(item.recycleId)) as { restoredPath: string };
      toast.success('已还原', res.restoredPath);
      await load();
      await refresh();
    } catch (err) {
      toast.error('还原失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPurge = async (): Promise<void> => {
    if (!pendingPurge) return;
    setBusy(true);
    try {
      await api.recycle.purge({ recycleId: pendingPurge.recycleId });
      toast.success('已彻底删除');
      setPendingPurge(null);
      await load();
      await refresh();
    } catch (err) {
      toast.error('删除失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPurgeAll = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = (await api.recycle.purge({ all: true })) as { purged: number };
      toast.success(`已清空回收站（${res.purged} 项）`);
      setPendingPurgeAll(false);
      await load();
      await refresh();
    } catch (err) {
      toast.error('清空失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">回收站</h1>
          <p className="text-sm text-muted-foreground">删除的档案与附件会先进入回收站，到期前可随时还原</p>
        </div>
        {items.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setPendingPurgeAll(true)}>
            <Trash2 className="h-4 w-4" />
            清空回收站
          </Button>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <div className="text-sm text-muted-foreground">加载中…</div>
      ) : items.length === 0 ? (
        <EmptyState title="回收站是空的" description="删除的档案会保留在 .uniarchive/recycle/ 中" />
      ) : (
        <Card className="overflow-hidden">
          {items.map((item) => {
            const left = daysLeft(item.expireAt);
            return (
              <div key={item.recycleId} className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    <Badge variant={item.kind === 'archive' ? 'default' : 'secondary'}>
                      {item.kind === 'archive' ? '档案' : '附件'}
                    </Badge>
                    {left <= 3 ? <Badge variant="danger">{Math.max(0, left)} 天后过期</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    原路径：{item.originalPath}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    删除于 {formatDateTime(item.deletedAt)} · {formatBytes(item.size)} · 到期 {formatDateTime(item.expireAt)}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRestore(item)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  还原
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setPendingPurge(item)}
                >
                  彻底删除
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      <ConfirmDialog
        open={pendingPurge !== null}
        onOpenChange={() => setPendingPurge(null)}
        title="彻底删除？"
        description="该操作不可撤销，文件将从磁盘上真正移除。"
        loading={busy}
        onConfirm={() => void onPurge()}
      />

      <ConfirmDialog
        open={pendingPurgeAll}
        onOpenChange={setPendingPurgeAll}
        title="清空回收站？"
        description="回收站内的所有条目都会被永久删除，且无法恢复。"
        loading={busy}
        onConfirm={() => void onPurgeAll()}
      />
    </div>
  );
}
