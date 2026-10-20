import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill('Disposable save fixture');
  await page.getByRole('textbox', { name: 'Suburb', exact: true }).fill('Test');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: /^Disposable save fixture/ }).click();
}
async function addDamper(page) {
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).first().fill('Volume Control');
  await page.getByRole('button', { name: 'Volume Control Damper (VCD)', exact: true }).click();
}
test('PDF plan loads through the lazy reader and is stored', async ({page}) => {
  await open(page);
  const stream='10 10 m 180 180 l S\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const start=Buffer.byteLength(pdf);
  pdf+=`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  await page.locator('input[accept="image/*,.pdf,application/pdf"]').setInputFiles({name:'disposable.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
  await expect(page.getByRole('status').filter({hasText:/Auto-saved/})).toBeVisible({timeout:30000});
  await page.reload();
  await page.getByRole('button',{name:/^Disposable save fixture/}).click();
  await expect(page.getByRole('button',{name:'Remove the plan image'})).toBeVisible();
});
test('part autosaves and survives reload', async ({ page }) => {
  await open(page); await addDamper(page);
  await expect(page.getByRole('status').filter({hasText:'Auto-saved'})).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Disposable save fixture/ }).click();
  await page.getByRole('button', {name:'Save drawing',exact:true}).first().click();
  await expect(page.getByRole('status').filter({hasText:/1 objects/})).toBeVisible();
});
test('tap-by-tap sheet duct keeps bends in one saved run', async ({page}) => {
  await open(page);
  await page.keyboard.press('d');
  const canvas=page.locator('[data-drawing-canvas]');
  await canvas.click({position:{x:150,y:150}});
  await canvas.click({position:{x:300,y:150}});
  await canvas.click({position:{x:400,y:250}});
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Auto-saved'})).toBeVisible();
  const drawing=await page.evaluate(async () => {
    const database=await new Promise(resolve=>{const r=indexedDB.open('ductplanner');r.onsuccess=()=>resolve(r.result);});
    const json=await new Promise(resolve=>{const r=database.transaction('plan_pages').objectStore('plan_pages').get(1);r.onsuccess=()=>resolve(r.result.drawingJson_c);});
    database.close();return JSON.parse(json);
  });
  expect(drawing.sketch.filter(s=>s.kind==='smduct')).toHaveLength(1);
  expect(drawing.sketch.find(s=>s.kind==='smduct').pts).toHaveLength(3);
});
test('save failure keeps draft and prevents leaving; retry succeeds', async ({page}) => {
  await open(page);
  await page.evaluate(() => {
    window.auditOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'plan_pages') throw new DOMException('Disposable quota failure','QuotaExceededError');
      return window.auditOriginalPut.apply(this,args);
    };
  });
  await addDamper(page);
  await expect(page.getByRole('status').filter({hasText:'SAVE FAILED'})).toBeVisible();
  await page.getByRole('button',{name:'Projects',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save drawing',exact:true}).first()).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some(k=>k.startsWith('dp-draft-')))).toBe(true);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.auditOriginalPut; });
  await page.getByRole('button',{name:'Save drawing',exact:true}).first().click();
  await expect(page.getByRole('status').filter({hasText:/Saved/})).toBeVisible();
});

test('empty canvas cannot autosave over a populated drawing', async ({page}) => {
  await open(page); await addDamper(page);
  await expect(page.getByRole('status').filter({hasText:'Auto-saved'})).toBeVisible();
  await page.getByRole('textbox',{name:'Search parts',exact:true}).first().blur();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('status').filter({hasText:'Empty canvas not saved'})).toBeVisible();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button',{name:'Save drawing',exact:true}).first().click();
  await expect(page.getByRole('status').filter({hasText:'Empty canvas not saved'})).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('button',{name:'Save drawing',exact:true}).first().click();
  await expect(page.getByRole('status').filter({hasText:/Saved.*0 objects/})).toBeVisible();
});

test('unreadable saved drawing is never replaced by a blank save', async ({page}) => {
  await open(page);
  await page.getByRole('button',{name:'Projects',exact:true}).click();
  await page.evaluate(async () => {
    const database = await new Promise((resolve,reject) => { const r=indexedDB.open('ductplanner'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
    await new Promise((resolve,reject) => {
      const tx=database.transaction('plan_pages','readwrite'); const store=tx.objectStore('plan_pages');
      const req=store.get(1);req.onsuccess=()=>store.put({...req.result,drawingJson_c:'{broken fixture'});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    }); database.close();
  });
  await page.reload();
  await page.getByRole('button',{name:/^Disposable save fixture/}).click();
  await expect(page.getByRole('status').filter({hasText:'saving blocked'})).toBeVisible();
  await page.getByRole('button',{name:'Save drawing',exact:true}).first().click();
  await expect(page.getByRole('status').filter({hasText:'saving blocked'})).toBeVisible();
  const original = await page.evaluate(async () => {
    const database = await new Promise(resolve => {const r=indexedDB.open('ductplanner');r.onsuccess=()=>resolve(r.result);});
    const value = await new Promise(resolve => {const r=database.transaction('plan_pages').objectStore('plan_pages').get(1);r.onsuccess=()=>resolve(r.result.drawingJson_c);});
    database.close(); return value;
  });
  expect(original).toBe('{broken fixture');
});
