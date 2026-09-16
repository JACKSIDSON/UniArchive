import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Eye, Lock, FileText } from 'lucide-react';
import type { ArchiveCategory, ArchiveLevel, ArchiveListItem } from '@shared/types';
import { CATEGORIES, LEVELS } from '@shared/constants';
import { formatDate } from '../../lib/utils';
import { api } from '../../lib/api';
import { Badge, Button, Card, Input, Label, Select, Textarea, Checkbox } from '../ui/primitives';
import { Dialog } from '../ui/dialog';
import { SensitiveText } from './MarkdownView';
import { useToast } from '../ui/toast';

/* ------------------------------ 档案行 ------------------------------- */

export function ArchiveRow({
  item,
  active,
  selected,
  onToggleSelect,
  onOpen,
  blurSensitive = true
}: {
  item: ArchiveListItem;
  active?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen: (item: ArchiveListItem) => void;
  blurSensitive?: boolean;
}): React.ReactElement {
  return (
    <div
      onClick={() => onOpen(item)}
      className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-sm transition-colors ${
        active ? 'bg-primary/10' : 'hover:bg-accent/50'
      }`}
    >
      {onToggleSelect ? (
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(item.id)}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
      ) : null}
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.sensitive && blurSensitive ? (
            <SensitiveText className="truncate font-medium">{item.title}</SensitiveText>
          ) : (
            <span className="truncate font-medium">{item.title}</span>
          )}
          {item.sensitive ? (
            <Badge variant="warning" className="gap-1">
              <Lock className="h-3 w-3" />
              敏感
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{item.category}</span>
          {item.date ? <span>· {item.date}</span> : null}
          {item.issuer ? <span>· {item.issuer}</span> : null}
          {item.level ? <span>· {item.level}</span> : null}
          {item.tags.length ? (
            <span className="flex gap-1">
              {item.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
      </div>
      {item.attachmentCount > 0 ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          {item.attachmentCount}
        </span>
      ) : null}
      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
        {formatDate(item.updated_at)}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item);
        }}
        title="打开"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ----------------------------- 档案表单 ------------------------------ */

export interface ArchiveFormValue {
  title: string;
  category: ArchiveCategory;
  type: string;
  date: string;
  tags: string[];
  issuer: string;
  level: ArchiveLevel | '';
  sensitive: boolean;
  body: string;
  files: string[];
}

export const emptyForm: ArchiveFormValue = {
  title: '',
  category: '荣誉实践/荣誉奖项',
  type: '证书',
  date: new Date().toISOString().slice(0, 10),
  tags: [],
  issuer: '',
  level: '',
  sensitive: false,
  body: '## 备注\n',
  files: []
};

export function ArchiveFormDialog({
  open,
  onOpenChange,
  initial,
  archiveId,
  onSaved
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ArchiveFormValue>;
  archiveId?: string;
  onSaved?: (id: string) => void;
}): React.ReactElement {
  const [form, setForm] = React.useState<ArchiveFormValue>({ ...emptyForm, ...initial });
  const [tagText, setTagText] = React.useState((initial?.tags ?? []).join(', '));
  const [saving, setSaving] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, ...initial });
      setTagText((initial?.tags ?? []).join(', '));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, archiveId]);

  const submit = async (): Promise<void> => {
    if (!form.title.trim()) {
      toast.error('请填写标题');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        type: form.type || undefined,
        date: form.date || undefined,
        tags: tagText
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        issuer: form.issuer || undefined,
        level: form.level || undefined,
        sensitive: form.sensitive,
        body: form.body,
        files: form.files
      };
      if (archiveId) {
        await api.archive.update(archiveId, payload);
        toast.success('已保存', form.title);
        onSaved?.(archiveId);
      } else {
        const created = (await api.archive.create(payload)) as { frontmatter: { id: string } };
        toast.success('已创建档案', form.title);
        onSaved?.(created.frontmatter.id);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error('保存失败', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={archiveId ? '编辑档案' : '新建档案'}
      description="档案将以 Markdown + YAML frontmatter 写入你的 Vault，随时可用文本编辑器打开"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {archiveId ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>标题</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="例如：校级专业竞赛二等奖"
          />
        </div>
        <div className="space-y-1.5">
          <Label>分类</Label>
          <Select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ArchiveCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>类型</Label>
          <Input
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            placeholder="证书 / 成绩单 / 证明…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>日期</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>级别</Label>
          <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as ArchiveLevel | '' })}>
            <option value="">（未指定）</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>颁发单位</Label>
          <Input
            value={form.issuer}
            onChange={(e) => setForm({ ...form, issuer: e.target.value })}
            placeholder="例如：XX大学"
          />
        </div>
        <div className="space-y-1.5">
          <Label>标签（逗号分隔）</Label>
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="竞赛, 评优" />
        </div>
        <div className="col-span-2 flex items-center gap-4 pt-1">
          <Checkbox
            label="标记为敏感档案（默认模糊显示）"
            checked={form.sensitive}
            onChange={(e) => setForm({ ...form, sensitive: e.target.checked })}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>正文（Markdown）</Label>
          <Textarea
            className="min-h-[140px] font-mono text-xs"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>
      </div>
    </Dialog>
  );
}

/** 档案统计卡 */
export function StatCard({
  title,
  value,
  hint,
  icon
}: {
  title: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
}): React.ReactElement {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
          {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
        </div>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>
    </Card>
  );
}

export function useOpenArchive(): (item: ArchiveListItem) => void {
  const navigate = useNavigate();
  return React.useCallback((item: ArchiveListItem) => navigate(`/archive/${item.id}`), [navigate]);
}
