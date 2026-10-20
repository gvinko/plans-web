import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { seedHvac } from '../tests/fixtures/hvac.js';
const origin = 'https://plans-web-disposable-qa-20261020.pages.dev';
// This deliberately cannot target the real application's origin.
await fs.mkdir('.tmp', {recursive:true});
await fs.rm('.tmp/hosted-swapped', {force:true});
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: origin });
let page = await context.newPage();
const snapshot = () => page.evaluate(async () => {
  const db = await new Promise(resolve => { const r = indexedDB.open('ductplanner'); r.onsuccess = () => resolve(r.result); });
  const result = {};
  for (const table of ['projects','plan_pages','files']) {
    result[table] = await new Promise(resolve => { const r = db.transaction(table).objectStore(table).getAll(); r.onsuccess = () => resolve(r.result); });
    for (const rec of result[table]) if(rec.blob) rec.blob = Array.from(new Uint8Array(await rec.blob.arrayBuffer()));
  } db.close(); return result;
});
try {
  await page.goto(origin);
  await expect.poll(async () => (await context.request.get(origin)).headers()['x-qa-version'], {timeout:60000}).toBe('candidate-3f52542');
  await seedHvac(page);
  await page.locator('input[accept="image/*,.pdf,application/pdf"]').setInputFiles({ name: 'rollback.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64') });
  await page.getByRole('button', {name:'Remove the plan image'}).waitFor();
  await page.getByRole('button', {name:'Save drawing',exact:true}).first().click();
  await page.getByRole('status').filter({hasText:/^Saved/}).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button',{name:/^Disposable HVAC QA/}).click();
  await page.getByRole('status').filter({hasText:'Loaded saved drawing'}).waitFor();
  await context.setOffline(false);
  const before = await snapshot();
  await fs.writeFile('.tmp/hosted-ready.json', JSON.stringify({origin,before}));
  console.log('READY for separate-project rollback; active drawing tab retained');
  for(let i=0;i<240;i++) { try {await fs.access('.tmp/hosted-swapped');break;} catch{} await new Promise(r=>setTimeout(r,1000)); }
  await expect.poll(async () => (await context.request.get(origin+'/offline-sw.js')).headers()['x-qa-version'], {timeout:60000}).toBe('baseline-retirement');
  const sw = await context.request.get(origin+'/offline-sw.js');
  expect(sw.headers()['x-qa-version']).toBe('baseline-retirement');
  expect(sw.headers()['content-type']).toContain('javascript');
  expect(sw.headers()['cache-control']).toBe('no-cache');
  await page.evaluate(async () => {const r=await navigator.serviceWorker.getRegistration(); await r.update();});
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
  await expect(page.getByRole('button',{name:'Save drawing',exact:true}).first()).toBeVisible();
  const activeAfter = await snapshot(); expect(activeAfter).toEqual(before);
  await page.close();
  page=await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()));
  const baseline=await page.reload();
  expect(baseline.headers()['x-qa-version']).toBe('baseline-retirement');
  const after=await snapshot(); expect(after).toEqual(before);
  await page.getByRole('button',{name:/^Disposable HVAC QA/}).click();
  await page.getByRole('button',{name:'Save drawing',exact:true}).first().click();
  await expect.poll(async () => (await snapshot()).plan_pages[0].ModifiedOn).not.toBe(before.plan_pages[0].ModifiedOn);
  const saved=await snapshot();
  expect(JSON.parse(saved.plan_pages[0].drawingJson_c).sketch).toEqual(JSON.parse(before.plan_pages[0].drawingJson_c).sketch);
  await fs.writeFile('.tmp/hosted-rollback-evidence.json',JSON.stringify({origin,proxy:true,candidate:'3f52542',baseline:'a794d8f',workerRetired:true,activeAfter,before,after,saved},null,2));
  console.log('PASS: hosted rollback, offline, waiting worker, retirement, byte preservation, baseline reopen/save');
} finally { await browser.close(); }
