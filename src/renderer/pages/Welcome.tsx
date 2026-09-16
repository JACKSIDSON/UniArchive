import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, FolderOpen, ShieldCheck, Clock, ArrowRight } from 'lucide-react';
import { Button, Card, Input, EmptyState } from '../components/ui/primitives';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import { formatDateTime } from '../lib/utils';

export default function Welcome(): React.ReactElement {
  const navigate = useNavigate();
  const toast = useToast();
  const { appSettings, openVault, createVault, busy } = useAppStore();
  const [name, setName] = React.useState('我的大学档案库');

  const pickFolder = async (): Promise<string | undefined> => {
    const res = await api.openDialog({ properties: ['openDirectory'] });
    return res.canceled ? undefined : res.path;
  };

  const onOpen = async (): Promise<void> => {
    try {
      const dir = await pickFolder();
      if (!dir) return;
      await openVault(dir);
      toast.success('已打开档案库', dir);
      navigate('/dashboard');
    } catch (err) {
      toast.error('打开失败', (err as Error).message);
    }
  };

  const onCreate = async (): Promise<void> => {
    try {
      const dir = await pickFolder();
      if (!dir) return;
      await createVault(dir, name.trim() || '我的大学档案库');
      toast.success('已创建档案库', dir);
      navigate('/dashboard');
    } catch (err) {
      toast.error('创建失败', (err as Error).message);
    }
  };

  const onOpenRecent = async (path: string): Promise<void> => {
    try {
      await openVault(path);
      navigate('/dashboard');
    } catch (err) {
      toast.error('打开失败', (err as Error).message);
    }
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-gradient-to-br from-background to-muted/40 p-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">UniArchive 大学档案库</h1>
            <p className="text-sm text-muted-foreground">
              本地优先 · 文件夹即数据库 · 一键打包导出与加载
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FolderPlus className="h-4 w-4 text-primary" />
              新建档案库
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="档案库名称"
              className="mb-3"
            />
            <Button className="w-full" loading={busy} onClick={() => void onCreate()}>
              选择文件夹并创建
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              会在目标文件夹生成 vault.json、archives/、assets/ 与 .uniarchive/ 完整目录树。
            </p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FolderOpen className="h-4 w-4 text-primary" />
              打开已有档案库
            </div>
            <Button className="w-full" variant="outline" loading={busy} onClick={() => void onOpen()}>
              选择档案库文件夹
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              校验 vault.json；若 index.db 丢失会自动重建索引，不会损坏任何档案。
            </p>
          </Card>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            最近打开
          </div>
          {appSettings.recentVaults.length === 0 ? (
            <EmptyState title="还没有最近打开的档案库" description="新建或打开一个档案库后会出现在这里" />
          ) : (
            <div className="space-y-2">
              {appSettings.recentVaults.map((v) => (
                <Card
                  key={v.path}
                  className="flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-accent/40"
                  onClick={() => void onOpenRecent(v.path)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{v.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{v.path}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDateTime(v.lastOpenedAt)}</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
