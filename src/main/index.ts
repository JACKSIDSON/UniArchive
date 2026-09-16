import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc/register';
import { setUserDataDir } from './core/paths';
import { setSnapshotProvider } from './import/ueap';
import { createSnapshot } from './backup/backup';
import { setNotifySink, allCommands, runPluginCommand } from './plugin/loader';
import { APP_NAME } from '@shared/constants';

const isDev = !app.isPackaged;

/**
 * 应用数据目录（设置、最近档案库、日志等）。
 *
 * 1. UNIARCHIVE_USER_DATA 优先级最高：自动化测试 / 绿色便携运行，
 *    避免把测试数据写进用户真实配置目录。
 * 2. 未打包运行时，Electron 的 app.getName() 是默认的 "Electron"，
 *    userData 会落到 %APPDATA%\Electron —— 那是所有未打包 Electron 程序共享的目录，
 *    往里写业务配置既会互相干扰也会污染用户环境。所以开发态改用独立目录。
 * 3. 打包后走 Electron 默认（%APPDATA%\uniarchive）。
 *
 * 注意：必须在 app ready 之前设置，否则 Chromium 已经用旧路径初始化了缓存。
 */
const USER_DATA_OVERRIDE =
  process.env['UNIARCHIVE_USER_DATA'] ??
  (isDev ? join(app.getPath('appData'), 'UniArchive-dev') : undefined);
if (USER_DATA_OVERRIDE) app.setPath('userData', USER_DATA_OVERRIDE);

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function buildMenu(): void {
  const pluginCommands = allCommands();
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建档案库', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('menu:newVault') },
        { label: '打开档案库', accelerator: 'CmdOrCtrl+O', click: () => send('menu:openVault') },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '实际大小', role: 'resetZoom' }
      ]
    },
    {
      label: '插件',
      submenu: pluginCommands.length
        ? pluginCommands.map((c) => ({
            label: `${c.pluginName}：${c.title}`,
            click: () => runPluginCommand(c.pluginId, c.commandId)
          }))
        : [{ label: '（未安装插件）', enabled: false }]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开当前档案库文件夹',
          click: () => send('menu:openVaultFolder')
        },
        { label: '关于', role: 'about' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function send(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function bootstrap(): void {
  setUserDataDir(USER_DATA_OVERRIDE || app.getPath('userData'));
  if (process.env['UNIARCHIVE_DEBUG_PATHS']) {
    // 诊断用：确认设置/日志实际落在哪个目录（排查「配置被写到共享 profile」这类问题）
    console.log('[uniarchive] userData =', app.getPath('userData'));
    console.log('[uniarchive] appName  =', app.getName(), '| isPackaged =', app.isPackaged);
  }
  registerIpc();
  setSnapshotProvider((label) => createSnapshot(label));
  setNotifySink((message) => send('plugin:notify', message));

  createWindow();
  buildMenu();

  // 菜单重建（插件加载后）
  ipcMain.on('app:refreshMenu', () => buildMenu());
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
