import * as React from 'react';
import { DatabaseBackup, RotateCcw, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { Button, Card, Badge, EmptyState } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import { formatBytes, formatDateTime } from '../lib/utils';
import type { BackupItem } from '@shared/types';

const KIND_LABEL: Record<string, string> = {
  manual: '手动',
  auto: '自动',
  'pre-import': '导入前快照'
};

export default function Backup(): React.ReactElement {
  const toast = useToast();
  const { refresh } = useAppStore();
  const [items, setItems] = React.useState<BackupItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pendingRestore, setPendingRestore] = React.useState<BackupItem | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  const load = React.useCallback(async () => {
    const list = (await api.backup.list()) as BackupItem[];
    setItems(list);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (): Promise<void> => {
    setBusy(true);
    try {
      const item = (await api.backup.create({ kind: 'manual', label: '手动备份' })) as BackupItem;
      toast.success('备份已创建', `${item.name} · ${formatBytes(item.size)}`);
      await load();
      await refresh();
    } catch (err) {
      toast.error('备份失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async (): Promise<void> => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      const res = (await api.backup.restore({ id: pendingRestore.id })) as {
        restoredArchives: number;
        restoredAssets: number;
      };
      toast.success(
        '恢复完成',
        `档案 ${res.restoredArchives} 篇，附件 ${res.restoredAssets} 个（恢复前已自动生成快照）`
      );
      setPendingRestore(null);
      await load();
      await refresh();
    } catch (err) {
      toast.error('恢复失败', (err as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  const onDelete = async (item: BackupItem): Promise<void> => {
    try {
      await api.backup.remove(item.id);
      toast.success('备份已删除');
      await load();
      await refresh();
    } catch (err) {
      toast.error('删除失败', (err as Error).message);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">备份与恢复</h1>
          <p className="text-sm text-muted-foreground">
            备份包同样是 .ueap 格式，可改名解压；恢复前会自动再生成一份快照
          </p>
        </div>
        <Button size="sm" loading={busy} onClick={() => void onCreate()}>
          <Plus className="h-4 w-4" />
          创建备份
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="还没有备份"
          description="建议在大批量导入或整理前先创建一份备份"
          action={
            <Button size="sm" onClick={() => void onCreate()}>
              <DatabaseBackup className="h-4 w-4" />
              立即备份
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          {items.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
              <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(b.createdAt)} · {formatBytes(b.size)}
                  {b.note ? ` · ${b.note}` : ''}
                </div>
              </div>
              <Badge variant={b.kind === 'pre-import' ? 'warning' : b.kind === 'auto' ? 'secondary' : 'default'}>
                {KIND_LABEL[b.kind] ?? b.kind}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => setPendingRestore(b)}>
                <RotateCcw className="h-3.5 w-3.5" />
                恢复
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void onDelete(b)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={() => setPendingRestore(null)}
        title="确认恢复这份备份？"
        confirmText="确认恢复"
        loading={restoring}
        description={
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              恢复会覆盖当前档案库中的 archives/ 与 assets/ 内容。
            </div>
            <div>系统会在恢复前自动生成一份「恢复前快照」，可再次回滚，不会丢失现状。</div>
          </div>
        }
        onConfirm={() => void onRestore()}
      />
    </div>
  );
}
