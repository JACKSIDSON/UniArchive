import { test, expect, _electron as electron } from '@playwright/test';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

/**
 * 端到端测试：驱动**真实 Electron 应用**，覆盖规格书 10.2 的四个场景：
 *   1) 新建 Vault → 创建档案 → 检索 → 导出 .ueap
 *   2) 新建第二个 Vault → 导入第一个的 .ueap → 数据一致
 *   3) 删除档案 → 回收站恢复
 *   4) 加密导出 → 正确密码导入成功、错误密码失败
 *
 * 前置：npm run build（产出 out/）后运行 npm run test:e2e。
 *
 * 注意：IPC 统一返回 IpcResult<T>（{ ok, data } | { ok, error }），
 * 测试里直接用 window.api 时必须解包，否则拿到的是信封而不是数据。
 */

let app: ElectronApplication;
let page: Page;
let tmp: string;
let vaultA: string;
let vaultB: string;
let archiveId: string;

const ARCHIVE_INPUT = {
  title: '校级专业竞赛二等奖',
  category: '荣誉实践/学科竞赛',
  type: '证书',
  date: '2026-09-01',
  tags: ['竞赛', '评优'],
  issuer: 'E2E 大学',
  level: '校级',
  body: '## 备注\nE2E 测试档案'
};

/**
 * 两个必须处理的沙箱/CI 兼容问题：
 * 1. 某些宿主进程会注入 ELECTRON_RUN_AS_NODE=1，这会让 electron.exe 退化成纯 Node，
 *    于是 `--remote-debugging-port` 被当成 Node 选项而报 `bad option`，应用根本起不来。
 * 2. 无 GPU 的会话里 Chromium 的 GPU 进程会崩溃并 FATAL 退出，需要关闭 GPU 走软件渲染。
 */
const LAUNCH_FLAGS = ['--disable-gpu', '--no-sandbox', '--disable-software-rasterizer'];

function launchEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.toUpperCase() === 'ELECTRON_RUN_AS_NODE') continue;
    env[k] = v;
  }
  env.UNIARCHIVE_USER_DATA = path.join(tmp, 'userdata');
  return env;
}

async function boot(): Promise<void> {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-e2e-'));
  vaultA = path.join(tmp, 'vault-a');
  vaultB = path.join(tmp, 'vault-b');
  app = await electron.launch({
    args: [...LAUNCH_FLAGS, path.join(__dirname, '../../out/main/index.js')],
    env: launchEnv()
  });
  page = await app.firstWindow();
  await page.waitForSelector('text=UniArchive');
}

test.beforeAll(boot);

test.afterAll(async () => {
  await app?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/* 场景 1：新建 Vault → 创建档案 → 检索 → 导出 .ueap                     */
/* ------------------------------------------------------------------ */

test('场景1 新建 Vault 生成完整目录树', async () => {
  const meta = await page.evaluate(async (p) => {
    const r = await window.api.vault.create({ targetPath: p, name: 'E2E 档案库 A', open: true });
    if (!r.ok) throw new Error(r.error.message);
    return r.data.meta as { vaultId: string; name: string; formatVersion: string };
  }, vaultA);

  expect(meta.name).toBe('E2E 档案库 A');
  expect(meta.formatVersion).toBe('1.0');
  expect(meta.vaultId).toMatch(/^[0-9a-f-]{36}$/);

  // 5.1 节目录树
  for (const rel of ['vault.json', 'README.md', 'archives', 'assets', '.uniarchive']) {
    expect(fs.existsSync(path.join(vaultA, rel)), `缺少 ${rel}`).toBeTruthy();
  }
  for (const rel of ['config.json', 'tags.json', 'templates', 'plugins', 'themes', 'backups', 'logs', 'recycle']) {
    expect(fs.existsSync(path.join(vaultA, '.uniarchive', rel)), `缺少 .uniarchive/${rel}`).toBeTruthy();
  }
  // 17 个预设分类目录一次性建好
  expect(fs.existsSync(path.join(vaultA, 'archives', '学业档案', '学籍档案'))).toBeTruthy();
  expect(fs.existsSync(path.join(vaultA, 'archives', '生活行政', '校园凭证'))).toBeTruthy();
});

test('场景1 创建档案后文件落盘且命名正确', async () => {
  const created = await page.evaluate(async (input) => {
    const r = await window.api.archive.create(input);
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { frontmatter: { id: string; title: string }; filePath: string };
  }, ARCHIVE_INPUT);

  archiveId = created.frontmatter.id;
  expect(created.frontmatter.title).toBe(ARCHIVE_INPUT.title);

  const abs = path.join(vaultA, created.filePath.split('/').join(path.sep));
  expect(fs.existsSync(abs)).toBeTruthy();
  // 命名规范：【二级分类】-YYYY.MM-标题-标签.md
  expect(path.basename(abs)).toBe('【学科竞赛】-2026.09-校级专业竞赛二等奖-竞赛,评优.md');

  const raw = fs.readFileSync(abs, 'utf8');
  expect(raw.startsWith('---\n')).toBeTruthy();
  expect(raw).toContain(`id: ${archiveId}`);
  expect(raw).toContain('category: 荣誉实践/学科竞赛');
});

test('场景1 检索命中且支持中文关键词', async () => {
  const result = await page.evaluate(async () => {
    const r = await window.api.search.query({ keyword: '竞赛' });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { total: number; hits: { id: string }[]; tookMs: number };
  });

  expect(result.total).toBeGreaterThan(0);
  expect(result.hits.some((h) => h.id === archiveId)).toBeTruthy();
  expect(result.tookMs).toBeLessThanOrEqual(500);
});

test('场景1 导出全库为 .ueap，且符合 5.5 节包结构', async () => {
  const outPath = path.join(tmp, 'export.ueap');
  const exported = await page.evaluate(async (p) => {
    const r = await window.api.export.ueap({ scope: { kind: 'full' }, includeAttachments: true, outputPath: p });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { archiveCount: number; outputPath: string };
  }, outPath);

  expect(exported.archiveCount).toBe(1);
  expect(fs.existsSync(outPath)).toBeTruthy();

  // 数据不变量：.ueap 改名为 .zip 后可直接解压
  const zipPath = path.join(tmp, 'export-as-zip.zip');
  fs.copyFileSync(outPath, zipPath);
  const zip = new AdmZip(zipPath);
  const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
  expect(names).toContain('manifest.json');
  expect(names).toContain('checksums.sha256');
  expect(names).toContain('README.md');
  expect(names.some((n) => n.endsWith('vault/vault.json'))).toBeTruthy();

  // 禁止携带索引 / 日志 / 备份 / 回收站
  for (const forbidden of ['index.db', 'logs/', 'backups/', 'recycle/']) {
    expect(names.some((n) => n.includes(`.uniarchive/${forbidden}`)), `不应包含 ${forbidden}`).toBeFalsy();
  }

  const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8')) as {
    format: string;
    version: string;
    encryption: { enabled: boolean };
    checksums: string;
  };
  expect(manifest.format).toBe('UEAP');
  expect(manifest.version).toBe('1.0');
  expect(manifest.encryption.enabled).toBe(false);
});

/* ------------------------------------------------------------------ */
/* 场景 2：新建第二个 Vault → 导入 → 数据一致                            */
/* ------------------------------------------------------------------ */

test('场景2 新建 Vault B 并合并导入，数据一致', async () => {
  await page.evaluate(async (p) => {
    const r = await window.api.vault.create({ targetPath: p, name: 'E2E 档案库 B', open: true });
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  }, vaultB);

  const report = await page.evaluate(async (p) => {
    const r = await window.api.import.ueap({ packagePath: p, mode: 'merge', conflictStrategy: 'keep-both' });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { created: number; skipped: number };
  }, path.join(tmp, 'export.ueap'));

  expect(report.created).toBe(1);

  const after = await page.evaluate(async () => {
    const r = await window.api.search.query({ keyword: '竞赛' });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { total: number; hits: { id: string; title: string }[] };
  });
  expect(after.total).toBe(1);
  expect(after.hits[0].title).toBe(ARCHIVE_INPUT.title);

  // 导入前必须自动生成快照，可回滚
  const backups = fs.readdirSync(path.join(vaultB, '.uniarchive', 'backups'));
  expect(backups.length).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ */
/* 场景 3：删除档案 → 回收站恢复                                         */
/* ------------------------------------------------------------------ */

test('场景3 删除进入回收站并可恢复', async () => {
  // 切回 A 库
  await page.evaluate(async (p) => {
    const r = await window.api.vault.open({ path: p });
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  }, vaultA);

  const list = await page.evaluate(async () => {
    const r = await window.api.archive.list({ limit: 10 });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { items: { id: string }[]; total: number };
  });
  expect(list.total).toBe(1);
  const id = list.items[0].id;

  const del = await page.evaluate(async (archiveId_) => {
    const r = await window.api.archive.delete({ id: archiveId_ });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { deleted: number; recycleId?: string };
  }, id);
  expect(del.deleted).toBe(1);
  expect(del.recycleId).toBeTruthy();

  const recycle = await page.evaluate(async () => {
    const r = await window.api.recycle.list();
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { recycleId: string; expireAt: string; originalPath: string }[];
  });
  expect(recycle.length).toBe(1);
  // 30 天回收站：到期时间晚于删除时间
  expect(new Date(recycle[0].expireAt).getTime()).toBeGreaterThan(Date.now());

  await page.evaluate(async (rid) => {
    const r = await window.api.recycle.restore({ recycleId: rid });
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  }, recycle[0].recycleId);

  const restored = await page.evaluate(async (archiveId_) => {
    const r = await window.api.archive.get({ id: archiveId_ });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { frontmatter: { title: string } } | null;
  }, id);
  expect(restored).not.toBeNull();
  expect(restored!.frontmatter.title).toBe(ARCHIVE_INPUT.title);
});

/* ------------------------------------------------------------------ */
/* 场景 4：加密导出                                                     */
/* ------------------------------------------------------------------ */

test('场景4 加密导出：正确密码可导入、错误密码失败', async () => {
  const encPath = path.join(tmp, 'encrypted.ueap');
  const exported = await page.evaluate(async (p) => {
    const r = await window.api.export.ueap({
      scope: { kind: 'full' },
      includeAttachments: true,
      outputPath: p,
      encrypt: { password: 'e2e-password' }
    });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { archiveCount: number };
  }, encPath);
  expect(exported.archiveCount).toBe(1);

  // manifest 明文可见，但声明已加密
  const zip = new AdmZip(encPath);
  const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8')) as {
    encryption: { enabled: boolean; algorithm: string | null };
  };
  expect(manifest.encryption.enabled).toBe(true);
  expect(manifest.encryption.algorithm).toBe('AES-256-GCM');

  const wrong = await page.evaluate(async (p) => {
    const r = await window.api.import.preview({ packagePath: p, password: 'bad-password' });
    return { ok: r.ok, code: r.ok ? '' : r.error.code };
  }, encPath);
  expect(wrong.ok).toBeFalsy();

  const right = await page.evaluate(async (p) => {
    const r = await window.api.import.preview({ packagePath: p, password: 'e2e-password' });
    if (!r.ok) throw new Error(r.error.message);
    return r.data as { archiveCount: number };
  }, encPath);
  expect(right.archiveCount).toBeGreaterThan(0);
});
