import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1,
  timeout: 45000, use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  webServer: process.env.TEST_BASE_URL ? undefined : [
    { command: 'npm run preview -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 4175', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
  ],
});
