// Browser test for Sketch to Plan, desktop and phone, against a built copy of the app.
//   node test/e2e/sketch-to-plan.e2e.mjs http://127.0.0.1:4173 [real-photo.jpg]
// Needs Playwright (npx playwright / a global install). Not part of `npm test`.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';

const require = createRequire(process.env.PW_MODULES || import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const REAL = process.argv[3];
const OUT = process.env.E2E_OUT || 'test-results';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

// A made-up sketch photo: a sheet of graph paper lying at an angle on a timber table, half in
// shadow, with a two-room plan, a circle and some scribbled writing.
async function syntheticSketch(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
    const g = c.getContext('2d');
    g.fillStyle = '#be8c55'; g.fillRect(0, 0, c.width, c.height);
    g.translate(600, 750); g.rotate(0.05); g.translate(-450, -600);
    g.fillStyle = '#f5f4f0'; g.fillRect(0, 0, 900, 1200);
    g.strokeStyle = '#b0c4de'; g.lineWidth = 1;
    for (let x = 15; x < 900; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1200); g.stroke(); }
    for (let y = 15; y < 1200; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(900, y); g.stroke(); }
    g.strokeStyle = '#46464c'; g.lineWidth = 4; g.lineCap = 'round';
    const wob = (x1, y1, x2, y2) => { g.beginPath(); const n = 40; for (let i = 0; i <= n; i += 1) { const t = i / n; const w = 2.5 * Math.sin(i / 3); const x = x1 + (x2 - x1) * t + (y2 === y1 ? 0 : w); const y = y1 + (y2 - y1) * t + (y2 === y1 ? w : 0); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
    wob(150, 200, 750, 200); wob(150, 650, 750, 650); wob(150, 200, 150, 650); wob(750, 200, 750, 650); wob(450, 200, 450, 650);
    g.beginPath(); g.arc(300, 420, 14, 0, 7); g.stroke();
    g.font = '36px cursive'; g.fillStyle = '#46464c'; g.fillText('Z7', 560, 430); g.fillText('18kW', 380, 900);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(20,20,60,0.35)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(700, 0); g.lineTo(0, 1100); g.fill();
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  return { name: 'synthetic-sketch.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

async function newProject(page, name) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByLabel('Customer name').fill(name);
  await page.getByLabel('Street address').fill('1 Synthetic Test Street');
  await page.getByLabel('Suburb').fill('Testville');
  await page.getByLabel('Phone').fill('0400000000');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('s2p-button').waitFor();
}
const count = (page, sel) => page.locator(sel).count();
// a third of the way along, so the tap lands clear of the junctions in the middle of a wall
async function clickMid(page, locator) { const b = await locator.boundingBox(); await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.3); }

async function run(label, contextOpts, file, expectExact) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ ...contextOpts, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const T = (n) => `${label}: ${n}`;
  try {
    await newProject(page, `S2P ${label} ${Date.now()}`);
    // existing tools still work first
    await page.getByRole('button', { name: 'FCU (Indoor Unit)', exact: true }).click().catch(() => {});
    const upload = file || await syntheticSketch(page);

    // a wrong file type is refused with a reason
    await page.getByTestId('s2p-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    check(T('wrong file type refused'), await page.getByText('Use a JPG, PNG or WebP photo, or a PDF.').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false));

    await page.getByTestId('s2p-file').setInputFiles(upload);
    await page.getByTestId('s2p-detect').waitFor();
    check(T('upload opens the dialog on the page step'), await page.getByTestId('s2p-dialog').isVisible());
    if (expectExact) check(T('page edges found automatically'), await page.getByText('The page edges were found.').isVisible());
    await page.screenshot({ path: `${OUT}/${label}-1-page.png` });
    // drag a corner handle a little and back (corner correction works with the pointer)
    const corner = page.locator('[data-corner="0"]');
    const cb = await corner.boundingBox();
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.down(); await page.mouse.move(cb.x + cb.width / 2 + 6, cb.y + cb.height / 2 + 6); await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.up();

    await page.getByTestId('s2p-detect').click();
    await page.getByTestId('s2p-counts').waitFor({ timeout: 60000 });
    const walls0 = await count(page, '[data-wall][data-off="0"]');
    const rooms0 = await count(page, '[data-room]');
    check(T('walls found'), expectExact ? walls0 === 5 : walls0 >= 10, `${walls0} walls`);
    check(T('rooms found'), expectExact ? rooms0 === 2 : rooms0 >= 1, `${rooms0} rooms`);
    await page.screenshot({ path: `${OUT}/${label}-2-review.png` });
    if (contextOpts.viewport.width < 768) {
      await page.locator('[data-pane="sketch"]').click();
      check(T('phone: toggle to the original sketch'), await page.getByAltText('Your sketch, straightened').isVisible());
      await page.locator('[data-pane="plan"]').click();
      const box = await page.getByTestId('s2p-dialog').boundingBox();
      check(T('phone: dialog fits the screen width'), box.width <= contextOpts.viewport.width);
    } else {
      check(T('desktop: original and found plan side by side'), await page.getByAltText('Your sketch, straightened').isVisible() && await page.getByTestId('s2p-overlay').isVisible());
    }
    // leave a wall out and put it back
    const firstWall = page.locator('[data-wall][data-off="0"]').first();
    const wid = await firstWall.getAttribute('data-wall');
    await firstWall.dispatchEvent('click');
    check(T('tap a wall to leave it out'), (await count(page, '[data-wall][data-off="0"]')) === walls0 - 1);
    await page.locator(`[data-wall="${wid}"]`).dispatchEvent('click');
    check(T('tap again to put it back'), (await count(page, '[data-wall][data-off="0"]')) === walls0);
    // say what one bit of writing is
    await page.locator('[data-note]').first().dispatchEvent('click');
    await page.getByTestId('s2p-note').locator('input').fill('Bed 2');
    await page.getByTestId('s2p-note').getByRole('button', { name: 'Done' }).click();
    check(T('writing is only used once typed in'), await page.getByTestId('s2p-overlay').getByText('Bed 2').isVisible());

    await page.getByTestId('s2p-to-scale').click();
    check(T('no scale is assumed'), await page.getByTestId('s2p-noscale').isVisible());
    const hasGrid = await page.getByTestId('s2p-square').isVisible().catch(() => false);
    check(T('graph squares offered for scale'), hasGrid);
    if (hasGrid) {
      await page.getByTestId('s2p-square').fill('500');
      const txt = await page.getByTestId('s2p-size').innerText();
      const m = txt.match(/([\d.]+) m × ([\d.]+) m/);
      check(T('scale from one square gives a building size'), !!m && (!expectExact || (Math.abs(Number(m[1]) - 10) < 0.6 && Math.abs(Number(m[2]) - 7.5) < 0.6)), m ? m[0] : txt);
    }
    await page.getByTestId('s2p-open').click();
    await page.getByTestId('s2p-dialog').waitFor({ state: 'hidden' });
    await page.locator('[data-est="1"]').first().waitFor({ state: 'attached' });
    const est0 = await count(page, 'line[data-est="1"]');
    check(T('walls arrive in the normal editor, marked unverified'), est0 === walls0, `${est0} dashed walls`);
    check(T('sketch shows underneath with a see-through slider'), await page.getByAltText('Uploaded plan').isVisible() && await page.getByTestId('bg-opacity').isVisible());
    await page.screenshot({ path: `${OUT}/${label}-3-editor.png` });

    // correct: select a wall, split it, undo, verify
    const lines0 = await count(page, 'line[data-wall-line]');
    await clickMid(page, page.locator('line[data-est="1"]').first());
    await page.getByTestId('est-panel').waitFor({ timeout: 5000 }).catch(() => {});
    const panel = await page.getByTestId('est-panel').isVisible().catch(() => false);
    check(T('selecting a detected wall shows it is unverified'), panel);
    if (panel) {
      await page.getByRole('button', { name: 'Split in two' }).click();
      check(T('split a wall'), (await count(page, 'line[data-wall-line]')) === lines0 + 1);
      await page.waitForTimeout(600);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
      check(T('undo'), (await count(page, 'line[data-wall-line]')) === lines0);
      await page.keyboard.press('Control+y');
      await page.waitForTimeout(300);
      const redo = (await count(page, 'line[data-wall-line]')) === lines0 + 1;
      if (!redo) { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(300); }
      check(T('redo'), (await count(page, 'line[data-wall-line]')) === lines0 + 1);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
      // drag one end of the selected wall
      await clickMid(page, page.locator('line[data-est="1"]').first());
      const end = page.locator('[data-wall-end="2"]');
      if (await end.count()) {
        const eb = await end.boundingBox();
        const coords = () => page.locator('line[data-wall-line]').evaluateAll((els) => els.map((e) => ['x1', 'y1', 'x2', 'y2'].map((k) => e.getAttribute(k)).join()).join(';'));
        const before = await coords();
        const fx = eb.x + eb.width / 2; const fy = eb.y + eb.height / 2;
        if (contextOpts.hasTouch) {
          // a real finger drag on the phone
          const cdp = await ctx.newCDPSession(page);
          const pt = (x, y) => [{ x, y, id: 1 }];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(fx, fy) });
          for (let i = 1; i <= 5; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(fx + i * 5, fy + i * 5) });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await page.mouse.move(fx, fy); await page.mouse.down(); await page.mouse.move(fx + 23, fy + 23, { steps: 4 }); await page.mouse.up();
        }
        const moved = (await coords()) !== before;
        check(T(contextOpts.hasTouch ? 'drag a wall end with a finger' : 'drag a wall end'), moved);
        if (!moved) throw new Error('wall end did not move');
        await page.waitForTimeout(600); await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
      }
      await clickMid(page, page.locator('line[data-est="1"]').first());
      await page.getByRole('button', { name: 'Mark verified' }).click();
      check(T('mark one wall verified'), (await count(page, 'line[data-est="1"]')) === est0 - 1);
      await clickMid(page, page.locator('line[data-est="1"]').first());
      await page.getByRole('button', { name: /Verify all/ }).click();
      check(T('verify all'), (await count(page, 'line[data-est="1"]')) === 0);
    }

    // save, reload, reopen
    await page.getByRole('button', { name: 'Save drawing', exact: true }).click();
    await page.waitForTimeout(1200);
    const stored = await page.evaluate(async () => new Promise((resolve) => {
      const rq = indexedDB.open('ductplanner');
      rq.onsuccess = () => { const all = rq.result.transaction('files').objectStore('files').getAll(); all.onsuccess = () => resolve(all.result.map((f) => ({ name: f.name, size: f.size }))); };
      rq.onerror = () => resolve([]);
    }));
    const orig = stored.find((f) => f.name.startsWith('sketch-original-'));
    check(T('original upload kept byte-for-byte'), orig && orig.size === upload.buffer.length, orig ? `${orig.size} bytes` : 'missing');
    const url = page.url();
    await page.reload({ waitUntil: 'networkidle' });
    if (!(await page.getByTestId('s2p-button').isVisible().catch(() => false))) await page.getByRole('button', { name: /S2P/ }).first().click();
    await page.getByTestId('s2p-button').waitFor();
    await page.waitForTimeout(800);
    check(T('saved plan reopens with its walls'), (await count(page, 'line[data-wall-line]')) === lines0, `${await count(page, 'line[data-wall-line]')} of ${lines0} (${url})`);
    check(T('saved plan reopens with the sketch underneath'), await page.getByAltText('Uploaded plan').isVisible());

    // works with the existing tools: DXF export carries the walls
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.keyboard.press('Control+Shift+E');
    const d = await dl;
    if (d) { const txt = readFileSync(await d.path(), 'utf8'); check(T('DXF export includes the walls'), (txt.match(/\nLINE\n8\nWALLS/g) || []).length >= lines0, `${(txt.match(/\nLINE\n8\nWALLS/g) || []).length} WALLS lines`); } else check(T('DXF export includes the walls'), false, 'no download');
    await page.screenshot({ path: `${OUT}/${label}-4-reopened.png` });
  } catch (err) {
    check(T(`ran to the end`), false, err.message.split('\n')[0]);
    await page.screenshot({ path: `${OUT}/${label}-error.png` }).catch(() => {});
  }
  check(T('no uncaught errors'), errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
}

await run('desktop', { viewport: { width: 1440, height: 900 } }, null, true);
await run('phone', { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, null, true);
if (REAL) await run('real', { viewport: { width: 1440, height: 900 } }, { name: 'real-sketch.jpg', mimeType: 'image/jpeg', buffer: readFileSync(REAL) }, false);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
