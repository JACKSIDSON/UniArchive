import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Paperclip,
  Tags as TagsIcon,
  Upload,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  HardDrive
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Alert } from '../components/ui/primitives';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import { formatBytes, formatDateTime } from '../lib/utils';
import type { ArchiveListItem, VaultIssue } from '@shared/types';
import { ArchiveRow, StatCard, useOpenArchive } from '../components/archive/ArchiveForm';

export default function Dashboard(): React.ReactElement {
  const { info, refresh, vaultConfig } = useAppStore();
  const toast = useToast();
  const openArchive = useOpenArchive();
  const navigate = useNavigate();
  const [recent, setRecent] = React.useState<ArchiveListItem[]>([]);
  const [issues, setIssues] = React.useState<VaultIssue[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = (await api.archive.list({ limit: 8, sort: 'updated_desc' })) as {
      items: ArchiveListItem[];
    };
    setRecent(res.items);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, info]);

  const onQuickUpload = async (): Promise<void> => {
    const res = await api.openDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '常见档案文件',
          extensions: ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt', 'md']
        }
      ]
    });
    // DECISION: 快捷上传直接打开新建档案表单并预置「待挂接文件」，
    // 因为附件必须归属于某一篇档案（数据不变量：附件路径由档案 frontmatter 引用）。
    if (res.canceled) return;
    toast.info('请为这些文件创建一篇档案', '附件会随档案一起归档到 assets/ 目录');
    navigate('/archives?new=1');
  };

  const onReindex = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.vault.reindex(false);
      toast.success('索引已重建', `${r.archives} 篇档案，耗时 ${r.tookMs}ms`);
      await refresh();
      await load();
    } catch (err) {
      toast.error('重建失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onValidate = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = (await api.vault.validate()) as VaultIssue[];
      setIssues(r);
      if (r.length === 0) toast.success('校验通过', '档案库结构完整');
      else toast.info(`发现 ${r.length} 个问题`, '详见下方列表');
    } catch (err) {
      toast.error('校验失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">总览</h1>
          <p className="text-sm text-muted-foreground">{info?.name ?? '—'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" loading={busy} onClick={() => void onValidate()}>
            <ShieldCheck className="h-4 w-4" />
            校验档案库
          </Button>
          <Button variant="outline" size="sm" loading={busy} onClick={() => void onReindex()}>
            <RefreshCw className="h-4 w-4" />
            重建索引
          </Button>
          <Button size="sm" onClick={() => void onQuickUpload()}>
            <Upload className="h-4 w-4" />
            快捷上传
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="档案总数" value={info?.counts.archives ?? 0} icon={<FileText className="h-5 w-5" />} />
        <StatCard title="附件数量" value={info?.counts.attachments ?? 0} icon={<Paperclip className="h-5 w-5" />} />
        <StatCard title="标签数量" value={info?.counts.tags ?? 0} icon={<TagsIcon className="h-5 w-5" />} />
        <StatCard
          title="占用空间"
          value={formatBytes(info?.sizes.total ?? 0)}
          hint={`附件 ${formatBytes(info?.sizes.assets ?? 0)}`}
          icon={<HardDrive className="h-5 w-5" />}
        />
      </div>

      {issues && issues.length > 0 ? (
        <Alert variant="warning">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            档案库校验：{issues.length} 个问题
          </div>
          <ul className="max-h-40 space-y-1 overflow-auto text-xs scrollbar-thin">
            {issues.slice(0, 50).map((i, idx) => (
              <li key={idx}>
                <Badge variant={i.level === 'error' ? 'danger' : 'warning'}>{i.level}</Badge>{' '}
                {i.message}
                {i.path ? <span className="text-muted-foreground"> — {i.path}</span> : null}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>近期更新</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/archives')}>
            查看全部
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="px-4 pb-6 text-sm text-muted-foreground">还没有档案，点击右上角「新建档案」开始归档。</div>
          ) : (
            <div className="rounded-b-xl border-t border-border">
              {recent.map((item) => (
                <ArchiveRow key={item.id} item={item} onOpen={openArchive} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4 text-sm">
          <div className="mb-1 font-medium">数据不变量</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>· 删除 index.db 后档案库仍完整可用，索引可一键重建</li>
            <li>· 卸载软件后可直接用文本编辑器阅读所有档案</li>
            <li>· 所有档案都有唯一 UUID；附件路径相对 Vault 根目录</li>
            <li>· 导出包 .ueap 改名为 .zip 后可直接解压</li>
          </ul>
        </Card>
        <Card className="p-4 text-sm">
          <div className="mb-1 font-medium">当前配置</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>· 回收站保留：{vaultConfig?.recycleTtlDays ?? 30} 天</li>
            <li>· 自动备份：{vaultConfig?.autoBackup ? `每 ${vaultConfig.autoBackupIntervalDays} 天` : '关闭'}</li>
            <li>· 敏感档案模糊：{vaultConfig?.blurSensitive ? '开启' : '关闭'}</li>
            <li>· 上次备份：{formatDateTime(vaultConfig?.lastBackupAt)}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
