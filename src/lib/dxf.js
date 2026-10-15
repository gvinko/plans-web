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
