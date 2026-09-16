import * as React from 'react';
import { Search as SearchIcon, Clock, X } from 'lucide-react';
import { Button, Card, Input, Select, Badge, EmptyState } from '../components/ui/primitives';
import { api } from '../lib/api';
import { useKeyboardNav, useDebounced } from '../lib/hooks';
import { CATEGORIES, LEVELS } from '@shared/constants';
import type { SearchHit, SearchResult } from '@shared/types';
import { ArchiveRow, useOpenArchive } from '../components/archive/ArchiveForm';
import { useToast } from '../components/ui/toast';

const HISTORY_KEY = 'uniarchive.search.history';

export default function Search(): React.ReactElement {
  const toast = useToast();
  const openArchive = useOpenArchive();
  const [keyword, setKeyword] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [level, setLevel] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [result, setResult] = React.useState<SearchResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const debounced = useDebounced(keyword, 220);

  const run = React.useCallback(
    async (kw: string) => {
      setLoading(true);
      try {
        const res = (await api.search.query({
          keyword: kw || undefined,
          category: category || undefined,
          level: level || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          limit: 100
        })) as SearchResult;
        setResult(res);
      } catch (err) {
        toast.error('检索失败', (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [category, level, dateFrom, dateTo, toast]
  );

  React.useEffect(() => {
    void run(debounced);
  }, [debounced, run]);

  const pushHistory = (kw: string): void => {
    const k = kw.trim();
    if (!k) return;
    const next = [k, ...history.filter((h) => h !== k)].slice(0, 12);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const hits = result?.hits ?? [];
  const { activeIndex, setActiveIndex, onKeyDown } = useKeyboardNav<SearchHit>(hits, (item) =>
    openArchive(item)
  );

  return (
    <div className="space-y-4 p-5" onKeyDown={onKeyDown} tabIndex={0}>
      <div>
        <h1 className="text-lg font-semibold">检索</h1>
        <p className="text-sm text-muted-foreground">
          基于 SQLite FTS5 全文索引，支持中文关键词与多维筛选
        </p>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9"
            placeholder="输入关键词（标题 / 正文 / 标签）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pushHistory(keyword);
            }}
          />
          <Button size="sm" onClick={() => void run(keyword)} loading={loading}>
            搜索
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select className="h-8 w-52" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部分类</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select className="h-8 w-32" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">全部级别</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Input className="h-8 w-36" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">至</span>
          <Input className="h-8 w-36" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {(category || level || dateFrom || dateTo || keyword) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeyword('');
                setCategory('');
                setLevel('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              <X className="h-4 w-4" />
              重置
            </Button>
          )}
          {result ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {result.total} 条结果 · {result.tookMs}ms
            </span>
          ) : null}
        </div>
      </Card>

      {history.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            历史
          </span>
          {history.map((h) => (
            <Badge key={h} variant="outline" className="cursor-pointer" onClick={() => setKeyword(h)}>
              {h}
            </Badge>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {hits.length === 0 ? (
          <EmptyState
            title={loading ? '检索中…' : '没有匹配的档案'}
            description="关键词会同时匹配标题、正文与标签"
          />
        ) : (
          <div>
            {hits.map((item, idx) => (
              <div
                key={item.id}
                onMouseEnter={() => setActiveIndex(idx)}
                className={idx === activeIndex ? 'ring-1 ring-inset ring-primary/30' : ''}
              >
                <ArchiveRow item={item} active={idx === activeIndex} onOpen={openArchive} />
                {item.snippet ? (
                  <div className="border-b border-border px-3 pb-2 text-xs text-muted-foreground">
                    {item.snippet}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
