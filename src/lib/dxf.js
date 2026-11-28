import { stockSections } from './sheetMetalJoints.js';

// Minimal AutoCAD R12 ASCII DXF writer (opens in AutoCAD, BricsCAD, DraftSight, LibreCAD).
// Units are millimetres; Y is flipped so the plan reads the same way up as on screen.

const LAYER_COLOURS = {
  WALLS: 7,
  ROOMS: 8,
  'DUCT-SM': 3,
  'DUCT-SM-CL': 9,
  'DUCT-FLEX': 5,
  SERVICES: 30,
  EQUIP: 4,
  TEXT: 7,
  DIMS: 6,
};

export function createDxf() {
  const ents = [];
  const layers = new Set(Object.keys(LAYER_COLOURS));
  const n = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);
  const api = {
    line(layer, x1, y1, x2, y2) {
      layers.add(layer);
      ents.push(`0\nLINE\n8\n${layer}\n10\n${n(x1)}\n20\n${n(-y1)}\n30\n0\n11\n${n(x2)}\n21\n${n(-y2)}\n31\n0`);
    },
    // Screen coordinates use positive Y down. CAD arcs run anticlockwise with Y up.
    arc(layer, c, radius, from, to, sweep) {
      if (!(radius > 0) || !Number.isFinite(radius)) return;
      const angle = p => ((Math.atan2(c.y - p.y, p.x - c.x) * 180 / Math.PI) + 360) % 360;
      const start = angle(sweep ? to : from), end = angle(sweep ? from : to);
      layers.add(layer);
      ents.push(`0\nARC\n8\n${layer}\n10\n${n(c.x)}\n20\n${n(-c.y)}\n30\n0\n40\n${n(radius)}\n50\n${n(start)}\n51\n${n(end)}`);
    },
    poly(layer, pts, closed = false) {
      for (let i = 1; i < pts.length; i += 1) api.line(layer, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (closed && pts.length > 2) api.line(layer, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
    },
    text(layer, x, y, height, str, rotDeg = 0) {
      const clean = String(str ?? '').replace(/[\r\n]+/g, ' ').trim();
      if (!clean) return;
      layers.add(layer);
      ents.push(`0\nTEXT\n8\n${layer}\n10\n${n(x)}\n20\n${n(-y)}\n30\n0\n40\n${n(height)}\n1\n${clean}\n50\n${n(-rotDeg)}`);
    },
    toString() {
      const tbl = [...layers].map((l) => `0\nLAYER\n2\n${l}\n70\n0\n62\n${LAYER_COLOURS[l] || 7}\n6\nCONTINUOUS`).join('\n');
      return [
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC',
        `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.size}\n${tbl}\n0\nENDTAB\n0\nENDSEC`,
        `0\nSECTION\n2\nENTITIES\n${ents.join('\n')}\n0\nENDSEC`,
        '0\nEOF\n',
      ].join('\n');
    },
  };
  return api;
}

// The same bend layout is used by SVG, bill of materials and DXF, in real mm.
export function writeSheetMetalDxf(dxf, points, layout, { shop = false, sheetLen } = {}) {
  const hw = layout.W / 2;
  const bends = new Map(layout.bends.map(b => [b.i, b]));
  const normal = u => ({ x: -u.y, y: u.x });
  const add = (p, u, k) => ({ x: p.x + u.x * k, y: p.y + u.y * k });
  const line = (layer, a, b) => {
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) dxf.line(layer, a.x, a.y, b.x, b.y);
  };
  const miter = (k, side, u) => {
    const b = bends.get(k);
    const p = points[k];
    const u1 = b?.u1 || layout.segs[k-1]?.u, u2 = b?.u2 || layout.segs[k]?.u;
    if (!u1 || !u2) return add(p, normal(u), side * hw);
    const n1 = normal(u1), n2 = normal(u2);
    const dot = u1.x * u2.x + u1.y * u2.y;
    // Avoid an unbounded miter on near-180-degree reversals.
    const div = Math.max(0.25, 1 + dot);
    return add(p, { x: (n1.x + n2.x) / div, y: (n1.y + n2.y) / div }, side * hw);
  };
  layout.segs.forEach((g, i) => {
    const a = bends.get(i), b = bends.get(i + 1);
    const start = a?.radius ? a.en : points[i];
    const end = b?.radius ? b.st : points[i + 1];
    line('DUCT-SM-CL', start, end);
    for (const side of [-1, 1]) {
      const x = a?.radius ? add(start, normal(g.u), side * hw) : miter(i, side, g.u);
      const y = b?.radius ? add(end, normal(g.u), side * hw) : miter(i + 1, side, g.u);
      line('DUCT-SM', x, y);
    }
    if (shop) {
      const joint = t => {
        const p = add(g.a, g.u, t);
        line('DUCT-SM-JOINT', add(p, normal(g.u), -hw), add(p, normal(g.u), hw));
      };
      if (a) joint(g.from);
      if (b) joint(g.to);
      for (const part of stockSections(g, 1, sheetLen).slice(1)) joint(part.from);
    }
  });
  for (const b of layout.bends.filter(x => x.radius)) {
    dxf.arc('DUCT-SM-CL', b.c, b.R, b.st, b.en, b.sweep);
    for (const side of [-1, 1]) {
      const from = add(b.st, normal(b.u1), side * hw), to = add(b.en, normal(b.u2), side * hw);
      dxf.arc('DUCT-SM', b.c, Math.hypot(from.x - b.c.x, from.y - b.c.y), from, to, b.sweep);
    }
  }
}
