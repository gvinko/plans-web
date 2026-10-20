import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('blocked preference storage does not crash projects', async ({page}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked fixture','SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked fixture','SecurityError'); };
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'New project'})).toBeVisible();
});

async function create(page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill('Disposable audit job');
  await page.getByRole('textbox', { name: 'Suburb', exact: true }).fill('Test suburb');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: /^Disposable audit job/ }).click();
  await expect(page.getByRole('button', { name: 'Save drawing', exact: true }).first()).toBeVisible();
}

test('project creation, mobile save, reload and offline shell', async ({ page, context }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  await page.getByRole('button', { name: 'Save drawing', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  await page.screenshot({path:info.outputPath('mobile.png'),fullPage:true});
  await page.reload();
  await page.getByRole('button', { name: /^Disposable audit job/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Loaded saved drawing' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /^Disposable audit job/ }).click();
  await expect(page.getByRole('button', { name: 'Save drawing', exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('projects and workspace accessibility', async ({ page }, info) => {
  await page.goto('/');
  const projects = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  await create(page);
  const workspace = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  await page.screenshot({path:info.outputPath('desktop.png'),fullPage:true});
  await info.attach('axe.json', { body: JSON.stringify({ projects: projects.violations, workspace: workspace.violations }, null, 2), contentType: 'application/json' });
  expect(projects.violations).toEqual([]);
  expect(workspace.violations).toEqual([]);
});

test('ZIP round trip preserves drawing and image bytes; malformed restore is atomic', async ({ page }) => {
  test.skip(!!process.env.TEST_BASE_URL, 'Source module harness runs locally only');
  await page.goto('http://127.0.0.1:4175/');
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/services/localDb.js');
    const { buildBackupZip, restoreBackup } = await import('/src/lib/backup.js');
    const { default: JSZip } = await import('/node_modules/.vite/deps/jszip.js');
    await db.projects.add({ Id: 7001, Name: 'Disposable ZIP fixture' });
    const drawingJson_c = JSON.stringify({ items: [], sketch: [{ id: 'run1', kind: 'smduct', pts: [{x:0,y:0},{x:200,y:100}], w:300,h:200 }] });
    await db.files.put({key:'audit-image',name:'fixture.txt',type:'text/plain',size:7,blob:new Blob(['fixture'])});
    await db.plan_pages.add({Id:7001,projectId_c:7001,drawingJson_c,planFile_c:[{key:'audit-image'}],sitePhotos_c:[]});
    const { blob } = await buildBackupZip();
    await db.projects.put({Id:7002,Name:'Keep me'});
    await db.plan_pages.update(7001,{drawingJson_c:'[]'});
    const restored = await restoreBackup(blob);
    const preserved = (await db.projects.get(7002)).Name;
    const drawing = (await db.plan_pages.get(7001)).drawingJson_c;
    const image = await (await db.files.get('audit-image')).blob.text();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const legacyManifest=JSON.parse(await zip.file('backup.json').async('string')); delete legacyManifest.format;
    zip.file('backup.json',JSON.stringify(legacyManifest));
    const legacy=await restoreBackup(await zip.generateAsync({type:'blob'}));
    legacyManifest.projects[0].Name='Must not write';
    zip.file('backup.json',JSON.stringify(legacyManifest));
    zip.remove('files/audit-image');
    let rejected = false;
    try { await restoreBackup(await zip.generateAsync({type:'blob'})); } catch { rejected = true; }
    return { restored, legacy, preserved, drawingMatches: drawing === drawingJson_c, image, rejected, originalName:(await db.projects.get(7001)).Name, projects: await db.projects.count() };
  });
  expect(result).toMatchObject({restored:{projects:1,levels:1,files:1},legacy:{projects:1,levels:1,files:1},preserved:'Keep me',drawingMatches:true,image:'fixture',rejected:true,originalName:'Disposable ZIP fixture',projects:2});
});
