import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Paperclip, Download, ExternalLink, History } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Separator, Alert } from '../components/ui/primitives';
import { ConfirmDialog, Dialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import { formatBytes, formatDateTime } from '../lib/utils';
import { MarkdownView, SensitiveText } from '../components/archive/MarkdownView';
import { ArchiveFormDialog } from '../components/archive/ArchiveForm';
import type { Archive, Attachment, AttachmentPreview } from '@shared/types';

export default function ArchiveDetail(): React.ReactElement {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { vaultConfig, refresh } = useAppStore();

  const [archive, setArchive] = React.useState<Archive | null>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [preview, setPreview] = React.useState<AttachmentPreview | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const a = (await api.archive.get(id)) as Archive | null;
      setArchive(a);
      if (a) {
        const list = (await api.attachment.list(id)) as Attachment[];
        setAttachments(list);
      }
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      await api.archive.remove({ id });
      toast.success('已移入回收站', archive?.frontmatter.title ?? '');
      await refresh();
      navigate('/archives');
    } catch (err) {
      toast.error('删除失败', (err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const onUpload = async (): Promise<void> => {
    const res = await api.openDialog({ properties: ['openFile', 'multiSelections'] });
    if (res.canceled) return;
    setUploading(true);
    try {
      await api.attachment.add({ archiveId: id, sourcePaths: [res.path] });
      toast.success('附件已归档', '文件已复制到 assets/ 并计算 sha256');
      await load();
      await refresh();
    } catch (err) {
      toast.error('上传失败', (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onRemoveAttachment = async (att: Attachment): Promise<void> => {
    try {
      await api.attachment.remove(id, att.id);
      toast.success('附件已移入回收站');
      await load();
      await refresh();
    } catch (err) {
      toast.error('删除失败', (err as Error).message);
    }
  };

  const onPreview = async (att: Attachment): Promise<void> => {
    try {
      const p = (await api.attachment.preview({ path: att.path })) as AttachmentPreview;
      setPreview(p);
    } catch (err) {
      toast.error('预览失败', (err as Error).message);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  if (!archive) {
    return (
      <div className="p-6">
        <Alert variant="destructive">档案不存在或已被删除</Alert>
        <Button className="mt-3" variant="outline" onClick={() => navigate('/archives')}>
          返回列表
        </Button>
      </div>
    );
  }

  const fm = archive.frontmatter;

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          {fm.sensitive ? (
            <SensitiveText hidden={vaultConfig?.blurSensitive ?? true} className="text-xl font-semibold">
              {fm.title}
            </SensitiveText>
          ) : (
            <h1 className="truncate text-xl font-semibold">{fm.title}</h1>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge>{fm.category}</Badge>
            {fm.type ? <Badge variant="secondary">{fm.type}</Badge> : null}
            {fm.level ? <Badge variant="secondary">{fm.level}</Badge> : null}
            {fm.sensitive ? <Badge variant="warning">敏感</Badge> : null}
            <span>· {fm.date ?? '未标注日期'}</span>
            {fm.issuer ? <span>· {fm.issuer}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            编辑
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            删除
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>正文</CardTitle>
            </CardHeader>
            <CardContent>
              {fm.sensitive && vaultConfig?.blurSensitive ? (
                <SensitiveText>
                  <MarkdownView content={archive.body} />
                </SensitiveText>
              ) : (
                <MarkdownView content={archive.body} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                附件（{attachments.length}）
              </CardTitle>
              <Button size="sm" variant="outline" loading={uploading} onClick={() => void onUpload()}>
                添加附件
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {attachments.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无附件</div>
              ) : (
                attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{att.path.split('/').pop()}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(att.size)} · {att.mime} · {formatDateTime(att.createdAt)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">sha256: {att.hash}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void onPreview(att)}>
                      预览
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void api.openPath(att.path).catch(() => toast.error('无法打开'))}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const name = att.path.split('/').pop() ?? 'attachment';
                        const a = document.createElement('a');
                        a.href = `file:///${att.path}`;
                        a.download = name;
                        a.click();
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => void onRemoveAttachment(att)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>元信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="ID" value={<span className="font-mono text-xs">{fm.id}</span>} />
              <Row label="版本" value={<span className="flex items-center gap-1"><History className="h-3.5 w-3.5" />v{fm.version}</span>} />
              <Row label="创建时间" value={formatDateTime(fm.created_at)} />
              <Row label="更新时间" value={formatDateTime(fm.updated_at)} />
              <Row label="文件路径" value={<span className="break-all font-mono text-xs">{archive.filePath}</span>} />
              <Separator />
              <div className="flex flex-wrap gap-1">
                {fm.tags.length ? (
                  fm.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">无标签</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="p-4 text-xs text-muted-foreground">
            该档案是 Vault 中的一个普通 Markdown 文件，位于：
            <div className="mt-1 break-all font-mono">{archive.filePath}</div>
            <div className="mt-2">即使卸载 UniArchive，也可以直接用文本编辑器打开阅读。</div>
          </Card>
        </div>
      </div>

      <ArchiveFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        archiveId={id}
        initial={{
          title: fm.title,
          category: fm.category,
          type: fm.type ?? '',
          date: fm.date ?? '',
          tags: fm.tags,
          issuer: fm.issuer ?? '',
          level: fm.level ?? '',
          sensitive: fm.sensitive,
          body: archive.body,
          files: fm.files
        }}
        onSaved={() => {
          void load();
          void refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="确认删除这篇档案？"
        description="档案与其附件会一起移入回收站，保留期内可随时恢复。"
        loading={deleting}
        onConfirm={() => void onDelete()}
      />

      <Dialog
        open={preview !== null}
        onOpenChange={() => setPreview(null)}
        title="附件预览"
        size="xl"
      >
        {preview ? (
          <div className="space-y-3">
            {preview.kind === 'image' && preview.dataUrl ? (
              <img src={preview.dataUrl} alt={preview.path} className="max-h-[60vh] w-full object-contain" />
            ) : preview.kind === 'text' && preview.text ? (
              <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs scrollbar-thin">
                {preview.text}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                该类型暂不支持内联预览
                <div className="mt-2 break-all font-mono text-xs">{preview.path}</div>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void api.openPath(preview.absolutePath).catch(() => toast.error('无法打开'))}
              >
                用系统默认程序打开
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
