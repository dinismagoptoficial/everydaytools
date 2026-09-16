import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 120000, expect: { timeout: 15000 }, workers: 1, fullyParallel: false, use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:8087', headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' }, reporter: [['list']] });
