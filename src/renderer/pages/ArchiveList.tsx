import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Filter, X } from 'lucide-react';
import { Button, Card, Input, Select, Badge, EmptyState, Checkbox } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app';
import { useKeyboardNav, useDebounced } from '../lib/hooks';
import { CATEGORIES, TOP_CATEGORIES, LEVELS } from '@shared/constants';
import type { ArchiveListItem } from '@shared/types';
import { ArchiveRow, ArchiveFormDialog, useOpenArchive } from '../components/archive/ArchiveForm';

export default function ArchiveList(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? undefined;
  const toast = useToast();
  const openArchive = useOpenArchive();
  const { refresh, vaultConfig } = useAppStore();

  const [items, setItems] = React.useState<ArchiveListItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');
  const [type, setType] = React.useState('');
  const [level, setLevel] = React.useState('');
  const [sort, setSort] = React.useState('date_desc');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showForm, setShowForm] = React.useState(params.get('new') === '1');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const debouncedKeyword = useDebounced(keyword, 300);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.archive.list({
        category,
        keyword: debouncedKeyword || undefined,
        type: type || undefined,
        level: level || undefined,
        sort,
        limit: 200,
        offset: 0
      })) as { items: ArchiveListItem[]; total: number };
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [category, debouncedKeyword, type, level, sort, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (params.get('new') === '1') setShowForm(true);
  }, [params]);

  const { activeIndex, setActiveIndex, onKeyDown } = useKeyboardNav<ArchiveListItem>(items, (item) =>
    openArchive(item)
  );

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onBatchDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      const res = await api.archive.remove({ ids: [...selected] });
      toast.success(`已移入回收站 ${res.deleted} 篇`, '回收站保留期内可随时恢复');
      setSelected(new Set());
      setConfirmDelete(false);
      await load();
      await refresh();
    } catch (err) {
      toast.error('删除失败', (err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = (): void => {
    setKeyword('');
    setType('');
    setLevel('');
    setParams({});
  };

  return (
    <div className="space-y-4 p-5" onKeyDown={onKeyDown} tabIndex={0}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">档案浏览</h1>
          <p className="text-sm text-muted-foreground">
            {category ? `分类：${category}` : '全部分类'} · 共 {total} 篇
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              删除所选（{selected.size}）
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            新建档案
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-52"
            placeholder="标题关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            className="h-8 w-52"
            value={category ?? ''}
            onChange={(e) => setParams(e.target.value ? { category: e.target.value } : {})}
          >
            <option value="">全部分类</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input className="h-8 w-32" placeholder="类型" value={type} onChange={(e) => setType(e.target.value)} />
          <Select className="h-8 w-32" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">全部级别</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Select className="h-8 w-36" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date_desc">日期从新到旧</option>
            <option value="date_asc">日期从旧到新</option>
            <option value="updated_desc">最近更新</option>
            <option value="title_asc">标题排序</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
            清除筛选
          </Button>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="h-3 w-3" />
            ↑↓ 选择 · Enter 打开
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : items.length === 0 ? (
          <EmptyState
            title="没有符合条件的档案"
            description="试试清除筛选，或新建一篇档案"
            action={
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                新建档案
              </Button>
            }
          />
        ) : (
          <div>
            {items.map((item, idx) => (
              <div
                key={item.id}
                onMouseEnter={() => setActiveIndex(idx)}
                className={idx === activeIndex ? 'ring-1 ring-inset ring-primary/30' : ''}
              >
                <ArchiveRow
                  item={item}
                  active={idx === activeIndex}
                  selected={selected.has(item.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={openArchive}
                  blurSensitive={vaultConfig?.blurSensitive ?? true}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {TOP_CATEGORIES.map((top) => (
          <Badge
            key={top}
            variant={category?.startsWith(top) ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setParams({ category: CATEGORIES.find((c) => c.startsWith(top)) ?? '' })}
          >
            {top}
          </Badge>
        ))}
        <Checkbox
          className="ml-auto"
          label="全选本页"
          checked={items.length > 0 && selected.size === items.length}
          onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
        />
      </div>

      <ArchiveFormDialog
        open={showForm}
        onOpenChange={(v) => {
          setShowForm(v);
          if (!v && params.get('new')) setParams({});
        }}
        initial={category ? { category: category as ArchiveListItem['category'] } : undefined}
        onSaved={() => {
          void load();
          void refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`确认删除 ${selected.size} 篇档案？`}
        description="删除后会移入回收站，保留期内可随时恢复；附件会随档案一起进入回收站。"
        loading={deleting}
        onConfirm={() => void onBatchDelete()}
      />
    </div>
  );
}
