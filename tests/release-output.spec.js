import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { seedHvac, hvacDrawing } from './fixtures/hvac.js';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

function entities(dxf) {
  const lines = dxf.trim().split(/\r?\n/); const result = []; let entity;
  for (let i = 0; i < lines.length; i += 2) {
    const code = lines[i], value = lines[i + 1];
    if (code === '0') { entity = { kind: value }; result.push(entity); }
    else if (entity) entity[code] = value;
  }
  return result;
}

test('representative HVAC job exports live port ties, scaled DXF and BOM', async ({ page }, info) => {
  await seedHvac(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export DXF/ }).click();
  const file = await download; const dxf = await fs.readFile(await file.path(), 'utf8');
  await info.attach('hvac.dxf', { body: dxf, contentType: 'application/dxf' });
  const ents = entities(dxf);
  const cl = ents.filter(e => e.kind === 'LINE' && e['8'] === 'DUCT-SM-CL');
  // East port is half the fixture's 300 mm footprint past centre.
  expect(cl[0]).toMatchObject({ '10': '1150', '20': '-1000', '11': '6200', '21': '-1000' });
  expect(ents.find(e => e.kind === 'LINE' && e['8'] === 'WALLS')).toMatchObject({ '10': '1000', '11': '6200', '20': '-5600', '21': '-5600' });
  expect(dxf).toContain('AC1009'); expect(dxf).not.toContain('NaN');
  await page.getByRole('button', { name: /^List \(/ }).click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const csvFile = await csvDownload; const csv = await fs.readFile(await csvFile.path(), 'utf8');
  await info.attach('hvac-bom.csv', { body: csv, contentType: 'text/csv' });
  expect(csv).toContain('"Ductwork","1","Branch take-off (shoe)');
  expect(csv).toContain('"Ductwork","1","Transition — 300 x 200 to 200 x 150 x 400mm long');
  expect(csv).toContain('"Ductwork","5","TDF joint set — 300 x 200 mm"');
  expect(csv).toContain('"Ductwork","2","End cap — 200 x 150 mm"');
  expect(csv).toContain('"Ductwork","7","Sheet metal duct — 300 x 200 mm"');
  expect(csv).toContain('pieces: 2 x 2400mm + 1 x 1500mm + 1 x 250mm');
  await page.screenshot({ path: info.outputPath('hvac-design.png'), fullPage: true });
  expect(errors).toEqual([]);
});

for (const { paper, shop } of [{paper:'A3',shop:false}, {paper:'A4',shop:false}, {paper:'A3',shop:true}]) test(`actual ${paper} ${shop ? 'shop' : 'design'} PDF uses true scale and equipment page`, async ({ page }, info) => {
  await seedHvac(page, { ...hvacDrawing, showFab: shop });
  await page.evaluate(() => { window.print = () => { window.qaPrintCalled = true; }; });
  await page.getByTitle('Export the plan and schedule as a PDF', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Sheet', exact: true }).selectOption(paper);
  await dialog.getByRole('combobox', { name: 'Scale', exact: true }).selectOption('50');
  await dialog.getByRole('button', { name: 'Make PDF', exact: true }).click();
  await page.waitForFunction(() => window.qaPrintCalled);
  await page.emulateMedia({ media: 'print' });
  const measurement = await page.locator('[data-drawing-canvas] svg').first().evaluate(svg => {
    const wall = [...svg.querySelectorAll('line')].find(e => e.getAttribute('x1') === '100' && e.getAttribute('x2') === '620' && e.getAttribute('y1') === '560');
    if (!wall) throw new Error('Reference wall missing');
    const m = wall.getScreenCTM();
    return { mm: 520 * Math.hypot(m.a, m.b) * 25.4 / 96, bodyWidth: document.body.scrollWidth };
  });
  expect(measurement.mm).toBeCloseTo(104, 1);
  const bytes = await page.pdf({ path: info.outputPath(`hvac-${paper}.pdf`), preferCSSPageSize: true, printBackground: true });
  // Read the actual PDF, including its vector transforms; DOM scale alone is insufficient.
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  try {
    expect(pdf.numPages).toBe(paper === 'A3' ? 2 : 3);
    const first = await pdf.getPage(1);
    const [,, width, height] = first.view;
    expect(width * 25.4 / 72).toBeCloseTo(paper === 'A3' ? 420 : 297, 0);
    expect(height * 25.4 / 72).toBeCloseTo(paper === 'A3' ? 297 : 210, 0);
    const op = await first.getOperatorList();
    let matrix = [1, 0, 0, 1, 0, 0]; const stack = []; const referenceLengths = [];
    for (let i = 0; i < op.fnArray.length; i++) {
      const fn = op.fnArray[i], args = op.argsArray[i];
      if (fn === OPS.save) stack.push(matrix.slice());
      if (fn === OPS.restore) matrix = stack.pop();
      if (fn === OPS.transform) matrix = Util.transform(matrix, args);
      if (fn === OPS.constructPath && JSON.stringify(args[1]) === '[100,560,620,560]') {
        referenceLengths.push(520 * Math.hypot(matrix[0], matrix[1]) * 25.4 / 72);
      }
    }
    expect(referenceLengths.length).toBeGreaterThan(0);
    for (const mm of referenceLengths) expect(mm).toBeCloseTo(104, 0);
    const text = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const pageText = content.items.map(x => x.str).join(' ');
      expect(pageText.length).toBeGreaterThan(100); text.push(pageText);
    }
    expect(text[0]).toContain(`1:50 @ ${paper}`);
    expect(text[0]).toContain('QA FAN'); expect(text[1]).toContain('EQUIPMENT SCHEDULE');
    expect(text.join(' ')).toContain('2 x 2400mm');
    if (shop) {
      expect(text[0]).toContain('4 pcs');
      expect(text[0]).toContain('300×200   →   200×150');
    } else expect(text[0]).not.toContain(' pcs');
    await info.attach('pdf-evidence.json', { body: JSON.stringify({ pages: pdf.numPages, width, height, referenceLengths, text }), contentType: 'application/json' });
  } finally { await pdf.destroy(); }
  await info.attach('print-measurement.json', { body: JSON.stringify({ paper, ...measurement }), contentType: 'application/json' });
});
