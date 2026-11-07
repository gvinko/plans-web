import { test, expect } from '@playwright/test';

test('loads the app without uncaught exceptions or failed local assets', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push('Uncaught: ' + error.message));
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4173/') && response.status() >= 400) {
      failures.push('HTTP ' + response.status() + ': ' + response.url());
    }
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toBeEmpty();
  expect(failures).toEqual([]);
});

test('renders usable content in a desktop browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  const visibleText = (await page.locator('body').innerText()).trim();
  expect(visibleText.length).toBeGreaterThan(10);
  await page.screenshot({ path: test.info().outputPath('desktop-home.png'), fullPage: true });
});
