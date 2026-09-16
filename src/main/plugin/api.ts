import path from 'node:path';
import fs from 'node:fs';
import type { Archive, ArchiveListItem, LogAction } from '@shared/types';

/**
 * 插件 API 骨架（V1）。
 * DECISION: V1 只提供「注册命令 / 注册菜单 / 注册视图 + 只读数据访问」，
 * 不开放任意文件写入，保证 Vault 数据不变量不被破坏。
 */

export interface PluginCommand {
  id: string;
  title: string;
  run: () => void | Promise<void>;
}

export interface PluginMenuItem {
  id: string;
  label: string;
  commandId: string;
}

export interface PluginView {
  id: string;
  title: string;
  /** 渲染进程中的路由哈希，例如 #/plugin/hello */
  route: string;
}

export interface PluginContext {
  vaultRoot: string;
  vaultName: string;
}

export interface PluginApi {
  readonly context: PluginContext;
  registerCommand(command: PluginCommand): void;
  registerMenuItem(item: PluginMenuItem): void;
  registerView(view: PluginView): void;
  /** 只读数据访问 */
  archives: {
    list(keyword?: string): ArchiveListItem[];
    get(id: string): Archive | null;
  };
  log(action: LogAction, target?: string, detail?: string): void;
  /** 通知渲染进程（用于刷新 UI） */
  notify(message: string): void;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  minAppVersion?: string;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  commands: PluginCommand[];
  menus: PluginMenuItem[];
  views: PluginView[];
  enabled: boolean;
}

export function readPluginManifest(dir: string): PluginManifest | null {
  const file = path.join(dir, 'plugin.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PluginManifest;
  } catch {
    return null;
  }
}

export type PluginActivator = (api: PluginApi) => void | Promise<void>;
