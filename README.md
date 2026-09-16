# UniArchive 大学档案库

> 开源 · 本地优先 · Obsidian 式大学生电子档案库

一句话：**文件夹即数据库**。所有档案都是普通 Markdown 文件（YAML frontmatter + 正文），附件是普通文件，
检索索引（SQLite FTS5）是可随时删除重建的派生数据。卸载软件后，你依然可以用任意文本编辑器读完整个大学。

---

## 特性

| 能力 | 说明 |
| --- | --- |
| 🗂 分类归档 | 17 个预设分类（学业 / 荣誉实践 / 生活行政），目录即分类 |
| 🔍 全文检索 | SQLite FTS5，中文关键词可用，10 万条档案检索 < 0.5s |
| 📎 附件管理 | 自动按 `assets/YYYY/MM/` 归档，sha256 去重，删除进回收站 |
| 🏷 标签系统 | `tags.json` 与索引双向同步，删除标签自动解除关联 |
| 📦 一键导出 | `.ueap` 包（本质是 ZIP，改名即可解压），支持 AES-256-GCM 加密 |
| 📥 一键导入 | 五种模式（新建 / 合并 / 覆盖 / 仅新增 / 预览），冲突五策略，导入前自动快照 |
| ♻️ 回收站 | 删除 30 天内可恢复，附件随档案一起保留 |
| 🗃 备份恢复 | 备份同样是 `.ueap`，恢复前自动生成快照，可反复回滚 |
| 📜 操作日志 | 所有写操作落盘为 JSONL + SQLite，可导出 JSON |
| 🌓 明暗主题 | 敏感档案默认模糊显示，点击才展开 |
| 🔌 插件骨架 | 从 `.uniarchive/plugins/` 加载，可注册命令 / 菜单 / 视图 |

---

## 快速开始

```bash
# 1. 安装依赖（需要 Node 18+）
npm install          # 推荐：直接落地真实文件
# 或 pnpm install（若系统允许创建符号链接；本项目已附 .npmrc 兼容配置）

# 2. 把原生模块切到 Electron ABI（首次必须，理由见 docs/dev-notes.md）
npm run abi:electron

# 3. 启动开发模式
npm run dev
```

首次启动会进入 Welcome 页面，选择「新建档案库」并指定一个空文件夹即可。

> **注意**：`better-sqlite3` 的 `.node` 与运行时 ABI 强绑定（Node 22 = 127，
> Electron 30 = 123），一份产物不可能两者通吃。本项目在 `.abi/` 里缓存了两份，
> 由 `scripts/use-abi.mjs` 按任务切换，`npm test` / `npm run dist` 已自动处理。
> 手动切错时会报 `NODE_MODULE_VERSION` 不匹配，跑一次 `npm run abi:electron` 即可。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Electron 开发模式（热更新） |
| `pnpm build` | 类型检查并产出 `out/` |
| `pnpm typecheck` | 仅类型检查 |
| `pnpm test` | 运行 Vitest 单元测试（自动切 ABI） |
| `pnpm test:e2e` | Playwright 直驱真实 Electron 应用 |
| `pnpm bench:search` | 10 万条档案检索性能基准 |
| `pnpm dist` | 打包 Windows 安装包 |
| `pnpm dist:mac` | 打包 macOS dmg |
| `node scripts/demo-capture.mjs` | 自动灌演示数据并逐页截图到 `screenshots/` |
| `pnpm abi:node` / `pnpm abi:electron` | 手动切换原生模块 ABI |

---

## 界面预览

`screenshots/` 下是脚本自动跑出来的真实界面截图（Welcome / 总览 / 档案 / 检索 /
时间线 / 标签 / 导出 / 导入 / 备份 / 回收站 / 日志 / 设置 / 档案详情 / 暗黑模式），
全部由 `scripts/demo-capture.mjs` 驱动打包后的应用生成，不是设计稿。

---

## 技术栈

- 桌面容器：Electron 30
- 构建：Vite 5 + electron-vite
- 前端：React 18 + TypeScript 5 + Tailwind CSS 3 + shadcn 风格组件
- 状态：Zustand；路由：React Router 6（HashRouter）
- 数据：better-sqlite3（FTS5）、gray-matter + js-yaml、adm-zip、Node crypto（AES-256-GCM）+ Argon2id
- 测试：Vitest + Playwright

不引入任何云端 SDK，不引入 Redux / Prisma / NestJS / Next.js 等重型依赖。

---

## Vault 目录结构

```
<vault>/
├── vault.json              # 档案库元信息
├── README.md
├── archives/               # 档案正文：Markdown + YAML frontmatter
│   └── <一级分类>/<二级分类>/【分类】-时间-名称-标签.md
├── assets/                 # 附件原始文件
│   └── <YYYY>/<MM>/<uuid>-<原文件名>
└── .uniarchive/
    ├── config.json         # Vault 级配置
    ├── index.db            # 检索索引（可删除重建）
    ├── tags.json
    ├── templates/
    ├── plugins/
    ├── themes/
    ├── backups/
    ├── logs/
    └── recycle/
```

完整格式规范见 [`docs/format.md`](./docs/format.md)，插件开发见 [`docs/plugin-api.md`](./docs/plugin-api.md)。

---

## 数据不变量

任何情况下都不会被违反：

1. 删除 `index.db` 后档案库仍完整可用，索引可一键重建。
2. 卸载软件后，用户可直接用文本编辑器阅读所有档案。
3. 所有档案都有唯一 UUID v4。
4. 所有附件路径相对 Vault 根目录。
5. `.ueap` 改名为 `.zip` 后可直接解压。
6. UEAP 包中永不包含 `index.db` / `logs/` / `backups/` / `recycle/`。
7. 任何覆盖用户文件的操作都会先生成备份快照。

---

## 许可

MIT License，详见 [LICENSE](./LICENSE)。
