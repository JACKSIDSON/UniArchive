import { defineConfig } from '@playwright/test';

/**
 * E2E：使用 Playwright 的 Electron 支持直接驱动真实应用。
 * 运行前请先执行 `pnpm build`（产出 out/ 目录）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'off'
  }
});
