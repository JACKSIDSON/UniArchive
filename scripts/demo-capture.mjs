#!/usr/bin/env node
/**
 * 演示与截图脚本：用 Playwright 驱动**真实 Electron 应用**，
 * 自动建库 → 灌入演示数据 → 逐页截图，产物落在 screenshots/。
 *
 * 前置：node scripts/use-abi.mjs electron && node node_modules/electron-vite/bin/electron-vite.js build
 * 运行：node scripts/demo-capture.mjs
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-demo-'));
const vaultPath = path.join(tmp, 'vault');
const userData = path.join(tmp, 'userdata');

/** 1x1 透明 PNG 之上的简易内容图，用于制造一个真实附件 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR42u3OMQEAAAgDINc/9CzB' +
    'jwQkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBnAWKAAAGvwuKsAAAAAElFTkSuQmCC',
  'base64'
);

const ARCHIVES = [
  {
    title: '校级专业竞赛二等奖',
    category: '荣誉实践/学科竞赛',
    type: '证书',
    date: '2026-09-01',
    tags: ['竞赛', '评优'],
    issuer: 'XX大学',
    level: '校级',
    body: '## 备注\n校级专业竞赛二等奖，可用于评优与求职材料。'
  },
  {
    title: '2025-2026 学年成绩单',
    category: '学业档案/学业成绩档案',
    type: '成绩单',
    date: '2026-07-10',
    tags: ['学业', '升学'],
    issuer: 'XX大学教务处',
    body: '## 备注\n学年加权平均分 89.6，专业排名 4/126。'
  },
  {
    title: '国家励志奖学金',
    category: '荣誉实践/荣誉奖项',
    type: '证书',
    date: '2026-06-20',
    tags: ['荣誉', '评优'],
    issuer: 'XX大学学生工作处',
    level: '国家级',
    body: '## 备注\n2025-2026 学年国家励志奖学金。'
  },
  {
    title: '暑期实习证明（后端开发）',
    category: '荣誉实践/实习实践',
    type: '证明',
    date: '2026-08-28',
    tags: ['实习', '求职'],
    issuer: 'XX科技有限公司',
    level: '其他',
    body: '## 备注\n参与订单中心重构，负责 3 个后端模块。'
  },
  {
    title: '学生会学习部部长任职证明',
    category: '荣誉实践/学生工作任职',
    type: '证明',
    date: '2026-06-30',
    tags: ['荣誉', '评优'],
    issuer: 'XX大学学生会',
    level: '院级',
    body: '## 备注\n任职期 2025.09 - 2026.06。'
  },
  {
    title: '学生证个人信息页',
    category: '生活行政/个人证件',
    type: '证件',
    date: '2023-09-05',
    tags: ['证件'],
    sensitive: true,
    body: '## 备注\n含有身份证号等敏感信息，默认模糊显示。'
  },
  {
    title: '大学生数学建模竞赛省级三等奖',
    category: '荣誉实践/学科竞赛',
    type: '证书',
    date: '2025-11-15',
    tags: ['竞赛', '科研'],
    issuer: '省教育厅',
    level: '省级',
    body: '## 备注\n三人一队，负责建模与论文撰写。'
  },
  {
    title: '2025 学年学费缴费凭证',
    category: '生活行政/缴费凭证',
    type: '凭证',
    date: '2025-09-02',
    tags: ['行政'],
    body: '## 备注\n学费 5800 元，住宿费 1200 元。'
  }
];

const PAGES = [
  ['dashboard', '总览'],
  ['archives', '档案列表'],
  ['search', '检索'],
  ['timeline', '时间线'],
  ['tags', '标签'],
  ['export', '导出'],
  ['import', '导入'],
  ['backup', '备份'],
  ['recycle', '回收站'],
  ['logs', '日志'],
  ['settings', '设置']
];

async function main() {
  // 沙箱兼容：宿主若注入 ELECTRON_RUN_AS_NODE=1，electron.exe 会退化成纯 Node；
  // 无 GPU 会话还需关闭 GPU 走软件渲染，否则 GPU 进程 FATAL 退出。
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.toUpperCase() === 'ELECTRON_RUN_AS_NODE') continue;
    env[k] = v;
  }
  env.UNIARCHIVE_USER_DATA = userData;

  const app = await electron.launch({
    args: ['--disable-gpu', '--no-sandbox', '--disable-software-rasterizer', path.join(root, 'out', 'main', 'index.js')],
    env
  });
  const page = await app.firstWindow();
  await page.waitForSelector('text=UniArchive');

  // Welcome 页
  await page.screenshot({ path: path.join(outDir, '00-welcome.png') });

  // 建库
  await page.evaluate(async (p) => {
    await window.api.vault.create({ targetPath: p, name: '我的大学档案库', open: true });
  }, vaultPath);

  // 灌入演示档案
  const ids = [];
  for (const item of ARCHIVES) {
    const res = await page.evaluate(async (a) => {
      return window.api.archive.create({ ...a, sensitive: a.sensitive ?? false });
    }, item);
    if (res && res.data && res.data.frontmatter) ids.push(res.data.frontmatter.id);
    else if (res && res.frontmatter) ids.push(res.frontmatter.id);
  }

  // 给第一条加一个真实附件
  const attachSrc = path.join(tmp, '竞赛证书.png');
  fs.writeFileSync(attachSrc, PNG_1PX);
  if (ids[0]) {
    await page.evaluate(
      async ([archiveId, sourcePath]) => window.api.attachment.add({ archiveId, sourcePath }),
      [ids[0], attachSrc]
    );
  }

  // 制造一条回收站记录，让回收站页不为空
  if (ids[ids.length - 1]) {
    await page.evaluate(async (id) => window.api.archive.delete({ id }), ids[ids.length - 1]);
  }

  // 关键：直接走 IPC 建库不会更新渲染进程的 zustand store。
  // 进入 /dashboard 会挂载 AppShell，其 boot() 从设置里恢复 lastVaultPath，
  // 于是渲染进程也进入「已打开档案库」状态。
  await page.evaluate(() => {
    window.location.hash = '#/dashboard';
  });
  await page.waitForSelector('text=总览', { timeout: 30_000 });
  await page.waitForTimeout(800);

  // 逐页截图
  let index = 1;
  for (const [route] of PAGES) {
    await page.evaluate((r) => {
      window.location.hash = `#/${r}`;
    }, route);
    await page.waitForTimeout(1100);
    const name = `${String(index).padStart(2, '0')}-${route}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    index += 1;
  }

  // 档案详情页（含附件的第一条）
  if (ids[0]) {
    await page.evaluate((id) => {
      window.location.hash = `#/archive/${id}`;
    }, ids[0]);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(outDir, '12-archive-detail.png') });
  }

  // 敏感档案详情：默认模糊显示（UI 硬性要求）
  if (ids[5]) {
    await page.evaluate((id) => {
      window.location.hash = `#/archive/${id}`;
    }, ids[5]);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(outDir, '13-archive-detail-sensitive.png') });
  }

  // 暗黑模式
  await page.evaluate(() => {
    const el = document.querySelector('button[title="切换明暗模式"]');
    if (el instanceof HTMLElement) el.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.location.hash = '#/dashboard';
  });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(outDir, '14-dashboard-dark.png') });

  // 顺带把演示档案库留下来，供用户直接打开体验
  const keep = path.join(root, 'examples', 'demo-vault-live');
  fs.rmSync(keep, { recursive: true, force: true });
  fs.cpSync(vaultPath, keep, { recursive: true });

  console.log(`[demo] 截图输出：${path.relative(root, outDir)}`);
  console.log(`[demo] 演示档案库：${path.relative(root, keep)}`);

  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('[demo] 失败：', err);
  process.exit(1);
});
