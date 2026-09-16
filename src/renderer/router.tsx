import * as React from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import ArchiveList from './pages/ArchiveList';
import ArchiveDetail from './pages/ArchiveDetail';
import Search from './pages/Search';
import Tags from './pages/Tags';
import Timeline from './pages/Timeline';
import Export from './pages/Export';
import Import from './pages/Import';
import Backup from './pages/Backup';
import Recycle from './pages/Recycle';
import Logs from './pages/Logs';
import Settings from './pages/Settings';

/**
 * HashRouter（规格书指定）：打包后以 file:// 打开也能正常路由。
 */
export const router = createHashRouter([
  { path: '/', element: <Welcome /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'archives', element: <ArchiveList /> },
      { path: 'archives/:category', element: <ArchiveList /> },
      { path: 'archive/:id', element: <ArchiveDetail /> },
      { path: 'search', element: <Search /> },
      { path: 'tags', element: <Tags /> },
      { path: 'timeline', element: <Timeline /> },
      { path: 'export', element: <Export /> },
      { path: 'import', element: <Import /> },
      { path: 'backup', element: <Backup /> },
      { path: 'recycle', element: <Recycle /> },
      { path: 'logs', element: <Logs /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> }
    ]
  }
]);
