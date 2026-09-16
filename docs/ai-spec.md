UniArchive AI 开发规格书
开源 · 本地优先 · Obsidian 式大学生电子档案库
0. 给 AI 执行者的元指令
你是本项目的唯一开发者。请严格按本文档执行，不要自行更改技术栈、目录结构、数据格式、IPC 通道名。

执行规则：

按 Phase 顺序开发，每个 Phase 完成后必须通过该 Phase 的“验收清单”才能进入下一个。

所有数据结构、文件格式、IPC 通道名必须与本文档完全一致，不得重命名。

不允许引入本文档未列出的重型依赖（如 Redux、Prisma、NestJS、Next.js）。

所有本地数据必须可被外部工具读取（Markdown + YAML + 普通文件 + ZIP）。

遇到本文档未覆盖的细节，选择“最简单、最开放、最可迁移”的方案，并在代码注释中标记 // DECISION:。

每完成一个 Phase，输出：变更文件列表 + 验收自测结果 + 遗留问题。

交付目标：一个可运行的 Electron 桌面应用，能新建 Vault、归档档案、检索、导出 .ueap、导入 .ueap。

1. 项目定义
一句话：UniArchive 是一个本地优先、文件夹即数据库、支持一键打包导出与加载的开源大学生电子档案库。

核心概念：

Vault：一个本地文件夹，是系统的最小数据单元。

档案条目：一个 Markdown 文件，含 YAML frontmatter + 正文。

附件：普通文件，存于 assets/。

索引：SQLite FTS5，可删除重建，不锁定数据。

UEAP：UniArchive Package，.ueap 文件，本质是 ZIP。

插件：可扩展模块，V1 只提供 API 骨架。

数据不变量（任何情况下不可违反）：

删除 index.db 后，Vault 仍完整可用，索引可重建。

卸载软件后，用户可直接用文本编辑器阅读所有档案。

所有档案必须有唯一 id（UUID v4）。

所有附件路径相对于 Vault 根目录。

.ueap 可改名为 .zip 后直接解压。

2. 技术栈（锁定，不得更改）
层	选型
桌面容器	Electron 30+
构建	Vite 5 + electron-vite
前端	React 18 + TypeScript 5
样式	Tailwind CSS 3 + shadcn/ui
状态	Zustand
路由	React Router 6（HashRouter）
本地数据库	better-sqlite3（启用 FTS5）
文件监听	chokidar
Markdown	gray-matter + unified + remark
ZIP	adm-zip
加密	Node crypto（AES-256-GCM）+ argon2
UUID	uuid
测试	Vitest（单元）+ Playwright（E2E）
包管理	pnpm
禁止使用：Redux、MobX、Prisma、TypeORM、Next.js、NestJS、任何云端 SDK、任何需要联网才能启动的依赖。

3. 仓库目录结构（精确，不得更改）
text
uniarchive/
├── package.json
├── pnpm-workspace.yaml
├── electron.vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── README.md
├── LICENSE
├── ROADMAP.md
├── docs/
│   ├── format.md              # Vault 与 UEAP 格式说明
│   ├── plugin-api.md
│   └── ai-spec.md             # 本文档
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── register.ts
│   │   │   ├── vault.ipc.ts
│   │   │   ├── archive.ipc.ts
│   │   │   ├── attachment.ipc.ts
│   │   │   ├── search.ipc.ts
│   │   │   ├── tag.ipc.ts
│   │   │   ├── export.ipc.ts
│   │   │   ├── import.ipc.ts
│   │   │   ├── backup.ipc.ts
│   │   │   ├── recycle.ipc.ts
│   │   │   ├── log.ipc.ts
│   │   │   └── settings.ipc.ts
│   │   ├── core/
│   │   │   ├── vault.ts
│   │   │   ├── archive.ts
│   │   │   ├── attachment.ts
│   │   │   ├── frontmatter.ts
│   │   │   ├── naming.ts
│   │   │   ├── hash.ts
│   │   │   └── paths.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.sql
│   │   │   ├── migrate.ts
│   │   │   └── fts.ts
│   │   ├── export/
│   │   │   ├── ueap.ts
│   │   │   ├── templates.ts
│   │   │   └── encrypt.ts
│   │   ├── import/
│   │   │   ├── ueap.ts
│   │   │   └── conflict.ts
│   │   ├── backup/
│   │   │   ├── backup.ts
│   │   │   └── restore.ts
│   │   ├── recycle/
│   │   │   └── recycle.ts
│   │   ├── log/
│   │   │   └── logger.ts
│   │   └── plugin/
│   │       ├── loader.ts
│   │       └── api.ts
│   ├── preload/
│   │   └── index.ts           # contextBridge 暴露 window.api
│   ├── renderer/              # React 前端
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── pages/
│   │   │   ├── Welcome.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ArchiveList.tsx
│   │   │   ├── ArchiveDetail.tsx
│   │   │   ├── Search.tsx
│   │   │   ├── Tags.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── Export.tsx
│   │   │   ├── Import.tsx
│   │   │   ├── Backup.tsx
│   │   │   ├── Recycle.tsx
│   │   │   ├── Logs.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   ├── stores/
│   │   └── lib/
│   └── shared/                # 主进程与渲染进程共享类型
│       ├── types.ts
│       ├── ipc-channels.ts
│       └── constants.ts
├── tests/
│   ├── unit/
│   └── e2e/
└── examples/
    └── demo-vault/
4. 核心数据模型（TypeScript 类型，必须一致）
文件：src/shared/types.ts

ts
export type ArchiveCategory =
  | '学业档案/学籍档案'
  | '学业档案/课程资料档案'
  | '学业档案/学业成绩档案'
  | '学业档案/作业考试档案'
  | '学业档案/教材工具档案'
  | '学业档案/科研学业档案'
  | '荣誉实践/荣誉奖项'
  | '荣誉实践/学科竞赛'
  | '荣誉实践/学生工作任职'
  | '荣誉实践/志愿服务'
  | '荣誉实践/实习实践'
  | '荣誉实践/科研创新'
  | '生活行政/个人证件'
  | '生活行政/健康档案'
  | '生活行政/校园行政'
  | '生活行政/缴费凭证'
  | '生活行政/校园凭证';

export interface ArchiveFrontmatter {
  id: string;                 // UUID v4
  title: string;
  category: ArchiveCategory;
  type?: string;              // 证书/成绩单/证明...
  date?: string;              // ISO 8601，如 2026-09-01
  tags: string[];
  issuer?: string;
  level?: '国家级' | '省级' | '市级' | '校级' | '院级' | '其他';
  files: string[];            // 相对 Vault 根的路径
  sensitive: boolean;
  version: number;
  created_at: string;         // ISO 8601
  updated_at: string;
  extra?: Record<string, unknown>;
}

export interface Archive {
  frontmatter: ArchiveFrontmatter;
  body: string;               // Markdown 正文
  filePath: string;           // 相对 Vault 根
}

export interface VaultMeta {
  vaultId: string;
  name: string;
  createdAt: string;
  appVersion: string;
  formatVersion: '1.0';
}

export interface Attachment {
  id: string;
  archiveId: string;
  path: string;               // 相对 Vault 根
  mime: string;
  size: number;
  hash: string;               // sha256
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  builtin: boolean;
}

export interface LogEntry {
  id: string;
  action:
    | 'vault.create' | 'vault.open' | 'vault.close'
    | 'archive.create' | 'archive.update' | 'archive.delete'
    | 'attachment.add' | 'attachment.delete'
    | 'export.ueap' | 'import.ueap'
    | 'backup.create' | 'backup.restore'
    | 'recycle.restore' | 'recycle.purge'
    | 'settings.update';
  target?: string;
  detail?: string;
  timestamp: string;
}

export interface ExportOptions {
  scope:
    | { kind: 'full' }
    | { kind: 'category'; category: ArchiveCategory }
    | { kind: 'filter'; archiveIds: string[] }
    | { kind: 'template'; template: '评优' | '求职' | '升学' | '答辩' };
  includeAttachments: boolean;
  encrypt?: { password: string };
  outputPath: string;
}

export interface ImportOptions {
  packagePath: string;
  mode: 'new' | 'merge' | 'overwrite' | 'add-only' | 'preview';
  conflictStrategy: 'skip' | 'overwrite' | 'keep-both' | 'newer-wins' | 'ask';
  targetVaultPath?: string;
}

export interface ConflictItem {
  archiveId: string;
  title: string;
  reason: 'id-exists' | 'hash-differs' | 'path-conflict';
  resolution?: 'skip' | 'overwrite' | 'keep-both' | 'newer-wins';
}

export interface UeapManifest {
  format: 'UEAP';
  version: '1.0';
  app: 'UniArchive';
  appVersion: string;
  vaultId: string;
  vaultName: string;
  exportType: string;
  exportedAt: string;
  exportedBy?: string;
  encryption: { enabled: boolean; algorithm: 'AES-256-GCM' | null };
  checksums: 'checksums.sha256';
  compatibility: { minAppVersion: string; formatVersion: '1.0' };
}
5. 文件系统格式规范
5.1 Vault 结构（必须精确）
text
<vault>/
├── vault.json
├── README.md
├── archives/
│   └── <一级分类>/<二级分类>/【分类】-时间-名称-标签.md
├── assets/
│   └── <YYYY>/<MM>/<uuid>-<原文件名>
└── .uniarchive/
    ├── config.json
    ├── index.db
    ├── tags.json
    ├── templates/
    ├── plugins/
    ├── themes/
    ├── backups/
    ├── logs/
    └── recycle/
        └── <recycleId>/...
5.2 vault.json
json
{
  "vaultId": "uuid-v4",
  "name": "我的大学档案库",
  "createdAt": "2026-09-12T10:00:00+08:00",
  "appVersion": "1.0.0",
  "formatVersion": "1.0"
}
5.3 档案 Markdown 示例
markdown
---
id: 8f3c2a1e-1111-2222-3333-444455556666
title: 校级专业竞赛二等奖
category: 荣誉实践/学科竞赛
type: 证书
date: 2026-09-01
tags:
  - 竞赛
  - 评优
issuer: XX大学
level: 校级
files:
  - assets/2026/09/8f3c2a1e-证书.pdf
sensitive: false
version: 1
created_at: 2026-09-12T10:00:00+08:00
updated_at: 2026-09-12T10:00:00+08:00
---

## 备注
校级专业竞赛二等奖，可用于评优和求职材料。
5.4 命名规范
档案文件名：【二级分类】-YYYY.MM-标题-标签1,标签2.md

非法字符 \/:*?"<>| 替换为 _

重名追加 -1、-2

附件文件名：<uuid>-<sanitized原文件名>

5.5 UEAP 包结构
text
example.ueap                (ZIP)
├── manifest.json
├── checksums.sha256
├── README.md
└── vault/
    ├── vault.json
    ├── archives/
    ├── assets/
    └── .uniarchive/
        ├── config.json
        ├── tags.json
        └── templates/
注意：UEAP 中不包含 index.db、logs/、backups/、recycle/。

5.6 加密规则
算法：AES-256-GCM

密钥派生：Argon2id（默认参数：memory=64MB, iterations=3, parallelism=1）

加密对象：整个 vault/ 打包后的 ZIP 内容

manifest.json 不加密

加密后 manifest 增加 encryption.enabled=true

6. SQLite Schema（必须一致）
文件：src/main/db/schema.sql

sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS archives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT,
  date TEXT,
  issuer TEXT,
  level TEXT,
  sensitive INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  file_path TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS archive_tags (
  archive_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (archive_id, tag_id),
  FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  timestamp TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS archives_fts USING fts5(
  title, body, tags,
  content='archives',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS archives_ai AFTER INSERT ON archives BEGIN
  INSERT INTO archives_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, '');
END;

CREATE TRIGGER IF NOT EXISTS archives_ad AFTER DELETE ON archives BEGIN
  INSERT INTO archives_fts(archives_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, '');
END;

CREATE TRIGGER IF NOT EXISTS archives_au AFTER UPDATE ON archives BEGIN
  INSERT INTO archives_fts(archives_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, '');
  INSERT INTO archives_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, '');
END;
索引重建原则：扫描 archives/ 下所有 .md，解析 frontmatter，写入 archives 表，再重建 FTS。

7. IPC 通道契约（必须一致）
文件：src/shared/ipc-channels.ts

ts
export const IPC = {
  VAULT_CREATE: 'vault:create',
  VAULT_OPEN: 'vault:open',
  VAULT_CLOSE: 'vault:close',
  VAULT_INFO: 'vault:info',
  VAULT_REINDEX: 'vault:reindex',
  VAULT_VALIDATE: 'vault:validate',

  ARCHIVE_CREATE: 'archive:create',
  ARCHIVE_UPDATE: 'archive:update',
  ARCHIVE_DELETE: 'archive:delete',
  ARCHIVE_GET: 'archive:get',
  ARCHIVE_LIST: 'archive:list',

  ATTACHMENT_ADD: 'attachment:add',
  ATTACHMENT_DELETE: 'attachment:delete',
  ATTACHMENT_PREVIEW: 'attachment:preview',

  SEARCH_QUERY: 'search:query',

  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_DELETE: 'tag:delete',

  EXPORT_UEAP: 'export:ueap',
  EXPORT_TEMPLATE: 'export:template',
  IMPORT_UEAP: 'import:ueap',
  IMPORT_PREVIEW: 'import:preview',

  BACKUP_CREATE: 'backup:create',
  BACKUP_LIST: 'backup:list',
  BACKUP_RESTORE: 'backup:restore',

  RECYCLE_LIST: 'recycle:list',
  RECYCLE_RESTORE: 'recycle:restore',
  RECYCLE_PURGE: 'recycle:purge',

  LOG_LIST: 'log:list',
  LOG_EXPORT: 'log:export',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
} as const;
所有通道统一返回：

ts
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; detail?: unknown } };
8. 开发阶段（必须按顺序）
每个 Phase 必须通过验收后才能进入下一个。

Phase 0：项目脚手架
交付：

pnpm workspace + electron-vite + React + TS + Tailwind

主进程/预加载/渲染进程三端可启动

window.api 通过 contextBridge 暴露，含一个 ping 方法

Vitest 跑通一个空测试

验收：

pnpm dev 启动空白窗口，控制台输出 pong

Phase 1：Vault 核心读写
交付：

core/vault.ts：createVault、openVault、closeVault、getVaultInfo、validateVault

core/frontmatter.ts：parse/serialize

core/naming.ts：生成档案文件名

core/paths.ts：所有路径解析函数

IPC：vault:*

验收：

新建 Vault 生成完整目录树（含空 .uniarchive/）

打开已有 Vault 校验 vault.json

删除 index.db 后 openVault 可正常启动

Phase 2：档案 CRUD
交付：

core/archive.ts：createArchive、getArchive、updateArchive、deleteArchive、listArchives

写 Markdown 时严格使用第 5.3 节格式

IPC：archive:*

验收：

创建档案后，archives/ 下出现正确命名的 .md

更新档案时 updated_at 变化，version 递增

删除档案时文件移入 .uniarchive/recycle/

Phase 3：附件管理
交付：

core/attachment.ts：addAttachment（复制 + sha256 + 去重）、deleteAttachment

附件按 assets/YYYY/MM/ 存放

IPC：attachment:*

验收：

上传同名文件不覆盖，返回已存在记录

删除档案时附件进入回收站

Phase 4：SQLite 索引与检索
交付：

db/index.ts：打开/关闭数据库、执行 schema

db/migrate.ts：schema 版本管理

db/fts.ts：全文检索

vault.reindex：扫描 archives 目录重建索引

IPC：search:query

验收：

10 万条模拟档案检索 ≤0.5s

删除 index.db 后可一键重建，结果一致

支持按 category、tag、date 范围、type 组合筛选

Phase 5：标签系统
交付：

tags.json 与 SQLite tags 表双向同步

预设标签：学业、荣誉、竞赛、实习、评优、求职、科研

IPC：tag:*

验收：

新建标签同时写入 tags.json 和数据库

删除标签自动解除档案关联

Phase 6：UEAP 导出
交付：

export/ueap.ts：导出全库/分类/筛选/模板

export/encrypt.ts：AES-256-GCM + Argon2id

export/templates.ts：评优、求职、升学、答辩

生成 manifest.json、checksums.sha256、README.md

IPC：export:*

验收：

导出 .ueap 可改名为 .zip 直接解压

加密导出密码错误无法解压

校验和不匹配时导入报错

Phase 7：UEAP 导入
交付：

import/ueap.ts：new / merge / overwrite / add-only / preview

import/conflict.ts：冲突检测与策略

导入前生成当前 Vault 快照

IPC：import:*

验收：

五种模式均可工作

冲突时生成 .conflict 副本

导入后可回滚

Phase 8：备份、回收站、日志
交付：

backup/*：手动/自动备份、按版本恢复

recycle/*：30 天回收站

log/logger.ts：所有操作写日志

IPC：backup:*、recycle:*、log:*

验收：

删除档案 30 天内可恢复

备份包同样为 .ueap 格式

日志可导出为 JSON

Phase 9：UI 页面
交付：第 10 节列出的全部页面，使用 shadcn/ui 组件。

验收：

首屏加载 ≤1s

所有 Phase 1-8 功能均可在 UI 完成

无控制台报错

Phase 10：插件 API 骨架
交付：

plugin/loader.ts：从 .uniarchive/plugins/ 加载

plugin/api.ts：注册命令、菜单、视图

文档 docs/plugin-api.md

验收：

示例插件可注册一个命令并在菜单显示

9. UI 页面清单（必须全部实现）
页面	路由	核心功能
Welcome	/	新建/打开 Vault、最近 Vault
Dashboard	/dashboard	档案统计、近期新增、快捷上传
ArchiveList	/archives/:category?	分类浏览、筛选、排序、批量操作
ArchiveDetail	/archive/:id	查看/编辑档案、附件预览、版本
Search	/search	关键词 + 多维筛选 + 历史
Tags	/tags	标签管理、按标签聚合
Timeline	/timeline	时间线可视化、导出图片/PDF
Export	/export	选择范围、模板、加密、导出
Import	/import	选择 .ueap、预览、模式、冲突
Backup	/backup	备份列表、创建、恢复
Recycle	/recycle	回收站列表、恢复、彻底删除
Logs	/logs	日志筛选、导出
Settings	/settings	主题、插件、同步、隐私
UI 硬性要求：

所有写操作必须有 loading 与成功/失败提示。

删除操作必须二次确认并进入回收站。

敏感档案（sensitive: true）默认模糊显示，需点击“显示”。

暗黑/明亮模式必须支持。

所有列表支持键盘上下选择 + Enter 打开。

10. 测试要求
10.1 单元测试（Vitest）
必须覆盖：

frontmatter.ts：往返序列化一致

naming.ts：非法字符、重名

hash.ts：sha256 一致

ueap.ts：导出→导入往返数据一致

conflict.ts：五种策略

encrypt.ts：加解密往返、错误密码

10.2 E2E（Playwright）
必须覆盖：

新建 Vault → 创建档案 → 检索 → 导出 .ueap

新建第二个 Vault → 导入第一个的 .ueap → 数据一致

删除档案 → 回收站恢复

加密导出 → 正确密码导入成功、错误密码失败

10.3 性能测试
生成 10 万条模拟档案，检索 ≤0.5s

批量上传 100 份文件无 UI 卡顿

11. 全局验收清单（项目完成标准）
□ pnpm dev 可启动
□ pnpm build 可产出 Windows / macOS 安装包
□ pnpm test 全部通过
□ 新建 Vault 目录结构与第 5.1 节完全一致
□ 档案 Markdown 与第 5.3 节完全一致
□ .ueap 可改名为 .zip 解压
□ 删除 index.db 后可重建
□ 卸载软件后 Vault 仍可读
□ 10 万条检索 ≤0.5s
□ 加密导出密码错误不可解压
□ 导入前自动快照，可回滚
□ 回收站 30 天可恢复
□ 所有操作写入日志
□ 暗黑/明亮模式
□ README、LICENSE、docs/format.md 完整
12. 约束与禁止事项
必须：

所有数据以开放格式存储。

所有 IPC 通道名与本文档一致。

所有类型定义与第 4 节一致。

所有路径使用 path.join，禁止硬编码分隔符。

所有写操作使用临时文件 + 原子重命名，防止写入中断损坏。

禁止：

禁止引入云端依赖或需要登录才能使用。

禁止使用私有数据库格式存储档案内容。

禁止在 UEAP 中包含 index.db、logs/、backups/、recycle/。

禁止覆盖用户文件而不生成备份。

禁止在未确认的情况下删除附件。

禁止使用 any 类型（除第三方库适配层）。

禁止跳过 Phase 验收。

13. 交付物清单
完整源码仓库（含第 3 节目录结构）

README.md：安装、开发、构建、使用说明

LICENSE：Apache-2.0 或 MIT

docs/format.md：Vault 与 UEAP 格式规范

docs/plugin-api.md：插件 API 文档

examples/demo-vault/：示例档案库

测试报告：单元 + E2E + 性能

安装包：Windows .exe、macOS .dmg（可选 Linux .AppImage）

14. AI 执行起点
请从 Phase 0 开始。每个 Phase 完成后，输出：

text
[Phase X 完成]
变更文件：
- ...
验收自测：
- [x] 项1
- [x] 项2
遗留问题：
- ...
下一步：Phase X+1
现在开始执行 Phase 0。

