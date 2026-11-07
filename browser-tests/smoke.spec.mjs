import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

test('dashboard has no critical WCAG 2.0/2.1 AA accessibility violations', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const criticalViolations = results.violations.filter(({ impact }) => impact === 'critical');
  expect(criticalViolations).toEqual([]);
});

test('creates, saves, refreshes and reopens an isolated synthetic project', async ({ page }) => {
  const projectName = 'QA Browser Audit Project';
  await page.goto('/');
  await page.getByLabel('Customer name').fill(projectName);
  await page.getByLabel('Street address').fill('1 Synthetic Test Street');
  await page.getByLabel('Suburb').fill('Testville');
  await page.getByLabel('Phone').fill('0400000000');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByText('Project created ✓')).toBeVisible();

  const projectButton = page.getByRole('button', {
    name: `${projectName} Testville · rev A 1 Synthetic Test Street · 0400000000`,
    exact: true,
  });
  await expect(projectButton).toBeVisible();
  await projectButton.click();
  await expect(page.getByText('Blank Level 1')).toBeVisible();
  await page.getByRole('button', { name: 'FCU (Indoor Unit)', exact: true }).click();
  await page.getByRole('button', { name: 'Condenser (Outdoor Unit)', exact: true }).click();
  await page.getByRole('button', { name: 'Save drawing', exact: true }).click();
  await expect(page.getByText(/Saved|Saving/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('synthetic-project.png'), fullPage: true });

  await page.reload();
  await expect(projectButton).toBeVisible();
  await projectButton.click();
  await expect(page.getByRole('button', { name: /FCU1 FCU \(Indoor Unit\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /CU1 Condenser \(Outdoor Unit\)/ })).toBeVisible();
});
