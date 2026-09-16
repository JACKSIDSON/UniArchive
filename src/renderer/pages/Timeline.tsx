import * as React from 'react';
import { Printer, Image as ImageIcon, FileDown } from 'lucide-react';
import { Button, Card, Select, Input, EmptyState } from '../components/ui/primitives';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { CATEGORIES } from '@shared/constants';
import type { ArchiveListItem } from '@shared/types';
import { useOpenArchive } from '../components/archive/ArchiveForm';

interface Group {
  key: string;
  items: ArchiveListItem[];
}

export default function Timeline(): React.ReactElement {
  const toast = useToast();
  const openArchive = useOpenArchive();
  const [items, setItems] = React.useState<ArchiveListItem[]>([]);
  const [category, setCategory] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.archive.list({
        category: category || undefined,
        keyword: keyword || undefined,
        sort: 'date_desc',
        limit: 500
      })) as { items: ArchiveListItem[] };
      setItems(res.items.filter((i) => i.date));
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [category, keyword, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const groups: Group[] = React.useMemo(() => {
    const map = new Map<string, ArchiveListItem[]>();
    for (const item of items) {
      const key = (item.date ?? '').slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => ({ key, items: list }));
  }, [items]);

  /** 导出 PNG：用 Canvas 2D 手绘时间线，无需第三方依赖 */
  const exportPng = (): void => {
    const width = 1000;
    const rowH = 34;
    const height = 120 + groups.reduce((n, g) => n + 30 + g.items.length * rowH, 0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = dark ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillText('档案时间线', 40, 56);
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.fillText(`共 ${items.length} 篇档案 · ${new Date().toLocaleString('zh-CN')}`, 40, 82);

    let y = 120;
    for (const g of groups) {
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(g.key, 40, y);
      y += 12;
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 40, y);
      ctx.stroke();
      y += 22;
      for (const item of g.items) {
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(48, y - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
        ctx.font = '15px "Microsoft YaHei", sans-serif';
        ctx.fillText(`${item.date}　${item.title}（${item.category}）`.slice(0, 70), 66, y);
        y += rowH;
      }
      y += 12;
    }

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `timeline-${Date.now()}.png`;
    a.click();
    toast.success('已导出 PNG');
  };

  const exportPdf = (): void => {
    window.print();
    toast.info('已调用打印', '在打印对话框中选择「另存为 PDF」即可');
  };

  const exportMarkdown = (): void => {
    const lines = [`# 档案时间线`, '', `> 共 ${items.length} 篇档案`, ''];
    for (const g of groups) {
      lines.push(`## ${g.key}`, '');
      for (const item of g.items) {
        lines.push(`- ${item.date}　**${item.title}** — ${item.category}${item.issuer ? `（${item.issuer}）` : ''}`);
      }
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `timeline-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('已导出 Markdown');
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">时间线</h1>
          <p className="text-sm text-muted-foreground">按月份聚合档案，可导出为图片 / PDF / Markdown</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportMarkdown}>
            <FileDown className="h-4 w-4" />
            Markdown
          </Button>
          <Button variant="outline" size="sm" onClick={exportPng}>
            <ImageIcon className="h-4 w-4" />
            导出 PNG
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <Printer className="h-4 w-4" />
            打印 / PDF
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap gap-2 p-3">
        <Select className="h-8 w-52" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">全部分类</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input
          className="h-8 w-52"
          placeholder="关键词"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </Card>

      {groups.length === 0 ? (
        <EmptyState title="暂无带日期的档案" description="给档案填写 date 字段后即可在时间线中查看" />
      ) : (
        <div className="space-y-6 pl-2">
          {groups.map((g) => (
            <div key={g.key} className="relative border-l-2 border-primary/40 pl-6">
              <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-primary" />
              <div className="mb-2 text-sm font-semibold">{g.key}</div>
              <div className="space-y-1.5">
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openArchive(item)}
                    className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{item.date}</span>
                    <span className="ml-2 font-medium">{item.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{item.category}</span>
                    {item.level ? (
                      <span className="ml-2 text-xs text-muted-foreground">· {item.level}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
