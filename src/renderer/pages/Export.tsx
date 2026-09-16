import * as React from 'react';
import { FileDown, Lock, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Checkbox,
  Badge,
  Alert
} from '../components/ui/primitives';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { CATEGORIES, EXPORT_TEMPLATES } from '@shared/constants';
import type { ArchiveCategory, ArchiveListItem } from '@shared/types';
import { formatBytes } from '../lib/utils';

type ScopeKind = 'full' | 'category' | 'filter' | 'template';

interface ExportResultShape {
  outputPath: string;
  manifest: { exportType: string; exportedAt: string; encryption: { enabled: boolean } };
  archiveCount: number;
  attachmentCount: number;
  size: number;
}

export default function Export(): React.ReactElement {
  const toast = useToast();
  const [scopeKind, setScopeKind] = React.useState<ScopeKind>('full');
  const [category, setCategory] = React.useState<ArchiveCategory>(CATEGORIES[0]);
  const [template, setTemplate] = React.useState<(typeof EXPORT_TEMPLATES)[number]>('评优');
  const [includeAttachments, setIncludeAttachments] = React.useState(true);
  const [encrypt, setEncrypt] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [outputPath, setOutputPath] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ExportResultShape | null>(null);
  const [all, setAll] = React.useState<ArchiveListItem[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    void (async () => {
      try {
        const list = (await api.archive.listAll()) as ArchiveListItem[];
        setAll(list);
      } catch {
        /* 忽略 */
      }
    })();
  }, []);

  const pick = async (): Promise<void> => {
    const res = await api.saveDialog({
      defaultPath: `UniArchive-${new Date().toISOString().slice(0, 10)}.ueap`,
      filters: [{ name: 'UEAP 包', extensions: ['ueap'] }]
    });
    if (!res.canceled && res.path) setOutputPath(res.path);
  };

  const submit = async (): Promise<void> => {
    if (!outputPath) {
      toast.error('请选择导出位置');
      return;
    }
    if (encrypt && password.length < 6) {
      toast.error('加密密码至少 6 位');
      return;
    }
    setBusy(true);
    try {
      const base = {
        includeAttachments,
        outputPath,
        ...(encrypt ? { encrypt: { password } } : {})
      };
      let res: ExportResultShape;
      if (scopeKind === 'template') {
        res = (await api.export.template({ template, ...base })) as ExportResultShape;
      } else {
        const scope =
          scopeKind === 'full'
            ? { kind: 'full' }
            : scopeKind === 'category'
              ? { kind: 'category', category }
              : { kind: 'filter', archiveIds: [...picked] };
        res = (await api.export.ueap({ scope, ...base })) as ExportResultShape;
      }
      setResult(res);
      toast.success('导出成功', `${res.archiveCount} 篇档案 · ${formatBytes(res.size)}`);
    } catch (err) {
      toast.error('导出失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="text-lg font-semibold">导出 .ueap</h1>
        <p className="text-sm text-muted-foreground">
          UEAP 本质是 ZIP，改名为 .zip 后可直接解压；永远不会包含 index.db / 日志 / 备份 / 回收站
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>导出范围</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['full', '整库'],
                  ['category', '按分类'],
                  ['filter', '自选档案'],
                  ['template', '按模板']
                ] as [ScopeKind, string][]
              ).map(([k, label]) => (
                <Button key={k} size="sm" variant={scopeKind === k ? 'default' : 'outline'} onClick={() => setScopeKind(k)}>
                  {label}
                </Button>
              ))}
            </div>

            {scopeKind === 'category' ? (
              <Select value={category} onChange={(e) => setCategory(e.target.value as ArchiveCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            ) : null}

            {scopeKind === 'template' ? (
              <div className="flex gap-2">
                {EXPORT_TEMPLATES.map((t) => (
                  <Button key={t} size="sm" variant={template === t ? 'default' : 'outline'} onClick={() => setTemplate(t)}>
                    {t}
                  </Button>
                ))}
              </div>
            ) : null}

            {scopeKind === 'filter' ? (
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-2 scrollbar-thin">
                {all.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={picked.has(a.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        setPicked(next);
                      }}
                    />
                    <span className="truncate">{a.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{a.category}</span>
                  </label>
                ))}
                {all.length === 0 ? <div className="p-2 text-sm text-muted-foreground">暂无档案</div> : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
              <span className="text-sm">
                {scopeKind === 'filter' ? `已选 ${picked.size} 篇` : '导出范围已设置'}
              </span>
              <Badge variant="secondary">{includeAttachments ? '含附件' : '仅档案'}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>选项与加密</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Checkbox
              label="包含附件（assets/ 原始文件）"
              checked={includeAttachments}
              onChange={(e) => setIncludeAttachments(e.target.checked)}
            />
            <Checkbox
              label="使用密码加密（AES-256-GCM + Argon2id）"
              checked={encrypt}
              onChange={(e) => setEncrypt(e.target.checked)}
            />
            {encrypt ? (
              <div className="space-y-1.5">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="导出密码（至少 6 位）"
                />
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 h-3.5 w-3.5" />
                  manifest.json 保持明文，vault/ 内容整体加密；密码错误将无法解压。
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <div className="text-sm font-medium">导出位置</div>
              <div className="flex gap-2">
                <Input value={outputPath} readOnly placeholder="选择 .ueap 保存路径" />
                <Button variant="outline" onClick={() => void pick()}>
                  选择
                </Button>
              </div>
            </div>

            <Button className="w-full" loading={busy} onClick={() => void submit()}>
              <FileDown className="h-4 w-4" />
              开始导出
            </Button>
          </CardContent>
        </Card>
      </div>

      {result ? (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            导出完成
          </div>
          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>路径：{result.outputPath}</div>
            <div>类型：{result.manifest.exportType}</div>
            <div>档案：{result.archiveCount} 篇</div>
            <div>附件：{result.attachmentCount} 个</div>
            <div>大小：{formatBytes(result.size)}</div>
            <div>加密：{result.manifest.encryption.enabled ? '是' : '否'}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void api.openPath(result.outputPath)}>
              在文件管理器中显示
            </Button>
          </div>
        </Card>
      ) : null}

      <Alert>
        导出的包结构：
        <span className="ml-1 font-mono text-xs">manifest.json / checksums.sha256 / README.md / vault/**</span>
        ，不含 <span className="font-mono text-xs">index.db、logs/、backups/、recycle/</span>。
      </Alert>
    </div>
  );
}
