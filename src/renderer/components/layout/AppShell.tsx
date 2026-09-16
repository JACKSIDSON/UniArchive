import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderTree,
  Search,
  Tags,
  GitBranch,
  Clock,
  FileDown,
  FileUp,
  DatabaseBackup,
  Trash2,
  ScrollText,
  Settings as SettingsIcon,
  Moon,
  Sun,
  FolderOpen,
  Plus,
  ShieldCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/app';
import { Button } from '../ui/primitives';
import { useToast } from '../ui/toast';

const NAV = [
  { to: '/dashboard', label: '总览', icon: LayoutDashboard },
  { to: '/archives', label: '档案', icon: FolderTree },
  { to: '/search', label: '检索', icon: Search },
  { to: '/timeline', label: '时间线', icon: Clock },
  { to: '/tags', label: '标签', icon: Tags },
  { to: '/export', label: '导出', icon: FileDown },
  { to: '/import', label: '导入', icon: FileUp },
  { to: '/backup', label: '备份', icon: DatabaseBackup },
  { to: '/recycle', label: '回收站', icon: Trash2 },
  { to: '/logs', label: '日志', icon: ScrollText },
  { to: '/settings', label: '设置', icon: SettingsIcon }
];

function Sidebar(): React.ReactElement {
  const location = useLocation();
  const { info, vaultMeta } = useAppStore();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center gap-2 px-4 py-4">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">UniArchive</div>
          <div className="text-[11px] text-muted-foreground">大学电子档案库</div>
        </div>
      </div>

      {vaultMeta ? (
        <div className="mx-3 mb-3 rounded-lg border border-border bg-background/60 p-2.5">
          <div className="truncate text-xs font-medium" title={vaultMeta.name}>
            {vaultMeta.name}
          </div>
          <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
            <span>{info?.counts.archives ?? 0} 篇档案</span>
            <span>·</span>
            <span>{info?.counts.attachments ?? 0} 附件</span>
          </div>
        </div>
      ) : null}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 scrollbar-thin">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
        本地优先 · 文件夹即数据库
        <br />
        数据永远属于你
      </div>
    </aside>
  );
}

function TopBar(): React.ReactElement {
  const navigate = useNavigate();
  const { theme, setTheme, vaultPath, info } = useAppStore();
  const toast = useToast();

  const openFolder = async (): Promise<void> => {
    if (!vaultPath) return;
    try {
      await api.openPath(vaultPath);
    } catch (err) {
      toast.error('打开失败', (err as Error).message);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/40 px-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate('/')}>
          <FolderOpen className="h-4 w-4" />
          切换档案库
        </Button>
        {info ? (
          <span className="truncate text-xs text-muted-foreground" title={info.path}>
            {info.path}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => navigate('/archives?new=1')}>
          <Plus className="h-4 w-4" />
          新建档案
        </Button>
        {vaultPath ? (
          <Button size="sm" variant="ghost" onClick={() => void openFolder()} title="打开档案库文件夹">
            打开文件夹
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="切换明暗模式"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}

export function AppShell(): React.ReactElement {
  const navigate = useNavigate();
  const { vaultPath, ready, boot } = useAppStore();

  React.useEffect(() => {
    void boot();
  }, [boot]);

  /**
   * 只有 boot() 彻底跑完（ready）才判断「没有档案库」。
   * 否则在恢复上次会话的异步窗口里 vaultPath 仍为 null，
   * 会导致「在 dashboard 刷新页面被弹回 Welcome」。
   */
  React.useEffect(() => {
    if (ready && !vaultPath) navigate('/', { replace: true });
  }, [ready, vaultPath, navigate]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
