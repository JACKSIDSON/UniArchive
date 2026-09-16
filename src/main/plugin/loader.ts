import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { vaultPaths, ensureDir } from '../core/paths';
import { requireVaultRoot, getVaultConfig } from '../core/vault';
import { getArchive, listArchives } from '../core/archive';
import { logAction } from '../log/logger';
import type {
  LoadedPlugin,
  PluginApi,
  PluginCommand,
  PluginManifest,
  PluginMenuItem,
  PluginView,
  PluginActivator
} from './api';

/**
 * 插件加载器：从 .uniarchive/plugins/<plugin-id>/ 读取 plugin.json + main.js。
 * DECISION: 插件以 CommonJS require 载入（不打包、不沙箱），V1 仅本地可信插件。
 */

const loaded: Map<string, LoadedPlugin> = new Map();
let notifySink: ((message: string) => void) | null = null;

export function setNotifySink(fn: (message: string) => void): void {
  notifySink = fn;
}

function makeApi(plugin: LoadedPlugin): PluginApi {
  const root = requireVaultRoot();
  const vaultName = JSON.parse(fs.readFileSync(vaultPaths(root).vaultJson, 'utf8')).name as string;
  return {
    context: { vaultRoot: root, vaultName },
    registerCommand(command: PluginCommand): void {
      plugin.commands.push(command);
    },
    registerMenuItem(item: PluginMenuItem): void {
      plugin.menus.push(item);
    },
    registerView(view: PluginView): void {
      plugin.views.push(view);
    },
    archives: {
      list(keyword?: string) {
        return listArchives({ keyword, limit: 100 }).items;
      },
      get(id: string) {
        return getArchive(id);
      }
    },
    log(action, target, detail) {
      logAction({ action, target, detail });
    },
    notify(message: string) {
      notifySink?.(message);
    }
  };
}

export function pluginsDir(): string {
  return vaultPaths(requireVaultRoot()).plugins;
}

export function loadPlugins(): LoadedPlugin[] {
  if (!getVaultConfig().pluginsEnabled) return [];
  const dir = pluginsDir();
  ensureDir(dir);
  loaded.clear();

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(dir, entry.name);
    const manifest = readPluginManifestSafe(pluginDir);
    if (!manifest) continue;
    const plugin: LoadedPlugin = {
      manifest,
      dir: pluginDir,
      commands: [],
      menus: [],
      views: [],
      enabled: true
    };
    try {
      const mainFile = path.resolve(pluginDir, manifest.main ?? 'main.js');
      if (!fs.existsSync(mainFile)) continue;
      // DECISION: 使用 createRequire 载入本地插件，避免打包器处理动态路径
      const req = createRequire(import.meta.url);
      const mod = req(mainFile) as { activate?: PluginActivator } | PluginActivator;
      const activate = typeof mod === 'function' ? mod : mod.activate;
      if (typeof activate === 'function') {
        void activate(makeApi(plugin));
      }
      loaded.set(manifest.id, plugin);
    } catch (err) {
      logAction({
        action: 'settings.update',
        target: manifest.id,
        detail: `插件加载失败：${(err as Error).message}`
      });
    }
  }
  return [...loaded.values()];
}

function readPluginManifestSafe(dir: string): PluginManifest | null {
  const file = path.join(dir, 'plugin.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PluginManifest;
  } catch {
    return null;
  }
}

export function listLoadedPlugins(): LoadedPlugin[] {
  return [...loaded.values()];
}

export function runPluginCommand(pluginId: string, commandId: string): boolean {
  const plugin = loaded.get(pluginId);
  const command = plugin?.commands.find((c) => c.id === commandId);
  if (!plugin || !command) return false;
  void command.run();
  return true;
}

/** 所有插件注册的命令（供 UI 菜单渲染） */
export interface PluginCommandEntry {
  pluginId: string;
  pluginName: string;
  commandId: string;
  title: string;
}

export function allCommands(): PluginCommandEntry[] {
  const out: PluginCommandEntry[] = [];
  for (const plugin of loaded.values()) {
    for (const c of plugin.commands) {
      out.push({ pluginId: plugin.manifest.id, pluginName: plugin.manifest.name, commandId: c.id, title: c.title });
    }
  }
  return out;
}

export function allViews(): { pluginId: string; title: string; route: string }[] {
  const out: { pluginId: string; title: string; route: string }[] = [];
  for (const plugin of loaded.values()) {
    for (const v of plugin.views) {
      out.push({ pluginId: plugin.manifest.id, title: v.title, route: v.route });
    }
  }
  return out;
}
