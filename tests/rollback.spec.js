import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

test('same-origin rollback retires worker and preserves drawing and file bytes', async ({ browser }, info) => {
  test.skip(!!process.env.TEST_BASE_URL, 'Local disposable deployment swap only');
  let rollback = false;
  const root = path.resolve('.tmp/rollback-artifact');
  await fs.access(path.join(root, 'index.html'));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const directory = rollback ? root : path.resolve('dist');
    const file = rollback && relative === 'offline-sw.js' ? path.resolve('public/offline-sw-retire.js') : path.resolve(directory, relative);
    if (!file.startsWith(directory + path.sep) && !(rollback && relative === 'offline-sw.js')) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      const type = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext();
  try {
    let page = await context.newPage();
    await page.goto(origin);
    await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill('Disposable rollback job');
    await page.getByRole('textbox', { name: 'Suburb', exact: true }).fill('Test');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('button', { name: /^Disposable rollback job/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Loaded saved drawing' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search parts', exact: true }).first().fill('Volume Control');
    await page.getByRole('button', { name: 'Volume Control Damper (VCD)', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Auto-saved' })).toBeVisible();
    await page.locator('input[accept="image/*,.pdf,application/pdf"]').setInputFiles({ name: 'rollback.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByRole('button', { name: 'Remove the plan image' })).toBeVisible();
    await page.getByRole('button', { name: 'Save drawing', exact: true }).first().click();
    await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const snapshot = async () => page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('ductplanner'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const result = {};
      for (const name of ['projects', 'plan_pages', 'files']) {
        result[name] = await new Promise((resolve, reject) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        for (const record of result[name]) if (record.blob) record.blob = Array.from(new Uint8Array(await record.blob.arrayBuffer()));
      }
      db.close(); return result;
    });
    const before = await snapshot();
    expect(before.files.length).toBeGreaterThan(0);
    expect(JSON.parse(before.plan_pages[0].drawingJson_c).items).toHaveLength(1);
    rollback = true;
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    // An update must not force an active drawing tab to reload.
    await expect(page.getByRole('button', { name: 'Save drawing', exact: true }).first()).toBeVisible();
    await page.close();
    page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()));
    await page.reload();
    await page.getByRole('button', { name: /^Disposable rollback job/ }).click();
    await expect(page.getByRole('button', { name: 'Save drawing', exact: true }).first()).toBeVisible();
    const after = await snapshot();
    expect(after).toEqual(before);
    await page.getByRole('button', { name: 'Save drawing', exact: true }).first().click();
    expect(JSON.parse((await snapshot()).plan_pages[0].drawingJson_c).items).toHaveLength(1);
    await info.attach('rollback-evidence.json', { body: JSON.stringify({ baseline: JSON.parse(await fs.readFile(path.join(root, 'manifest.json'))), before, after }), contentType: 'application/json' });
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
});
