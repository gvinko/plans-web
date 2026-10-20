import { test, expect } from '@playwright/test';

test('CAD live ties, merge, fittings, bends, stock lengths and print dimensions', async ({ page }) => {
  test.skip(!!process.env.TEST_BASE_URL, 'Geometry module fixture runs against local source');
  await page.goto('http://127.0.0.1:4175/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/components/DrawingWorkspace.jsx');
    const run = (id, pts, extra = {}) => ({ id, kind: 'smduct', w: 300, h: 200, pts, ...extra });
    const part = { id: 'damper', type: 'vcd', cx: 100, cy: 100, rot: 0, dims: { w: 300, d: 150 } };
    const port = g.portInfo(part, 'w', 100);
    const a = run('a', [{ x: -100, y: -100 }, { x: 300, y: 100 }], { a: { kind: 'port', itemId: part.id, portId: port.id } });
    const b = run('b', [{ x: 300, y: 100 }, { x: 500, y: 100 }]);
    const branch = run('branch', [{ x: 0, y: 0 }, { x: 400, y: 300 }], { a: { kind: 'side', id: 'b', seg: 0, t: 0.5 }, w: 200 });
    const ctx = { items: [part], sketch: [a, b, branch], ppm: 100 };
    const merged = g.smMerge(ctx.sketch, 'a', 'end', 'b', 'start', ctx);
    const mc = { ...ctx, sketch: merged };
    const mergedBranch = merged.find(s => s.id === 'branch');
    const reducer = run('reducer', [{ x: 500, y: 100 }, { x: 700, y: 100 }], { a: { kind: 'run', id: 'b', end: 'end' }, w: 200, trKind: 'flatL', taper: 4 });
    const rc = { ...ctx, sketch: [...ctx.sketch, reducer] };
    const square = g.smLayout([{ x: 0, y: 0 }, { x: 520, y: 0 }, { x: 520, y: 300 }], a, 0.1);
    const radius = g.smLayout([{ x: 0, y: 0 }, { x: 520, y: 0 }, { x: 520, y: 300 }], { ...a, bend: 'radius' }, 0.1);
    const stock = g.smPieces(square.segs, 0.1, 2400);
    const dx = await import('/src/lib/dxf.js');
    const dxf = dx.createDxf(); dxf.line('DUCT-SM', 0, 0, 5200, 0); dxf.text('TEXT', 2600, 0, 100, '300x200');
    return {
      port: { x: port.x, y: port.y }, mergedStart: g.smPts(merged[0], mc)[0],
      branchTie: mergedBranch.a, branchPoint: g.smPts(mergedBranch, mc)[0],
      branchFittings: g.smEndFittings(mergedBranch, mc).map(f => f.type),
      transition: g.smEndFittings(reducer, rc).find(f => f.type === 'transition')?.lenMm,
      eccentric: g.smPts(reducer, rc)[0],
      bends: square.bends.map(b => b.deg), radius: radius.bends[0].R,
      pieces: Object.fromEntries(stock.tally), pieceCount: stock.count,
      label: g.clearSeg([{ x: 0, y: 0 }, { x: 500, y: 0 }], [{ x: 250, y: 0, r: 100 }]),
      networks: g.smNetworks(mc).length,
      a4: g.planBox('A4', { side: 'beside' }), a3: g.planBox('A3', { side: 'below' }),
      dxf: dxf.toString(),
    };
  });
  expect(result.mergedStart).toEqual(result.port);
  expect(result.branchTie).toMatchObject({ id: 'a', seg: 1, t: 0.5 });
  expect(result.branchPoint).toEqual({ x: 400, y: 100 });
  expect(result.branchFittings).toContain('bto');
  expect(result.transition).toBe(400);
  expect(result.eccentric).toEqual({ x: 500, y: 95 });
  expect(result.bends).toEqual([90]); expect(result.radius).toBeCloseTo(30);
  expect(result.pieces).toEqual({ 2400: 3, 400: 1, 600: 1 }); expect(result.pieceCount).toBe(5);
  expect(result.label.x).toBe(75); expect(result.networks).toBe(1);
  expect(result.a4).toEqual({ w: 200, h: 149 }); expect(result.a3).toEqual({ w: 404, h: 181 });
  expect(result.dxf).toContain('5200'); expect(result.dxf).toContain('300x200'); expect(result.dxf).toContain('AC1009');
});
