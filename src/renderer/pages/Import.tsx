import * as React from 'react';
import { FileUp, AlertTriangle, Lock } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Badge,
  Alert,
  EmptyState
} from '../components/ui/primitives';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import type { ConflictItem, ImportPreview, ImportReport } from '@shared/types';

type Mode = 'new' | 'merge' | 'overwrite' | 'add-only' | 'preview';
type ConflictStrategy = 'skip' | 'overwrite' | 'keep-both' | 'newer-wins' | 'ask';

const MODE_LABEL: Record<Mode, string> = {
  new: '新建档案库',
  merge: '合并到当前库',
  overwrite: '覆盖同 ID 档案',
  'add-only': '仅新增（跳过冲突）',
  preview: '仅预览'
};

const CONFLICT_LABEL: Record<ConflictStrategy, string> = {
  skip: '跳过',
  overwrite: '覆盖',
  'keep-both': '保留双方（生成冲突副本）',
  'newer-wins': '新者胜',
  ask: '逐个询问（默认保留双方）'
};

export default function Import(): React.ReactElement {
  const toast = useToast();
  const { refresh, openVault } = useAppStore();
  const [packagePath, setPackagePath] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<Mode>('merge');
  const [strategy, setStrategy] = React.useState<ConflictStrategy>('keep-both');
  const [targetPath, setTargetPath] = React.useState('');
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pickPackage = async (): Promise<void> => {
    const res = await api.openDialog({
      properties: ['openFile'],
      filters: [{ name: 'UEAP 包', extensions: ['ueap', 'zip'] }]
    });
    if (!res.canceled && res.path) {
      setPackagePath(res.path);
      setPreview(null);
      setReport(null);
    }
  };

  const pickTarget = async (): Promise<void> => {
    const res = await api.openDialog({ properties: ['openDirectory'] });
    if (!res.canceled && res.path) setTargetPath(res.path);
  };

  const onPreview = async (): Promise<void> => {
    if (!packagePath) return;
    setBusy(true);
    try {
      const p = (await api.import.preview({ packagePath, password: password || undefined })) as ImportPreview;
      setPreview(p);
      toast.success('预览完成', `${p.archiveCount} 篇档案，${p.conflicts.length} 处冲突`);
    } catch (err) {
      toast.error('预览失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (): Promise<void> => {
    if (!packagePath) return;
    if (mode === 'new' && !targetPath) {
      toast.error('请选择新建档案库的位置');
      return;
    }
    setBusy(true);
    try {
      const res = (await api.import.ueap({
        packagePath,
        mode,
        conflictStrategy: strategy,
        targetVaultPath: mode === 'new' ? targetPath : undefined,
        password: password || undefined
      })) as ImportReport;
      setReport(res);
      toast.success(
        '导入完成',
        `新增 ${res.created}｜更新 ${res.updated}｜跳过 ${res.skipped}｜冲突副本 ${res.conflictCopies}`
      );
      if (mode === 'new' && targetPath) await openVault(targetPath);
      await refresh();
    } catch (err) {
      toast.error('导入失败', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="text-lg font-semibold">导入 .ueap</h1>
        <p className="text-sm text-muted-foreground">
          导入前会自动生成当前档案库快照，随时可回滚；校验和不匹配时会拒绝导入
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选择包文件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={packagePath} readOnly placeholder="选择 .ueap 文件" />
            <Button variant="outline" onClick={() => void pickPackage()}>
              <FileUp className="h-4 w-4" />
              选择
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="加密包密码（如未加密可留空）"
            />
            <Button variant="outline" loading={busy} onClick={() => void onPreview()}>
              预览
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-sm font-medium">导入模式</div>
              <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">冲突策略</div>
              <Select value={strategy} onChange={(e) => setStrategy(e.target.value as ConflictStrategy)}>
                {(Object.keys(CONFLICT_LABEL) as ConflictStrategy[]).map((s) => (
                  <option key={s} value={s}>
                    {CONFLICT_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {mode === 'new' ? (
            <div className="flex gap-2">
              <Input value={targetPath} readOnly placeholder="新建档案库的目标文件夹" />
              <Button variant="outline" onClick={() => void pickTarget()}>
                选择位置
              </Button>
            </div>
          ) : null}

          <Button className="w-full" loading={busy} onClick={() => void onImport()} disabled={!packagePath}>
            开始导入
          </Button>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>包内容预览</CardTitle>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{preview.manifest.exportType}</Badge>
              <Badge variant="secondary">{preview.archiveCount} 篇档案</Badge>
              <Badge variant="secondary">{preview.attachmentCount} 个附件</Badge>
              {preview.manifest.encryption.enabled ? <Badge variant="warning">已加密</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <div>来源档案库：{preview.manifest.vaultName}</div>
              <div>导出时间：{preview.manifest.exportedAt}</div>
              <div>应用版本：{preview.manifest.appVersion}</div>
              <div>格式版本：{preview.manifest.version}</div>
            </div>

            {preview.conflicts.length > 0 ? (
              <Alert variant="warning">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  检测到 {preview.conflicts.length} 处冲突
                </div>
                <ul className="max-h-32 space-y-0.5 overflow-auto text-xs scrollbar-thin">
                  {preview.conflicts.slice(0, 30).map((c: ConflictItem) => (
                    <li key={c.archiveId}>
                      · {c.title}（{c.reason}）
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {preview.sample.length === 0 ? (
              <EmptyState title="包内没有档案" />
            ) : (
              <div className="max-h-64 overflow-auto rounded-lg border border-border scrollbar-thin">
                {preview.sample.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0">
                    <span className="truncate font-medium">{a.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{a.category}</span>
                    {a.sensitive ? <Badge variant="warning">敏感</Badge> : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {report ? (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">导入结果</div>
          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>模式：{MODE_LABEL[report.mode]}</div>
            <div>目标：{report.targetVaultPath}</div>
            <div>新增：{report.created}</div>
            <div>更新：{report.updated}</div>
            <div>跳过：{report.skipped}</div>
            <div>冲突副本：{report.conflictCopies}</div>
            {report.snapshotId ? <div className="sm:col-span-2">快照 ID：{report.snapshotId}（可在备份页回滚）</div> : null}
          </div>
        </Card>
      ) : null}

      <Alert>
        <span className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          导入会自动校验 checksums.sha256，任何文件被篡改都会中止导入。
        </span>
      </Alert>
    </div>
  );
}
