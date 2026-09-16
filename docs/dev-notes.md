# UniArchive 开发说明

> 本文件为交付说明，实际验证输出见文末「验证记录」。

## 目录结构

```
uniarchive/
├── package.json / pnpm-workspace.yaml / electron.vite.config.ts / tsconfig.json
├── tailwind.config.js / postcss.config.js / vitest.config.ts / playwright.config.ts
├── README.md / LICENSE / ROADMAP.md
├── docs/          format.md（Vault 与 UEAP 格式）· plugin-api.md · ai-spec.md
├── scripts/       use-abi.mjs（原生模块 ABI 切换）· demo-capture.mjs（演示截图）
├── src/
│   ├── main/      主进程：ipc / core / db / export / import / backup / recycle / log / plugin
│   ├── preload/   contextBridge 暴露 window.api
│   ├── renderer/  React 前端：pages / components / stores / lib
│   └── shared/    types.ts · ipc-channels.ts · constants.ts
├── tests/         unit（Vitest）· e2e（Playwright）
└── examples/      demo-vault（含示例插件）· demo-vault-live（截图时生成的演示库）
```

## 运行

```bash
npm install          # 或 pnpm install（本环境符号链接受限，已改用 npm）
npm run abi:electron # 把 better-sqlite3 切到 Electron ABI（首次必须，见下节）
npm run dev
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（自动切到 Electron ABI） |
| `npm run build` | 产出 `out/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 单元测试（自动切到 Node ABI，跑完自动切回 Electron） |
| `npm run test:e2e` | Playwright 驱动真实 Electron 应用 |
| `npm run bench:search` | 10 万条档案检索性能基准 |
| `npm run dist` | 打包 Windows 安装包 |
| `node scripts/demo-capture.mjs` | 灌演示数据 + 逐页截图到 `screenshots/` |

## 原生模块 ABI（**重要，踩坑记录**）

`better-sqlite3` 是原生模块，它的 `.node` 文件与运行时 ABI 严格绑定：

| 运行时 | NODE_MODULE_VERSION |
| --- | --- |
| 系统 Node 22 | 127 |
| Electron 30 | 123 |

**同一个 `.node` 不可能同时满足两者。** 典型症状：

- 跑 `vitest` 报 `was compiled against a different Node.js version using NODE_MODULE_VERSION 123. This version of Node.js requires NODE_MODULE_VERSION 127.`
- 反过来把 Node 版塞进 Electron，应用启动即崩。

本项目的做法是**两份预编译产物都缓存**在 `.abi/` 下，由 `scripts/use-abi.mjs` 按任务切换：

```
.abi/
├── node/better_sqlite3.node       # node-v127（跑单测用）
└── electron/better_sqlite3.node   # electron-v123（跑应用 / 打包用）
```

`package.json` 里已用 npm 的 pre/post 钩子自动切换：
`pretest` / `posttest`、`pretest:unit` / `posttest:unit`、`prebench:search` / `postbench:search`
切到 Node ABI；`dev`、`start`、`predist`、`pretest:e2e` 切到 Electron ABI。

**安装依赖后必做**（`npm install` 会用 npm 自己的 Node ABI 覆盖掉预编译产物）：

```bash
npm run abi:electron   # 应用 / 打包前
npm run abi:node       # 只跑单测前（npm test 已自动处理）
```

### 这两份产物从哪来

```bash
VER=11.10.0
curl -L "https://ghproxy.net/https://github.com/WiseLibs/better-sqlite3/releases/download/v${VER}/better-sqlite3-v${VER}-node-v127-win32-x64.tar.gz" > bs3.tar.gz
curl -L "https://ghproxy.net/https://github.com/WiseLibs/better-sqlite3/releases/download/v${VER}/better-sqlite3-v${VER}-electron-v123-win32-x64.tar.gz" > bs3.tar.gz
tar -xzf bs3.tar.gz   # 得到 build/Release/better_sqlite3.node
```

> 注意：`curl -o file` 在本环境的部分 shell 下会报 `client returned ERROR on write`，
> 改用 shell 重定向 `> file`。
> 直连 `objects.githubusercontent.com` 会超时，走 `ghproxy.net` 代理可用。

## 打包要点（无 C++ 工具链的沙箱环境）

- `electron.vite.config.ts` 只把 `better-sqlite3`、`electron` 置为 external，
  其余纯 JS 依赖（gray-matter / js-yaml / adm-zip / uuid / @noble/hashes）全部打进 `out/main/index.js`。
- `package.json` 的 `build` 段：`npmRebuild: false`（不重编原生模块，保住预编译产物）、
  `electronDist: "node_modules/electron/dist"`（复用本地 Electron，不联网下载）、
  `win.signAndEditExecutable: false`（跳过 rcedit / winCodeSign，避免符号链接权限报错）。
- `asarUnpack` 必须放开 `better-sqlite3`、`bindings` 与 `**/*.node`，否则 `.node` 无法从 asar 内加载。

详见 `run-build.js`（注入 `CSC_IDENTITY_AUTO_DISCOVERY=false` 后调用 electron-builder）。

## 验证记录

全部在项目根目录下实测（Windows 10.0.26200 / Node 22.22.2 / Electron 30.5.1）。

### 1. 类型检查

```
$ node ./node_modules/typescript/bin/tsc --noEmit
（无输出，exit 0）
```

### 2. 单元测试（Vitest）—— 67 项全过

```
$ npm test                    # 自动切到 Node ABI，跑完自动切回 Electron
 ✓ tests/unit/frontmatter.test.ts (7)
 ✓ tests/unit/naming.test.ts      (8)
 ✓ tests/unit/hash.test.ts        (7)
 ✓ tests/unit/conflict.test.ts    (13)
 ✓ tests/unit/vault.test.ts       (16)
 ✓ tests/unit/encrypt.test.ts     (6)
 ✓ tests/unit/ueap.test.ts        (10)
 Test Files  7 passed (7)
      Tests  67 passed (67)
```

### 3. 性能基准（规格书 10.3 / 11）—— 10 万条 ≤0.5s 通过

```
$ npm run bench:search
 ✓ tests/unit/performance.test.ts (4 tests) 1133051ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

真实生成 10 万篇 Markdown（索引库 `index.db` 达 122 MB）后：

| 断言 | 结果 |
| --- | --- |
| 中文关键词（评优）检索 ≤0.5s | ✅ |
| 组合筛选（分类 + 标签 + 日期范围）≤0.5s | ✅ |
| 英文 / 数字关键词检索 ≤0.5s | ✅ |
| 无关键词全量分页（offset=50000）≤0.5s，总数 = 100000 | ✅ |

（总耗时 1133s 中绝大部分是往磁盘写 10 万个文件，不是检索本身。）

### 4. 端到端测试（Playwright 直驱真实 Electron）—— 7 项全过

```
$ npm run test:e2e
 ok 1 场景1 新建 Vault 生成完整目录树
 ok 2 场景1 创建档案后文件落盘且命名正确
 ok 3 场景1 检索命中且支持中文关键词
 ok 4 场景1 导出全库为 .ueap，且符合 5.5 节包结构
 ok 5 场景2 新建 Vault B 并合并导入，数据一致
 ok 6 场景3 删除进入回收站并可恢复
 ok 7 场景4 加密导出：正确密码可导入、错误密码失败
 7 passed (11.4s)
```

其中直接断言了这些数据不变量：

- 新建 Vault 的目录树与 5.1 节逐项一致（含 17 个预设分类目录、`.uniarchive/` 八个子目录）
- 档案文件名严格符合 `【学科竞赛】-2026.09-校级专业竞赛二等奖-竞赛,评优.md`
- `.ueap` 改名为 `.zip` 后可用 adm-zip 正常解压，含 `manifest.json` / `checksums.sha256` / `README.md` / `vault/vault.json`
- `.ueap` 中**不含** `index.db` / `logs/` / `backups/` / `recycle/`
- 合并导入前自动生成快照（`.uniarchive/backups/` 非空）
- 回收站项 `expireAt` 晚于当前时间（30 天 TTL）
- 加密包 `manifest.encryption = { enabled: true, algorithm: 'AES-256-GCM' }`，错误密码 `import.preview` 返回失败

### 5. 构建与打包

```
$ npm run build                 # electron-vite build
 out/main/index.js        420.88 kB
 out/preload/index.js       5.68 kB
 out/renderer/assets/*.css 33.67 kB
 out/renderer/assets/*.js   1.00 MB

$ node run-build.js --win nsis zip
 dist/UniArchive-1.0.0-Setup.exe    83,382,553 B
 dist/UniArchive-1.0.0-Setup.zip   114,337,922 B
 dist/win-unpacked/UniArchive.exe  177,038,336 B
```

打包产物校验：

- `dist/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
  存在且为 **1,720,320 B**（与 `.abi/electron/better_sqlite3.node` md5 一致），即 Electron ABI 123 的预编译产物，
  不是 node-gyp 现编的版本。
- 直接运行 `dist/win-unpacked/UniArchive.exe`，渲染进程成功从
  `app.asar/out/renderer/index.html` 加载（CDP 已确认页面 URL 与标题）。

### 6. 界面截图

```
$ node scripts/demo-capture.mjs
```

驱动**打包后**的应用自动建库、灌入 8 条演示档案 + 1 个附件 + 1 条回收站记录，
逐页截到 `screenshots/`（15 张）：Welcome、总览、档案、检索、时间线、标签、导出、
导入、备份、回收站、日志、设置、档案详情、敏感档案详情、暗黑模式总览。

同一份演示库已留在 `examples/demo-vault-live/`，可直接用应用打开体验。

### 7. 本轮修复的真实缺陷

| # | 问题 | 现象 | 修复 |
| --- | --- | --- | --- |
| 1 | 原生模块 ABI 冲突 | 所有碰 DB 的 vitest 用例报 `NODE_MODULE_VERSION 123 vs 127` 全挂 | 缓存双 ABI + `scripts/use-abi.mjs` + npm pre/post 钩子 |
| 2 | E2E 用例本身是坏的 | 直接用 `window.api.*` 却不解包 `IpcResult`；用 `.catch()` 捕 IPC 错误（实际返回 `{ok:false}` 不抛异常） | 整份重写 `tests/e2e/flow.spec.ts`，7 项全过 |
| 3 | 宿主注入 `ELECTRON_RUN_AS_NODE=1` | electron.exe 退化成纯 Node，`--remote-debugging-port` 报 `bad option`，Playwright 起不来；无 GPU 时 GPU 进程 FATAL | 启动环境剔除该变量 + `--disable-gpu` |
| 4 | 重载丢会话 | 在 dashboard 按刷新会被弹回 Welcome 页（`booted` 早于 `vaultPath` 就绪） | store 增加独立 `ready` 标志，`finally` 中置位 |
| 5 | `UNIARCHIVE_USER_DATA` 无效 | 测试数据写进用户真实 profile | 主进程优先读该变量；开发态另用 `%APPDATA%\UniArchive-dev`（未打包时 `app.getName()` 是 `Electron`，userData 会落到所有 Electron 程序共享的目录） |

追加一条可观测性改进：设置 `UNIARCHIVE_DEBUG_PATHS=1` 时启动会打印实际
`userData` 与 `appName`，便于排查配置落盘位置。

