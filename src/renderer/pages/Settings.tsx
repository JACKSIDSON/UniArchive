import * as React from 'react';
import { RefreshCw, ShieldCheck, Puzzle, CloudOff, Eye, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Switch,
  Badge,
  Alert,
  Separator
} from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import type { VaultIssue } from '@shared/types';

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export default function Settings(): React.ReactElement {
  const toast = useToast();
  const { appSettings, vaultConfig, theme, setTheme, updateAppSettings, updateVaultConfig, refresh, info } =
    useAppStore();
  const [plugins, setPlugins] = React.useState<PluginInfo[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [issues, setIssues] = React.useState<VaultIssue[] | null>(null);
  const [confirmPurge, setConfirmPurge] = React.useState(false);

  const loadPlugins = React.useCallback(async () => {
    try {
      const res = (await api.settings.get()) as { plugins?: PluginInfo[] };
      setPlugins(res.plugins ?? []);
    } catch {
      /* 忽略 */
    }
  }, []);

  React.useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const onReindex = async (purge: boolean): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.vault.reindex(purge);
      toast.success(purge ? '已删除索引并重建' : '索引已重建', `${r.archives} 篇 · ${r.tookMs}ms`);
      await refresh();
    } catch (err) {
      toast.error('操作失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onValidate = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = (await api.vault.validate()) as VaultIssue[];
      setIssues(r);
      toast.info('校验完成', r.length ? `发现 ${r.length} 个问题` : '结构完整');
    } catch (err) {
      toast.error('校验失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onReloadPlugins = async (): Promise<void> => {
    setBusy(true);
    try {
      const list = (await api.plugin.reload()) as PluginInfo[];
      setPlugins(list);
      toast.success('插件已重新加载', `${list.length} 个`);
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="text-lg font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">主题、插件、同步与隐私</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">主题</span>
              <Select
                className="h-8 w-36"
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
              >
                <option value="light">明亮</option>
                <option value="dark">暗黑</option>
                <option value="system">跟随系统</option>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Eye className="h-3.5 w-3.5" />
                  敏感档案默认模糊
                </div>
                <div className="text-xs text-muted-foreground">开启后需点击才会显示敏感内容</div>
              </div>
              <Switch
                checked={vaultConfig?.blurSensitive ?? true}
                onCheckedChange={(v) => void updateVaultConfig({ blurSensitive: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudOff className="h-4 w-4" />
              同步
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              UniArchive 是纯本地应用，<b>不提供也不允许云端同步</b>。
              你可以把 Vault 文件夹放进任意网盘（OneDrive / iCloud /
              坚果云）实现多设备同步——因为所有数据都是普通文件，这样做是安全的。
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>备份与回收站</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">自动备份</div>
                <div className="text-xs text-muted-foreground">打开档案库时按间隔自动创建 .ueap 备份</div>
              </div>
              <Switch
                checked={vaultConfig?.autoBackup ?? false}
                onCheckedChange={(v) => void updateVaultConfig({ autoBackup: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">自动备份间隔（天）</span>
              <Input
                className="h-8 w-20"
                type="number"
                min={1}
                value={vaultConfig?.autoBackupIntervalDays ?? 7}
                onChange={(e) => void updateVaultConfig({ autoBackupIntervalDays: Number(e.target.value) || 7 })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">回收站保留（天）</span>
              <Input
                className="h-8 w-20"
                type="number"
                min={1}
                value={vaultConfig?.recycleTtlDays ?? 30}
                onChange={(e) => void updateVaultConfig({ recycleTtlDays: Number(e.target.value) || 30 })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">列表分页大小</span>
              <Input
                className="h-8 w-20"
                type="number"
                min={10}
                value={vaultConfig?.pageSize ?? 50}
                onChange={(e) => void updateVaultConfig({ pageSize: Number(e.target.value) || 50 })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="h-4 w-4" />
              插件
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">启用插件</div>
                <div className="text-xs text-muted-foreground">
                  插件目录：.uniarchive/plugins/&lt;id&gt;/plugin.json
                </div>
              </div>
              <Switch
                checked={vaultConfig?.pluginsEnabled ?? true}
                onCheckedChange={(v) => void updateVaultConfig({ pluginsEnabled: v })}
              />
            </div>
            <Button size="sm" variant="outline" loading={busy} onClick={() => void onReloadPlugins()}>
              <RefreshCw className="h-4 w-4" />
              重新加载插件
            </Button>
            <div className="space-y-1">
              {plugins.length === 0 ? (
                <div className="text-xs text-muted-foreground">未检测到插件</div>
              ) : (
                plugins.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-sm">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="secondary">v{p.version}</Badge>
                    <span className="truncate text-xs text-muted-foreground">{p.description}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>索引与校验</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" loading={busy} onClick={() => void onReindex(false)}>
              <RefreshCw className="h-4 w-4" />
              重建索引
            </Button>
            <Button size="sm" variant="outline" loading={busy} onClick={() => void onReindex(true)}>
              删除 index.db 并重建
            </Button>
            <Button size="sm" variant="outline" loading={busy} onClick={() => void onValidate()}>
              <ShieldCheck className="h-4 w-4" />
              校验档案库
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="text-muted-foreground">
            当前档案库：{info?.name ?? '—'}
            {info ? (
              <span className="ml-2 text-xs">
                {info.counts.archives} 篇档案 · {info.counts.attachments} 个附件 · {info.counts.tags} 个标签
              </span>
            ) : null}
          </div>
          {issues ? (
            issues.length === 0 ? (
              <Alert>校验通过，档案库结构完整。</Alert>
            ) : (
              <Alert variant="warning">
                <ul className="max-h-40 space-y-0.5 overflow-auto text-xs scrollbar-thin">
                  {issues.map((i, idx) => (
                    <li key={idx}>
                      [{i.level}] {i.message} {i.path ? `— ${i.path}` : ''}
                    </li>
                  ))}
                </ul>
              </Alert>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>隐私</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            本应用不上传任何数据，不请求网络权限。最近打开的档案库列表保存在本机应用数据目录中。
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void updateAppSettings({ recentVaults: [], lastVaultPath: undefined })}
          >
            <Trash2 className="h-4 w-4" />
            清除最近打开记录
          </Button>
          <Separator />
          <div className="text-xs text-muted-foreground">
            最近记录数量：{appSettings.recentVaults.length}
          </div>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmPurge(true)}>
            清空回收站（永久删除）
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="清空回收站？"
        description="回收站中所有条目会被永久删除，操作不可撤销。"
        onConfirm={async () => {
          await api.recycle.purge({ all: true });
          toast.success('回收站已清空');
          setConfirmPurge(false);
          await refresh();
        }}
      />
    </div>
  );
}
