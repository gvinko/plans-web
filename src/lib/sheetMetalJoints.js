// SHOP-only presentation of sheet-metal elbow flange joints.
// SVG coordinates are world units; pixelsPerMm is ppm / 1000.
// These markers describe a join, not a physical gap or a fabricated elbow length.

const MAX_STOCK_MM = 2400;
const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const rounded = (n) => Number(n.toFixed(3));

export function sheetStockLengthMm(value) {
  const n = Number(value);
  // The editor offers 1200/1500/2400 mm. Reject corrupted micro-lengths before they create enormous piece loops.
  return Number.isFinite(n) && n >= 1200 ? Math.min(MAX_STOCK_MM, Math.round(n)) : MAX_STOCK_MM;
}

export function shouldShowShopElbowJoints({ showFab = false, scale = false, mat = '' } = {}) {
  return Boolean(showFab && scale && mat === 'sheet');
}

export function elbowJointStrokes({ bends = [], points = [], widthPx = 0, pixelsPerMm = 0 } = {}) {
  if (!Array.isArray(bends) || !Array.isArray(points) || !Number.isFinite(widthPx) || widthPx <= 0 || !Number.isFinite(pixelsPerMm) || pixelsPerMm <= 0) return [];
  const extent = widthPx / 2 + Math.max(1, 35 * pixelsPerMm);
  const strokes = [];
  const line = (c, u) => {
    if (!finitePoint(c) || !finitePoint(u)) return null;
    const L = Math.hypot(u.x, u.y);
    if (!Number.isFinite(L) || L < 0.001) return null;
    const nx = -u.y / L;
    const ny = u.x / L;
    return `M${rounded(c.x - nx * extent)},${rounded(c.y - ny * extent)} L${rounded(c.x + nx * extent)},${rounded(c.y + ny * extent)}`;
  };
  for (const b of bends) {
    if (!Number.isInteger(b?.i) || b.i < 1 || b.i >= points.length - 1 || !finitePoint(b.v) || !finitePoint(b.u1) || !finitePoint(b.u2)) continue;
    const before = points[b.i - 1];
    const after = points[b.i + 1];
    if (!finitePoint(before) || !finitePoint(after)) continue;
    const incoming = Math.hypot(b.v.x - before.x, b.v.y - before.y);
    const outgoing = Math.hypot(after.x - b.v.x, after.y - b.v.y);
    if (Math.min(incoming, outgoing) < Math.max(4, 60 * pixelsPerMm)) continue;
    let start;
    let end;
    if (b.radius || (finitePoint(b.st) && finitePoint(b.en))) {
      if (!finitePoint(b.st) || !finitePoint(b.en)) continue;
      start = b.st;
      end = b.en;
    } else {
      const inset = Math.min(widthPx / 2, incoming / 3, outgoing / 3);
      start = { x: b.v.x - b.u1.x * inset, y: b.v.y - b.u1.y * inset };
      end = { x: b.v.x + b.u2.x * inset, y: b.v.y + b.u2.y * inset };
    }
    const a = line(start, b.u1);
    const z = line(end, b.u2);
    if (a && z) strokes.push(a, z);
  }
  return strokes;
}

// Split actual straight centreline lengths once; the SVG and cut tally use the
// same boundaries. Keep short offcuts rather than rounding them away.
export function stockSections(g, mm, sheetLen) {
  if (!(mm > 0) || !Number.isFinite(g.from) || !Number.isFinite(g.to)) return [];
  const stock = sheetStockLengthMm(sheetLen);
  const length = (g.to - g.from) / mm;
  if (length <= 1e-6 || !Number.isFinite(length)) return [];
  const parts = [];
  for (let start = 0; start < length - 1e-6; start += stock) {
    const end = Math.min(length, start + stock);
    parts.push({ from: g.from + start * mm, to: g.from + end * mm, lenMm: Math.min(stock, Math.max(1, Math.round(end - start))), full: end - start >= stock - 1e-6 });
  }
  return parts;
}
