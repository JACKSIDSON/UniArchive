import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { readJsonFile, writeJsonFile, appSettingsFile } from '../core/paths';
import { getVaultConfig, updateVaultConfig } from '../core/vault';
import { logAction } from '../log/logger';
import { loadPlugins, listLoadedPlugins, runPluginCommand, allCommands } from '../plugin/loader';
import { DEFAULT_SETTINGS, APP_VERSION } from '@shared/constants';
import type { AppSettings } from '@shared/types';
import type { VaultConfig } from '../core/vault';

export function readAppSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readJsonFile<Partial<AppSettings>>(appSettingsFile(), {}) };
}

function writeAppSettings(next: AppSettings): AppSettings {
  writeJsonFile(appSettingsFile(), next);
  return next;
}

export function registerSettingsIpc(): void {
  handle<{ app: AppSettings; vault: VaultConfig; appVersion: string; pluginCommands: { pluginId: string; pluginName: string; commandId: string; title: string }[]; plugins: { id: string; name: string; version: string; description?: string }[] }>(
    IPC.SETTINGS_GET,
    () => ({
      app: readAppSettings(),
      vault: getVaultConfig(),
      appVersion: APP_VERSION,
      pluginCommands: allCommands(),
      plugins: listLoadedPlugins().map((p) => ({
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        description: p.manifest.description
      }))
    })
  );

  handle<{ app: AppSettings; vault: VaultConfig }>(IPC.SETTINGS_UPDATE, (payload) => {
    const p = (payload ?? {}) as { app?: Partial<AppSettings>; vault?: Partial<VaultConfig> };
    let app = readAppSettings();
    if (p.app) {
      app = writeAppSettings({ ...app, ...p.app });
    }
    let vault = getVaultConfig();
    if (p.vault) {
      vault = updateVaultConfig(p.vault);
    }
    logAction({ action: 'settings.update', detail: JSON.stringify({ app: p.app ?? null, vault: p.vault ?? null }) });
    return { app, vault };
  });

  /** 重新加载插件 */
  handle<{ id: string; name: string; version: string }[]>('plugin:reload', () => {
    const plugins = loadPlugins();
    return plugins.map((p) => ({ id: p.manifest.id, name: p.manifest.name, version: p.manifest.version }));
  });

  /** 执行插件命令 */
  handle<boolean>('plugin:run', (payload) => {
    const p = payload as { pluginId: string; commandId: string };
    return runPluginCommand(p.pluginId, p.commandId);
  });
}
