import fs from 'node:fs/promises';
import { preview } from 'vite';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';

// Same mobile simulation and release thresholds as the former LHCI wrapper.
// Run serially in fresh profiles; retain every report, gate the median performance run.
const server = await preview({ preview: { host: '127.0.0.1', port: 4174, strictPort: true } });
const reports = [];
try {
  await fs.mkdir('.lighthouseci', { recursive: true });
  for (let i = 0; i < 3; i++) {
    const chrome = await launch({ chromePath: process.env.CHROME_PATH || chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox'] });
    try {
      const result = await lighthouse('http://127.0.0.1:4174/', { port: chrome.port, output: ['json', 'html'], logLevel: 'error' });
      if (result.lhr.runtimeError) throw new Error(JSON.stringify(result.lhr.runtimeError));
      await fs.writeFile(`.lighthouseci/run-${i + 1}.json`, result.report[0]);
      await fs.writeFile(`.lighthouseci/run-${i + 1}.html`, result.report[1]);
      reports.push(result.lhr);
      console.log(`Run ${i + 1}:`, Object.fromEntries(Object.entries(result.lhr.categories).map(([k, v]) => [k, v.score])));
    } finally { await chrome.kill(); }
  }
  reports.sort((a, b) => a.categories.performance.score - b.categories.performance.score);
  const selected = reports[1];
  const gates = { performance: 0.8, accessibility: 0.9, 'best-practices': 0.9 };
  const assertions = Object.entries(gates).map(([category, minimum]) => ({ category, minimum, actual: selected.categories[category].score, passed: selected.categories[category].score >= minimum }));
  await fs.writeFile('.lighthouseci/assertion-results.json', JSON.stringify({ lighthouseVersion: selected.lighthouseVersion, selection: 'median performance of three mobile runs', assertions }, null, 2));
  if (assertions.some(a => !a.passed)) process.exitCode = 1;
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
