import * as React from 'react';
import { Download, ScrollText } from 'lucide-react';
import { Button, Card, Input, Select, Badge, EmptyState } from '../components/ui/primitives';
import { useToast } from '../components/ui/toast';
import { api } from '../lib/api';
import { LOG_ACTIONS } from '@shared/constants';
import type { LogEntry } from '@shared/types';
import { formatDateTime } from '../lib/utils';

export default function Logs(): React.ReactElement {
  const toast = useToast();
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [action, setAction] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.log.list({
        action: action || undefined,
        keyword: keyword || undefined,
        limit: 300
      })) as { entries: LogEntry[]; total: number };
      setEntries(res.entries);
      setTotal(res.total);
    } catch (err) {
      toast.error('加载失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [action, keyword, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onExport = async (): Promise<void> => {
    const res = await api.saveDialog({
      defaultPath: `uniarchive-logs-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.path) return;
    try {
      await api.log.export({ outputPath: res.path, action: action || undefined, keyword: keyword || undefined });
      toast.success('日志已导出', res.path);
    } catch (err) {
      toast.error('导出失败', (err as Error).message);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">操作日志</h1>
          <p className="text-sm text-muted-foreground">
            所有写操作都会记录，同时以 JSONL 保存在 .uniarchive/logs/ 下
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void onExport()}>
          <Download className="h-4 w-4" />
          导出 JSON
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Select className="h-8 w-44" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">全部动作</option>
          {LOG_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input
          className="h-8 w-56"
          placeholder="关键词（目标 / 详情）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button variant="ghost" size="sm" loading={loading} onClick={() => void load()}>
          <ScrollText className="h-4 w-4" />
          刷新
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">共 {total} 条</span>
      </Card>

      {entries.length === 0 ? (
        <EmptyState title="暂无日志" description="进行操作后日志会自动出现在这里" />
      ) : (
        <Card className="overflow-hidden">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
              <Badge variant="secondary" className="mt-0.5 shrink-0">
                {e.action}
              </Badge>
              <div className="min-w-0 flex-1">
                {e.target ? <div className="truncate font-mono text-xs">{e.target}</div> : null}
                {e.detail ? <div className="truncate text-xs text-muted-foreground">{e.detail}</div> : null}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.timestamp)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
