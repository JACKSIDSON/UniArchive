import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Tags as TagsIcon, Plus, Trash2, Pencil } from 'lucide-react';
import { Button, Card, Input, Badge, EmptyState, Alert } from '../components/ui/primitives';
import { Dialog, ConfirmDialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';

interface TagItem {
  id: string;
  name: string;
  color?: string;
  builtin: boolean;
  count: number;
}

export default function Tags(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useAppStore();
  const [tags, setTags] = React.useState<TagItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [rename, setRename] = React.useState<TagItem | null>(null);
  const [renameTo, setRenameTo] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<TagItem | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = (await api.tag.list()) as TagItem[];
      setTags(list);
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.tag.create({ name });
      toast.success('标签已创建', '已同时写入 tags.json 与索引');
      setNewName('');
      setCreateOpen(false);
      await load();
      await refresh();
    } catch (err) {
      toast.error('创建失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRename = async (): Promise<void> => {
    if (!rename) return;
    setBusy(true);
    try {
      await api.tag.rename({ id: rename.id, name: renameTo.trim() });
      toast.success('已重命名', '所有档案的 frontmatter 已同步');
      setRename(null);
      await load();
      await refresh();
    } catch (err) {
      toast.error('重命名失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = (await api.tag.remove({ id: pendingDelete.id })) as { removed: number };
      toast.success('标签已删除', `已解除 ${res.removed} 篇档案的关联`);
      setPendingDelete(null);
      await load();
      await refresh();
    } catch (err) {
      toast.error('删除失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const max = Math.max(1, ...tags.map((t) => t.count));

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">标签</h1>
          <p className="text-sm text-muted-foreground">tags.json 与索引双向同步，删除标签会自动解除档案关联</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          新建标签
        </Button>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}

      {tags.length === 0 && !loading ? (
        <EmptyState title="还没有标签" description="新建标签后可以批量给档案打标签" />
      ) : (
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <div
                key={t.id}
                className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                style={{ borderLeftWidth: 3, borderLeftColor: t.color ?? 'hsl(var(--primary))' }}
              >
                <button
                  className="flex items-center gap-2"
                  onClick={() => navigate(`/archives?tag=${encodeURIComponent(t.name)}`)}
                  title="按该标签筛选"
                >
                  <TagsIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="secondary">{t.count}</Badge>
                  {t.builtin ? <Badge variant="outline">预设</Badge> : null}
                </button>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(t.count / max) * 100}%` }}
                  />
                </div>
                <button
                  className="rounded p-1 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                  onClick={() => {
                    setRename(t);
                    setRenameTo(t.name);
                  }}
                  title="重命名"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  className="rounded p-1 text-destructive opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                  onClick={() => setPendingDelete(t)}
                  title="删除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Alert>
        提示：标签同时保存在 <span className="font-mono">.uniarchive/tags.json</span>（纯文本）与 SQLite
        索引中。删除标签会同步修改所有档案的 frontmatter，不会丢失档案本身。
      </Alert>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新建标签"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button loading={busy} onClick={() => void onCreate()}>
              创建
            </Button>
          </>
        }
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="标签名称，例如：评优"
          onKeyDown={(e) => e.key === 'Enter' && void onCreate()}
        />
      </Dialog>

      <Dialog
        open={rename !== null}
        onOpenChange={() => setRename(null)}
        title="重命名标签"
        footer={
          <>
            <Button variant="outline" onClick={() => setRename(null)}>
              取消
            </Button>
            <Button loading={busy} onClick={() => void onRename()}>
              保存
            </Button>
          </>
        }
      >
        <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
        <p className="mt-2 text-xs text-muted-foreground">重命名会同步更新所有引用该标签的档案。</p>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={() => setPendingDelete(null)}
        title={`确认删除标签「${pendingDelete?.name ?? ''}」？`}
        description="该标签会从所有档案中移除（档案本身不受影响），并同步更新 tags.json。"
        loading={busy}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
