// Synthetic job only. Stale stored endpoints deliberately exercise live ties.
export const hvacDrawing = {
  scale: { pxPerM: 100, a: { x: 100, y: 100 }, b: { x: 620, y: 100 }, mm: 5200 },
  items: [
    { id: 'vcd', type: 'vcd', cx: 100, cy: 100, rot: 0, dims: { w: 300, d: 150 }, spec: {} },
    { id: 'fan', type: 'exhfan', cx: 700, cy: 400, rot: 45, dims: { w: 300, d: 400 }, spec: { duty: '100 L/s @ 100Pa' }, fanModel: 'QA FAN', fanSupplier: 'Disposable' },
    { id: 'outlet', type: 'supply', cx: 450, cy: 300, rot: 0, spec: { neck: '200mm', variant: 'Metal Diffusers + Neck' } },
  ],
  connections: [], joins: [],
  sketch: [
    { id: 'main', kind: 'smduct', pts: [{ x: -100, y: -100 }, { x: 620, y: 100 }, { x: 620, y: 250 }], w: 300, h: 200, air: 'supply', sheetLen: 2400, a: { kind: 'port', itemId: 'vcd', portId: 'e' }, ls: 250 },
    { id: 'branch', kind: 'smduct', pts: [{ x: 0, y: 0 }, { x: 350, y: 300 }], w: 200, h: 150, air: 'supply', sheetLen: 2400, a: { kind: 'side', id: 'main', seg: 0, t: 0.5 }, capB: true },
    { id: 'reducer', kind: 'smduct', pts: [{ x: 0, y: 0 }, { x: 620, y: 400 }], w: 200, h: 150, air: 'supply', sheetLen: 2400, a: { kind: 'run', id: 'main', end: 'end' }, trKind: 'flatL', taper: 4, capB: true },
    { id: 'return', kind: 'smduct', pts: [{ x: 150, y: 450 }, { x: 450, y: 450 }, { x: 520, y: 520 }], w: 400, h: 250, air: 'return', sheetLen: 2400, bend: 'radius', capA: true, capB: true },
    { id: 'ruler', kind: 'wall', x1: 100, y1: 560, x2: 620, y2: 560 },
    { id: 'note', kind: 'text', x1: 100, y1: 590, text: 'QA ONLY - 5200 mm reference' },
  ],
  layout: { orient: 'landscape', side: 'beside', page2: true, title: 'Disposable HVAC release fixture', kind: 'concept', dwgNo: 'QA-01' },
  showLabels: true, showFab: false, textStyle: { size: 0.7, color: '' },
};

export async function seedHvac(page, drawing = hvacDrawing) {
  await page.goto('/');
  await page.getByRole('heading', { name: 'New project' }).waitFor();
  await page.evaluate(async drawing => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('ductplanner'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'plan_pages'], 'readwrite');
      tx.objectStore('projects').put({ Id: 91001, Name: 'Disposable HVAC QA', suburb_c: 'Test', address_c: 'Synthetic fixture only' });
      tx.objectStore('plan_pages').put({ Id: 91001, projectId_c: 91001, Name: 'Ground floor', drawingJson_c: JSON.stringify(drawing), planFile_c: [], sitePhotos_c: [] });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
  }, drawing);
  await page.reload();
  await page.getByRole('button', { name: /^Disposable HVAC QA/ }).click();
  await page.getByRole('status').filter({ hasText: 'Loaded saved drawing' }).waitFor();
}
