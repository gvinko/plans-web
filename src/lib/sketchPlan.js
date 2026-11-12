// Sketch to Plan: turn a photo of a hand-drawn floor plan into clean wall / room geometry.
// Pure functions on plain pixel arrays (no DOM, no network, no AI) so they run the same in
// the browser and in `node --test`. An image is { w, h, data } with RGBA bytes.
//
// Stages (each usable on its own):
//   findPaper   -> the four corners of the sheet in the photo
//   warpImage   -> perspective-corrected, upright copy of the sheet
//   cleanImage  -> shadows flattened, graph lines optionally removed (for the underlay)
//   inkMask     -> 1 where there is pencil / pen, 0 elsewhere
//   gridPitch   -> size of one graph-paper square in pixels (never a real-world size)
//   detectWalls -> straight, squared-up, joined wall segments with confidence
//   findRooms   -> enclosed rectangles between walls
//   findNotes   -> everything else that was drawn (labels, numbers, circles) for manual review
//   analyseSketch runs the lot; toSketchItems converts the result to PlanDroid sketch items.

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- small image helpers ----------

export function makeImage(w, h, fill = 255) {
  const data = new Uint8ClampedArray(w * h * 4).fill(fill);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { w, h, data };
}

// Area-average shrink so the long edge is at most maxEdge (never enlarges).
export function shrinkImage(img, maxEdge) {
  const k = Math.max(img.w, img.h) / maxEdge;
  if (k <= 1) return img;
  const w = Math.max(1, Math.round(img.w / k));
  const h = Math.max(1, Math.round(img.h / k));
  const out = makeImage(w, h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor(y * k);
    const y1 = Math.min(img.h, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor(x * k);
      const x1 = Math.min(img.w, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * img.w + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n += 1;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n;
    }
  }
  return out;
}

export function rotateImage90(img) {
  const out = makeImage(img.h, img.w);
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      const i = (y * img.w + x) * 4;
      const o = (x * out.w + (img.h - 1 - y)) * 4;
      out.data[o] = img.data[i]; out.data[o + 1] = img.data[i + 1]; out.data[o + 2] = img.data[i + 2];
    }
  }
  return out;
}

// Connected groups of set pixels (8-way). Returns [{ n, x0, y0, x1, y1, px: Int32Array of indexes }].
export function components(mask, w, h, keepPx = true) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!mask[s] || seen[s]) continue;
    let top = 0; stack[top++] = s; seen[s] = 1;
    let n = 0; let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
    const px = keepPx ? [] : null;
    while (top) {
      const p = stack[--top];
      const x = p % w; const y = (p - x) / w;
      n += 1; if (px) px.push(p);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
        }
      }
    }
    out.push({ n, x0, y0, x1, y1, px });
  }
  return out;
}

// ---------- 1. find the sheet of paper ----------

// Paper is near-white or (in shadow) bluish-grey; timber, carpet and skin are warm, so
// "red is not much stronger than blue, and it isn't dark" picks the sheet out even across a shadow.
export function findPaper(img) {
  const small = shrinkImage(img, 240);
  const { w, h, data } = small;
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; i += 4, p += 1) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const mx = Math.max(r, g, b);
    if (mx > 70 && r - b < 0.25 * mx) mask[p] = 1;
  }
  const full = { quad: [{ x: 0, y: 0 }, { x: img.w, y: 0 }, { x: img.w, y: img.h }, { x: 0, y: img.h }], found: false, confidence: 0 };
  const comps = components(mask, w, h).sort((a, b) => b.n - a.n);
  const c = comps[0];
  if (!c || c.n < 0.15 * w * h) return full;
  let tl = null; let tr = null; let br = null; let bl = null;
  let sMin = Infinity; let sMax = -Infinity; let dMin = Infinity; let dMax = -Infinity;
  for (const p of c.px) {
    const x = p % w; const y = (p - x) / w;
    if (x + y < sMin) { sMin = x + y; tl = { x, y }; }
    if (x + y > sMax) { sMax = x + y; br = { x, y }; }
    if (x - y > dMax) { dMax = x - y; tr = { x, y }; }
    if (x - y < dMin) { dMin = x - y; bl = { x, y }; }
  }
  const quadS = [tl, tr, br, bl];
  let area = 0;
  for (let i = 0; i < 4; i += 1) { const a = quadS[i]; const b = quadS[(i + 1) % 4]; area += a.x * b.y - b.x * a.y; }
  area = Math.abs(area) / 2;
  const fill = area ? c.n / area : 0;
  // A sheet that fills the whole frame, or a pale table, gives nothing to square up against.
  const touchesAll = c.x0 <= 1 && c.y0 <= 1 && c.x1 >= w - 2 && c.y1 >= h - 2;
  if (fill < 0.8 || fill > 1.2 || touchesAll) return { ...full, confidence: touchesAll ? 0 : clampN(fill, 0, 1) * 0.5 };
  const k = img.w / w;
  const cx = (tl.x + tr.x + br.x + bl.x) / 4; const cy = (tl.y + tr.y + br.y + bl.y) / 4;
  const quad = quadS.map((q) => ({ x: (q.x + (cx - q.x) * 0.015 + 0.5) * k, y: (q.y + (cy - q.y) * 0.015 + 0.5) * k })); // pull in a touch, off the table edge
  return { quad, found: true, confidence: clampN(1 - Math.abs(1 - fill) * 2, 0, 1) };
}

// ---------- 2. perspective correction ----------

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// 3x3 matrix (9 numbers) taking each `from` point to its `to` point (four pairs).
export function homography(from, to) {
  const A = []; const b = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i]; const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const s = solve(A, b);
  return s ? [...s, 1] : null;
}

export function applyH(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Flatten the quad [tl, tr, br, bl] of `img` into an upright image, long edge <= maxEdge.
export function warpImage(img, quad, maxEdge = 1200) {
  const wSrc = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const hSrc = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const k = Math.min(1, maxEdge / Math.max(wSrc, hSrc));
  const w = Math.max(8, Math.round(wSrc * k)); const h = Math.max(8, Math.round(hSrc * k));
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], quad);
  const out = makeImage(w, h);
  if (!H) return out;
  const { data } = img;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const s = applyH(H, x + 0.5, y + 0.5);
      const fx = clampN(s.x - 0.5, 0, img.w - 1); const fy = clampN(s.y - 0.5, 0, img.h - 1);
      const x0 = Math.floor(fx); const y0 = Math.floor(fy);
      const x1 = Math.min(img.w - 1, x0 + 1); const y1 = Math.min(img.h - 1, y0 + 1);
      const ax = fx - x0; const ay = fy - y0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const p = data[(y0 * img.w + x0) * 4 + c] * (1 - ax) + data[(y0 * img.w + x1) * 4 + c] * ax;
        const q = data[(y1 * img.w + x0) * 4 + c] * (1 - ax) + data[(y1 * img.w + x1) * 4 + c] * ax;
        out.data[o + c] = p * (1 - ay) + q * ay;
      }
    }
  }
  return out;
}

// ---------- 3. lighting, graph lines and ink ----------

// How bright the bare paper is around each pixel, for one colour channel: the brightest value
// within a few pixels (lines are thinner than that), lightly smoothed. Dividing by it removes
// shadows, uneven light and any colour cast, without a dark halo along a shadow's edge.
function paperLevel(data, ch, w, h) {
  const R = 6;
  const a = new Float32Array(w * h); const b = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let m = 0;
    for (let d = -R; d <= R; d += 1) { const xx = x + d; if (xx >= 0 && xx < w) { const v = data[(y * w + xx) * 4 + ch]; if (v > m) m = v; } }
    a[y * w + x] = m;
  }
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let m = 0;
    for (let d = -R; d <= R; d += 1) { const yy = y + d; if (yy >= 0 && yy < h && a[yy * w + x] > m) m = a[yy * w + x]; }
    b[y * w + x] = m;
  }
  // 5x5 box blur
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let s = 0; let n = 0;
    for (let d = -2; d <= 2; d += 1) { const xx = x + d; if (xx >= 0 && xx < w) { s += b[y * w + xx]; n += 1; } }
    a[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let s = 0; let n = 0;
    for (let d = -2; d <= 2; d += 1) { const yy = y + d; if (yy >= 0 && yy < h) { s += a[yy * w + x]; n += 1; } }
    b[y * w + x] = Math.max(1, s / n);
  }
  return b;
}

// Each channel as a share of the local bare-paper level: { lo, hi } per pixel, 1 = paper, 0 = black.
// Grey pencil and black pen pull every channel down (hi is low). A coloured graph line (blue,
// green, orange...) stays bright in its own colour (hi stays high, lo drops) - that is how
// graph lines are told from the drawing, in sun or in shadow.
function levels(img) {
  if (img._lv) return img._lv;
  const { w, h, data } = img;
  const lo = new Float32Array(w * h).fill(1); const hi = new Float32Array(w * h);
  for (let ch = 0; ch < 3; ch += 1) {
    const lvl = paperLevel(data, ch, w, h);
    for (let p = 0; p < w * h; p += 1) {
      const v = Math.min(1, data[p * 4 + ch] / lvl[p]);
      if (v < lo[p]) lo[p] = v;
      if (v > hi[p]) hi[p] = v;
    }
  }
  Object.defineProperty(img, '_lv', { value: { lo, hi }, enumerable: false });
  return img._lv;
}

function flat(img, suppressGraph) {
  const { lo, hi } = levels(img);
  if (suppressGraph) return hi;
  const v = new Float32Array(lo.length);
  for (let p = 0; p < v.length; p += 1) v[p] = (lo[p] + hi[p]) / 2;
  return v;
}

// A tidy black-on-white copy for the underlay. The original photo is never changed.
export function cleanImage(img, { suppressGraph = true, contrast = 1 } = {}) {
  const v = flat(img, suppressGraph);
  const out = makeImage(img.w, img.h);
  const level = suppressGraph ? graphLevel(v, img.w, img.h, 0.74) : null;
  for (let y = 0; y < img.h; y += 1) for (let x = 0; x < img.w; x += 1) {
    const p = y * img.w + x;
    // with graph lines hidden: black at the ink level and below, white a little above it
    const lo = level ? level(x, y) - 0.2 : 0.45; const hi = level ? level(x, y) + 0.04 : 0.92;
    let t = clampN((v[p] - lo) / (hi - lo), 0, 1);
    t = clampN(0.5 + (t - 0.5) * contrast, 0, 1);
    const g = Math.round(255 * t);
    out.data[p * 4] = g; out.data[p * 4 + 1] = g; out.data[p * 4 + 2] = g;
  }
  return out;
}

// Printed graph lines are often nearly grey, so colour alone doesn't remove them. They are,
// though, the commonest "darkish" thing on the sheet: roughly one pixel in six. So in each
// patch of the page the 10th-percentile darkness sits inside the graph lines, and anything
// clearly darker than that is drawing. On plain paper the level stays at the fixed threshold.
function graphLevel(v, w, h, base) {
  const T = 96;
  const tw = Math.ceil(w / T); const th = Math.ceil(h / T);
  const lvl = new Float32Array(tw * th);
  const hist = new Uint32Array(101);
  for (let ty = 0; ty < th; ty += 1) for (let tx = 0; tx < tw; tx += 1) {
    hist.fill(0); let n = 0;
    for (let y = ty * T; y < Math.min(h, ty * T + T); y += 1) for (let x = tx * T; x < Math.min(w, tx * T + T); x += 1) { hist[Math.round(v[y * w + x] * 100)] += 1; n += 1; }
    let acc = 0; let q = 100;
    for (let i = 0; i <= 100; i += 1) { acc += hist[i]; if (acc >= 0.1 * n) { q = i; break; } }
    lvl[ty * tw + tx] = clampN(q / 100 - 0.07, 0.55, base);
  }
  return (x, y) => {
    const gx = clampN((x + 0.5) / T - 0.5, 0, tw - 1); const gy = clampN((y + 0.5) / T - 0.5, 0, th - 1);
    const x0 = Math.floor(gx); const y0 = Math.floor(gy); const x1 = Math.min(tw - 1, x0 + 1); const y1 = Math.min(th - 1, y0 + 1);
    const ax = gx - x0; const ay = gy - y0;
    return (lvl[y0 * tw + x0] * (1 - ax) + lvl[y0 * tw + x1] * ax) * (1 - ay) + (lvl[y1 * tw + x0] * (1 - ax) + lvl[y1 * tw + x1] * ax) * ay;
  };
}

export function inkMask(img, { suppressGraph = true, threshold = 0.74 } = {}) {
  const { w, h } = img;
  const v = flat(img, suppressGraph);
  const mask = new Uint8Array(w * h);
  const level = suppressGraph ? graphLevel(v, w, h, threshold) : null;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const p = y * w + x;
    if (v[p] < (level ? level(x, y) : threshold)) mask[p] = 1;
  }
  // drop specks
  for (const c of components(mask, w, h)) if (c.n < 5) for (const p of c.px) mask[p] = 0;
  return mask;
}

// Size of one graph-paper square in pixels, from the coloured grid lines. null when there's no clear grid.
export function gridPitch(img) {
  const { w, h } = img;
  const { lo, hi } = levels(img);
  const col = new Float32Array(w); const row = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (hi[p] > 0.8 && hi[p] - lo[p] > 0.07) { col[x] += 1; row[y] += 1; }
    }
  }
  const period = (sig) => {
    const n = sig.length;
    let mean = 0; for (let i = 0; i < n; i += 1) mean += sig[i]; mean /= n;
    // remove slow drift (shadows tint whole areas) so only the line-to-line ripple is left
    const hp = new Float32Array(n);
    const R = 30;
    let acc = 0; let cnt = 0;
    for (let i = 0; i < Math.min(n, R); i += 1) { acc += sig[i]; cnt += 1; }
    for (let i = 0; i < n; i += 1) {
      if (i + R < n) { acc += sig[i + R]; cnt += 1; }
      if (i - R - 1 >= 0) { acc -= sig[i - R - 1]; cnt -= 1; }
      hp[i] = sig[i] - acc / cnt;
    }
    let e0 = 0; for (let i = 0; i < n; i += 1) e0 += hp[i] * hp[i];
    if (!e0 || mean < 0.01 * n) return null;
    const ac = [];
    const maxLag = Math.min(80, Math.floor(n / 4));
    for (let lag = 0; lag <= maxLag; lag += 1) {
      let s = 0; for (let i = 0; i + lag < n; i += 1) s += hp[i] * hp[i + lag];
      ac.push(s / e0);
    }
    let best = 0; let bestV = 0;
    for (let lag = 5; lag < maxLag; lag += 1) {
      if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > bestV * 1.15) { best = lag; bestV = ac[lag]; }
    }
    if (!best || bestV < 0.25) return null;
    // refine with the average spacing over several periods
    let lagN = best; let k = 1;
    for (let m = 2; m <= 6 && best * m + 2 < maxLag; m += 1) {
      let pk = best * m; let pv = -1;
      for (let d = -2; d <= 2; d += 1) if (ac[Math.round(lagN / k * m) + d] > pv) { pv = ac[Math.round(lagN / k * m) + d]; pk = Math.round(lagN / k * m) + d; }
      if (pv < 0.15) break;
      lagN = pk; k = m;
    }
    return { pitch: lagN / k, strength: bestV };
  };
  const px = period(col); const py = period(row);
  if (!px || !py) return null;
  if (Math.abs(px.pitch - py.pitch) > 0.15 * Math.max(px.pitch, py.pitch)) return null;
  return { pitch: (px.pitch + py.pitch) / 2, strength: Math.min(px.strength, py.strength) };
}

// ---------- 4. walls ----------

// Long, nearly-level strokes in `mask`. Returns raw pieces { c, a, b, slope, thick } with the
// line at y = c (+ slope) running from x = a to x = b. Call on the transposed mask for uprights.
function longRuns(mask, w, h, minLen, wobble, gap, dens, maxThick) {
  // thicken up/down so a wobbly or slightly sloping hand line still gives long level runs
  const fat = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      for (let d = -wobble; d <= wobble; d += 1) { const yy = y + d; if (yy >= 0 && yy < h) fat[yy * w + x] = 1; }
    }
  }
  const keep = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      if (!fat[y * w + x]) { x += 1; continue; }
      let end = x; let ink = 0; let g = 0; let xx = x;
      while (xx < w && g <= gap) {
        if (fat[y * w + xx]) { end = xx; ink += 1; g = 0; } else g += 1;
        xx += 1;
      }
      const len = end - x + 1;
      if (len >= minLen && ink >= dens * len) for (let q = x; q <= end; q += 1) keep[y * w + q] = 1;
      x = end + 1;
    }
  }
  const out = [];
  for (const c of components(keep, w, h)) {
    const len = c.x1 - c.x0 + 1;
    if (len < minLen) continue;
    // least-squares line y = m x + k through the group
    let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
    for (const p of c.px) { const x = p % w; const y = (p - x) / w; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const n = c.n; const den = n * sxx - sx * sx;
    const m = den ? (n * sxy - sx * sy) / den : 0;
    const k = (sy - m * sx) / n;
    const mid = (c.x0 + c.x1) / 2;
    const thick = Math.max(1, c.n / len - 2 * wobble);
    if (thick > maxThick) continue; // a block of writing or hatching, not a line
    out.push({ c: m * mid + k, a: c.x0, b: c.x1, slope: m, thick });
  }
  return out;
}

function transpose(mask, w, h) {
  const t = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) t[x * h + y] = mask[y * w + x];
  return t;
}

// Merge strokes that are the same wall drawn twice or in pieces.
function mergeSame(list, sideTol, gapTol) {
  let segs = list.map((s) => ({ ...s, wt: s.b - s.a }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const p = segs[i]; const q = segs[j];
        if (Math.abs(p.c - q.c) > sideTol) continue;
        if (Math.min(p.b, q.b) - Math.max(p.a, q.a) < -gapTol) continue;
        const wt = p.wt + q.wt;
        segs[i] = { c: (p.c * p.wt + q.c * q.wt) / wt, a: Math.min(p.a, q.a), b: Math.max(p.b, q.b), wt, thick: Math.max(p.thick, q.thick) };
        segs.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return segs;
}

// Share of the wall's length that actually has ink under it.
function coverage(mask, w, h, s, horiz, band) {
  let hit = 0; let n = 0;
  for (let t = Math.round(s.a); t <= Math.round(s.b); t += 1) {
    n += 1;
    for (let d = -band; d <= band; d += 1) {
      const x = horiz ? t : Math.round(s.c) + d; const y = horiz ? Math.round(s.c) + d : t;
      if (x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x]) { hit += 1; break; }
    }
  }
  return n ? hit / n : 0;
}

export function detectWalls(mask, w, h, opts = {}) {
  const big = Math.max(w, h);
  const minLen = opts.minLen ?? Math.round(big * 0.04);
  const sideTol = opts.sideTol ?? Math.max(6, Math.round(big * 0.008));
  const joinTol = opts.joinTol ?? Math.max(10, Math.round(big * 0.02));
  const wobble = 2;
  const maxSlope = 0.13; // about 7 degrees off square
  const gap = opts.gap ?? 7; const dens = opts.dens ?? 0.7; // pencil lines break up; a wall is a mostly-inked run
  const maxThick = opts.maxThick ?? Math.max(8, big * 0.008);
  const raw = { h: longRuns(mask, w, h, minLen, wobble, gap, dens, maxThick), v: longRuns(transpose(mask, w, h), h, w, minLen, wobble, gap, dens, maxThick) };
  const H = mergeSame(raw.h.filter((s) => Math.abs(s.slope) <= maxSlope), sideTol, joinTol).map((s) => ({ ...s, o: 'h' }));
  const V = mergeSame(raw.v.filter((s) => Math.abs(s.slope) <= maxSlope), sideTol, joinTol).map((s) => ({ ...s, o: 'v' }));

  // Join ends to the wall they run into (or just short of / just past).
  const endFree = (s, which) => { s[which === 'a' ? 'freeA' : 'freeB'] = true; };
  const join = (list, others) => {
    for (const s of list) {
      for (const which of ['a', 'b']) {
        const t = s[which];
        let best = null; let bd = joinTol + 1;
        for (const o of others) {
          const d = Math.abs(o.c - t);
          if (d < bd && s.c >= o.a - joinTol && s.c <= o.b + joinTol) { bd = d; best = o; }
        }
        if (best) {
          s[which] = best.c;
          if (s.c < best.a) best.a = s.c;
          if (s.c > best.b) best.b = s.c;
        } else endFree(s, which);
      }
    }
  };
  // Two passes so corners made by extending one wall are seen by the other.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const s of [...H, ...V]) { s.freeA = false; s.freeB = false; }
    join(H, V); join(V, H);
  }

  const all = [...H, ...V].filter((s) => s.b - s.a >= minLen * 0.6);
  // Group walls that touch; the biggest group is the building, the rest are strays (underlines, title boxes).
  const touch = (p, q) => {
    if (p.o === q.o) return Math.abs(p.c - q.c) <= 1 && Math.min(p.b, q.b) - Math.max(p.a, q.a) >= -1;
    return q.c >= p.a - 1 && q.c <= p.b + 1 && p.c >= q.a - 1 && p.c <= q.b + 1;
  };
  const grp = all.map((_, i) => i);
  const find = (i) => { while (grp[i] !== i) { grp[i] = grp[grp[i]]; i = grp[i]; } return i; };
  for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) if (touch(all[i], all[j])) grp[find(i)] = find(j);
  const total = {};
  all.forEach((s, i) => { const g = find(i); total[g] = (total[g] || 0) + (s.b - s.a); });
  const main = Object.keys(total).sort((x, y) => total[y] - total[x])[0];

  const walls = all.map((s, i) => ({ s, i })).filter(({ s, i }) => String(find(i)) === String(main) || s.b - s.a >= 2 * minLen).map(({ s, i }) => { // short loose strokes are writing, not walls
    const horiz = s.o === 'h';
    const cov = coverage(mask, w, h, s, horiz, Math.ceil(sideTol));
    const len = s.b - s.a;
    const flags = [];
    if (s.freeA || s.freeB) flags.push('open-end');
    if (cov < 0.7) flags.push('faint');
    if (len < minLen * 1.5) flags.push('short');
    const stray = String(find(i)) !== String(main);
    if (stray) flags.push('stray');
    let conf = cov;
    if (s.freeA || s.freeB) conf -= 0.15;
    if (len < minLen * 1.5) conf -= 0.15;
    if (stray) conf -= 0.4;
    return {
      o: s.o, off: stray, // strays are kept for review but left out unless the user turns them on
      x1: horiz ? s.a : s.c, y1: horiz ? s.c : s.a, x2: horiz ? s.b : s.c, y2: horiz ? s.c : s.b,
      conf: Number(clampN(conf, 0, 1).toFixed(2)), flags, stray,
      openEnds: [s.freeA && (horiz ? { x: s.a, y: s.c } : { x: s.c, y: s.a }), s.freeB && (horiz ? { x: s.b, y: s.c } : { x: s.c, y: s.b })].filter(Boolean),
    };
  });
  const gaps = walls.filter((x) => !x.stray).flatMap((x) => x.openEnds);
  return { walls, gaps, minLen };
}

// ---------- 5. rooms ----------

// Enclosed areas between the (non-stray) walls, each given as its largest rectangle.
// `est` marks a room whose real outline is not a plain rectangle.
export function findRooms(walls, w, h, opts = {}) {
  const use = walls.filter((x) => !x.off);
  const minSide = opts.minSide ?? Math.max(w, h) * 0.035;
  const uniq = (arr) => { const s = [...arr].sort((a, b) => a - b); const o = []; for (const v of s) if (!o.length || v - o[o.length - 1] > 1) o.push(v); return o; };
  const xs = uniq([0, w, ...use.filter((s) => s.o === 'v').map((s) => s.x1)]);
  const ys = uniq([0, h, ...use.filter((s) => s.o === 'h').map((s) => s.y1)]);
  const nx = xs.length - 1; const ny = ys.length - 1;
  if (nx < 1 || ny < 1) return [];
  const covered = (lo, hi, a, b) => Math.min(hi, b) - Math.max(lo, a) >= 0.6 * (hi - lo);
  // wallR[j][i]: wall on the right edge of cell (i,j); wallB: on its bottom edge
  const wallR = (i, j) => use.some((s) => s.o === 'v' && Math.abs(s.x1 - xs[i + 1]) <= 1 && covered(ys[j], ys[j + 1], s.y1, s.y2));
  const wallB = (i, j) => use.some((s) => s.o === 'h' && Math.abs(s.y1 - ys[j + 1]) <= 1 && covered(xs[i], xs[i + 1], s.x1, s.x2));
  const id = new Int32Array(nx * ny).fill(-1);
  const regions = [];
  for (let s = 0; s < nx * ny; s += 1) {
    if (id[s] !== -1) continue;
    const r = { cells: [], outside: false };
    const st = [s]; id[s] = regions.length;
    while (st.length) {
      const p = st.pop(); const i = p % nx; const j = (p - i) / nx;
      r.cells.push([i, j]);
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) r.outside = true;
      const go = (ii, jj, blocked) => { if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || blocked) return; const q = jj * nx + ii; if (id[q] === -1) { id[q] = regions.length; st.push(q); } };
      go(i + 1, j, wallR(i, j)); go(i - 1, j, i > 0 && wallR(i - 1, j)); go(i, j + 1, wallB(i, j)); go(i, j - 1, j > 0 && wallB(i, j - 1));
    }
    regions.push(r);
  }
  const rooms = [];
  regions.forEach((r, ri) => {
    if (r.outside) return;
    let area = 0;
    for (const [i, j] of r.cells) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    let best = null;
    const is = [...new Set(r.cells.map((c) => c[0]))].sort((a, b) => a - b);
    const js = [...new Set(r.cells.map((c) => c[1]))].sort((a, b) => a - b);
    for (const i0 of is) for (const i1 of is) {
      if (i1 < i0) continue;
      for (const j0 of js) for (const j1 of js) {
        if (j1 < j0) continue;
        let ok = true;
        for (let i = i0; i <= i1 && ok; i += 1) for (let j = j0; j <= j1; j += 1) if (id[j * nx + i] !== ri) { ok = false; break; }
        if (!ok) continue;
        const a = (xs[i1 + 1] - xs[i0]) * (ys[j1 + 1] - ys[j0]);
        if (!best || a > best.a) best = { a, x1: xs[i0], y1: ys[j0], x2: xs[i1 + 1], y2: ys[j1 + 1] };
      }
    }
    if (!best || best.x2 - best.x1 < minSide || best.y2 - best.y1 < minSide) return;
    rooms.push({ x1: best.x1, y1: best.y1, x2: best.x2, y2: best.y2, est: best.a < 0.97 * area });
  });
  return rooms;
}

// ---------- 6. everything else that was drawn ----------

// Labels, numbers, circles and side notes: found and boxed, never read or given a meaning here.
export function findNotes(mask, w, h, walls, opts = {}) {
  const band = opts.band ?? Math.max(5, Math.round(Math.max(w, h) * 0.006));
  const m = Uint8Array.from(mask);
  for (const s of walls) {
    if (s.stray) continue; // a loose stroke may be writing: leave its ink to be boxed as a note too
    const x0 = Math.max(0, Math.floor(Math.min(s.x1, s.x2) - band)); const x1 = Math.min(w - 1, Math.ceil(Math.max(s.x1, s.x2) + band));
    const y0 = Math.max(0, Math.floor(Math.min(s.y1, s.y2) - band)); const y1 = Math.min(h - 1, Math.ceil(Math.max(s.y1, s.y2) + band));
    for (let y = y0; y <= y1; y += 1) m.fill(0, y * w + x0, y * w + x1 + 1);
  }
  // smear so the letters of one word become one blob
  const r = opts.smear ?? Math.max(4, Math.round(Math.max(w, h) * 0.007));
  const tmp = new Uint8Array(w * h); const fat = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (m[y * w + x]) for (let d = -r; d <= r; d += 1) { const xx = x + d; if (xx >= 0 && xx < w) tmp[y * w + xx] = 1; }
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (tmp[y * w + x]) for (let d = -r; d <= r; d += 1) { const yy = y + d; if (yy >= 0 && yy < h) fat[yy * w + x] = 1; }
  const main = walls.filter((s) => !s.stray);
  const bx0 = Math.min(...main.map((s) => Math.min(s.x1, s.x2))); const bx1 = Math.max(...main.map((s) => Math.max(s.x1, s.x2)));
  const by0 = Math.min(...main.map((s) => Math.min(s.y1, s.y2))); const by1 = Math.max(...main.map((s) => Math.max(s.y1, s.y2)));
  const notes = [];
  for (const c of components(fat, w, h)) {
    const x0 = c.x0 + r; const y0 = c.y0 + r; const x1 = c.x1 - r; const y1 = c.y1 - r;
    const bw = x1 - x0 + 1; const bh = y1 - y0 + 1;
    if (bw < 6 && bh < 6) continue;
    let ink = 0; let mid = 0;
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      if (!m[y * w + x]) continue;
      ink += 1;
      if (Math.abs(x - (x0 + x1) / 2) < bw * 0.2 && Math.abs(y - (y0 + y1) / 2) < bh * 0.2) mid += 1;
    }
    if (ink < 20 || ink < 0.04 * bw * bh) continue; // a few stray dots are not a note
    if (bw > 0.5 * w || bh > 0.5 * h) continue; // a shadow edge or the page border, not a note
    const round = bw / bh > 0.7 && bw / bh < 1.4 && bw < 0.05 * Math.max(w, h) && mid <= 0.04 * ink;
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    const outside = !main.length || cx < bx0 || cx > bx1 || cy < by0 || cy > by1;
    notes.push({ x: x0, y: y0, w: bw, h: bh, kind: round ? 'circle' : 'mark', outside });
  }
  return notes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 120);
}

// ---------- the whole pipeline on an already-flattened sheet ----------

export function analyseSketch(sheet, opts = {}) {
  const { w, h } = sheet;
  const suppressGraph = opts.suppressGraph !== false;
  const mask = inkMask(sheet, { suppressGraph, threshold: opts.threshold });
  const grid = gridPitch(sheet);
  const { walls, gaps, minLen } = detectWalls(mask, w, h, opts);
  walls.forEach((x, i) => { x.id = `w${i}`; });
  const rooms = findRooms(walls, w, h);
  const notes = findNotes(mask, w, h, walls);
  const main = walls.filter((x) => !x.stray);
  const warnings = [];
  if (main.length < 4) warnings.push('Very few walls were found. Check the page corners, or try a photo with darker lines and less shadow.');
  if (gaps.length) warnings.push(`${gaps.length} wall end${gaps.length === 1 ? '' : 's'} do not meet another wall — check for missing or unjoined walls.`);
  if (!grid) warnings.push('No graph-paper grid was found, so there is nothing to work a scale from. Set the scale from a known measurement.');
  if (!rooms.length && main.length >= 4) warnings.push('No fully closed rooms were found — walls with gaps (door openings) leave rooms open. Add room boxes by hand.');
  return { w, h, walls, rooms, notes, gaps, grid, minLen, warnings };
}

// ---------- hand-over to PlanDroid ----------

// Where an image shown "contain" inside the world rectangle sits, and its scale.
export function fitInWorld(w, h, worldW, worldH) {
  const k = Math.min(worldW / w, worldH / h);
  return { k, dx: (worldW - w * k) / 2, dy: (worldH - h * k) / 2 };
}

// squareMm: what the user says one graph square stands for on site (mm). Nothing is assumed.
export function scaleFromGrid(grid, squareMm, fit) {
  const mm = Number(squareMm);
  if (!grid || !(mm > 0)) return null;
  return { pxPerM: (grid.pitch * fit.k) / (mm / 1000), grid: { squareMm: mm } };
}

// Result -> PlanDroid sketch items. Walls and rooms carry `est: true` until the user verifies them.
// notes: only the ones the user typed something for; `meaning` is 'room' | 'zone' | 'note'.
export function toSketchItems(result, { worldW, worldH, newId, includeRooms = true, labels = [] }) {
  const fit = fitInWorld(result.w, result.h, worldW, worldH);
  const X = (x) => Number((fit.dx + x * fit.k).toFixed(1));
  const Y = (y) => Number((fit.dy + y * fit.k).toFixed(1));
  const items = [];
  for (const s of result.walls) {
    if (s.off) continue;
    items.push({ id: newId(), kind: 'wall', x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2), est: true, conf: s.conf });
  }
  const rooms = [];
  if (includeRooms) {
    for (const r of result.rooms) {
      const el = { id: newId(), kind: 'room', x1: X(r.x1), y1: Y(r.y1), x2: X(r.x2), y2: Y(r.y2), name: '', est: true };
      rooms.push(el); items.push(el);
    }
  }
  for (const l of labels) {
    const text = String(l.text || '').trim();
    if (!text) continue;
    const cx = X(l.x + l.w / 2); const cy = Y(l.y + l.h / 2);
    const room = rooms.find((r) => cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2);
    if (l.meaning === 'room' && room) room.name = text;
    else if (l.meaning === 'zone' && room) room.zone = /^\d+$/.test(text) ? `Zone ${text}` : text;
    else items.push({ id: newId(), kind: 'text', x1: cx, y1: cy, text });
  }
  return { items, fit };
}
