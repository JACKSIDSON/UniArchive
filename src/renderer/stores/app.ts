import { create } from 'zustand';
import { api } from '../lib/api';
import type { AppSettings, VaultInfo, VaultMeta } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

export interface VaultConfigShape {
  recycleTtlDays: number;
  autoBackup: boolean;
  autoBackupIntervalDays: number;
  blurSensitive: boolean;
  pageSize: number;
  lastBackupAt?: string;
  pluginsEnabled: boolean;
}

interface AppState {
  booted: boolean;
  /** boot() 是否已跑完（无论成功失败）。用于避免「恢复会话」期间被误判为未打开档案库。 */
  ready: boolean;
  busy: boolean;
  vaultPath: string | null;
  vaultMeta: VaultMeta | null;
  info: VaultInfo | null;
  appSettings: AppSettings;
  vaultConfig: VaultConfigShape | null;
  theme: 'light' | 'dark' | 'system';
  boot: () => Promise<void>;
  openVault: (path: string) => Promise<void>;
  createVault: (targetPath: string, name?: string) => Promise<void>;
  closeVault: () => Promise<void>;
  refresh: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  updateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateVaultConfig: (patch: Partial<VaultConfigShape>) => Promise<void>;
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

export const useAppStore = create<AppState>((set, get) => ({
  booted: false,
  ready: false,
  busy: false,
  vaultPath: null,
  vaultMeta: null,
  info: null,
  appSettings: { ...DEFAULT_SETTINGS },
  vaultConfig: null,
  theme: 'system',

  async boot() {
    if (get().booted) return;
    set({ booted: true });
    try {
      const settings = await api.settings.get();
      const app = settings.app as AppSettings;
      set({ appSettings: app, theme: app.theme ?? 'system' });
      applyTheme(app.theme ?? 'system');
      if (app.lastVaultPath) {
        try {
          const meta = await api.vault.open(app.lastVaultPath);
          set({ vaultPath: app.lastVaultPath, vaultMeta: meta });
          const info = await api.vault.info();
          set({ info, vaultConfig: (settings.vault as VaultConfigShape) ?? null });
        } catch {
          set({ vaultPath: null, vaultMeta: null });
        }
      }
    } catch {
      /* 设置读取失败时用默认值继续 */
    } finally {
      // 必须放在 finally：恢复会话失败时也要解除「未就绪」状态，
      // 否则重载后停在当前路由会被 AppShell 永久卡住。
      set({ ready: true });
    }
  },

  async openVault(path: string) {
    set({ busy: true });
    try {
      const meta = await api.vault.open(path);
      const info = await api.vault.info();
      const settings = await api.settings.get();
      set({
        vaultPath: path,
        vaultMeta: meta,
        info,
        vaultConfig: (settings.vault as VaultConfigShape) ?? null,
        appSettings: settings.app as AppSettings
      });
    } finally {
      set({ busy: false });
    }
  },

  async createVault(targetPath: string, name?: string) {
    set({ busy: true });
    try {
      const res = await api.vault.create({ targetPath, name, open: true });
      const info = await api.vault.info();
      const settings = await api.settings.get();
      set({
        vaultPath: targetPath,
        vaultMeta: res.meta,
        info,
        vaultConfig: (settings.vault as VaultConfigShape) ?? null,
        appSettings: settings.app as AppSettings
      });
    } finally {
      set({ busy: false });
    }
  },

  async closeVault() {
    set({ busy: true });
    try {
      await api.vault.close();
      set({ vaultPath: null, vaultMeta: null, info: null, vaultConfig: null });
    } finally {
      set({ busy: false });
    }
  },

  async refresh() {
    if (!get().vaultPath) return;
    const info = await api.vault.info();
    set({ info });
  },

  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
    void api.settings.update({ app: { theme } });
    const appSettings = { ...get().appSettings, theme };
    set({ appSettings });
  },

  async updateAppSettings(patch: Partial<AppSettings>) {
    const res = await api.settings.update({ app: patch });
    set({ appSettings: res.app as AppSettings });
  },

  async updateVaultConfig(patch: Partial<VaultConfigShape>) {
    const res = await api.settings.update({ vault: patch });
    set({ vaultConfig: (res.vault as VaultConfigShape) ?? null });
  }
}));
