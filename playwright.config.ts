import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Máy cloud của Claude có sẵn Chromium tại /opt/pw-browsers; máy khác dùng bản Playwright tự cài.
const cloudChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync(cloudChromium) ? cloudChromium : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Không có GPU thật (cloud/CI): render bằng SwiftShader qua WebGL2.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
