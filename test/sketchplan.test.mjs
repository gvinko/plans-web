import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeImage, homography, applyH, findPaper, warpImage, inkMask, gridPitch, detectWalls, findRooms,
  analyseSketch, toSketchItems, fitInWorld, scaleFromGrid, cleanImage, rotateImage90, shrinkImage,
} from '../src/lib/sketchPlan.js';

// ---- a synthetic "hand-drawn" sheet ----
function px(img, x, y, r, g, b) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
}
function grid(img, pitch, off = 7) {
  for (let y = 0; y < img.h; y += 1) for (let x = 0; x < img.w; x += 1) if ((x - off) % pitch === 0 || (y - off) % pitch === 0) px(img, x, y, 176, 196, 222);
}
// a pencil line: 3 px thick, wobbling a couple of pixels like a hand would
function pencil(img, x1, y1, x2, y2, wobble = 2) {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  const nx = -(y2 - y1) / n; const ny = (x2 - x1) / n;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n; const wv = wobble * Math.sin(i / 23);
    for (let d = -1; d <= 1; d += 1) px(img, x1 + (x2 - x1) * t + nx * (wv + d), y1 + (y2 - y1) * t + ny * (wv + d), 70, 70, 76);
  }
}
function circle(img, cx, cy, r) { for (let a = 0; a < 6.3; a += 0.02) for (let d = 0; d < 2; d += 1) px(img, cx + (r + d) * Math.cos(a), cy + (r + d) * Math.sin(a), 60, 60, 66); }
function scribble(img, x, y) { for (let i = 0; i < 4; i += 1) { pencil(img, x + i * 9, y, x + i * 9 + 6, y + 18, 0); pencil(img, x + i * 9, y + 18, x + i * 9 + 6, y, 0); } }
function shadow(img, k = 0.55) { for (let y = 0; y < img.h; y += 1) for (let x = 0; x < img.w; x += 1) if (x + y < img.w * 0.9) { const i = (y * img.w + x) * 4; img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k * 1.08; } }

// Two rooms side by side: outer 400 x 300 box with a partition, on 20 px graph paper.
const TRUE_WALLS = [
  ['h', 100, 100, 500, 100], ['h', 100, 400, 500, 400], ['v', 100, 100, 100, 400], ['v', 500, 100, 500, 400], ['v', 300, 100, 300, 400],
];
function sheet({ withGrid = true, withShadow = false, extras = true } = {}) {
  const img = makeImage(600, 800, 244);
  if (withGrid) grid(img, 20);
  for (const [, x1, y1, x2, y2] of TRUE_WALLS) pencil(img, x1, y1, x2, y2);
  if (extras) { circle(img, 200, 250, 9); scribble(img, 370, 230); scribble(img, 250, 600); }
  if (withShadow) shadow(img);
  return img;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function matchWalls(found) {
  return TRUE_WALLS.map(([o, x1, y1, x2, y2]) => found.find((f) => f.o === o && near(f.x1, x1, 8) && near(f.y1, y1, 8) && near(f.x2, x2, 8) && near(f.y2, y2, 8)));
}

test('homography maps the four corners and round-trips', () => {
  const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
  const to = [{ x: 30, y: 40 }, { x: 420, y: 70 }, { x: 460, y: 700 }, { x: 10, y: 660 }];
  const H = homography(from, to);
  from.forEach((p, i) => { const q = applyH(H, p.x, p.y); assert.ok(near(q.x, to[i].x, 1e-6) && near(q.y, to[i].y, 1e-6)); });
  const back = homography(to, from);
  const q = applyH(back, ...Object.values(applyH(H, 50, 100)));
  assert.ok(near(q.x, 50, 1e-6) && near(q.y, 100, 1e-6));
});

test('walls, rooms and graph squares are found on a clean sheet', () => {
  const res = analyseSketch(sheet());
  const main = res.walls.filter((w) => !w.stray);
  assert.equal(matchWalls(main).filter(Boolean).length, 5, 'all five drawn walls found');
  assert.equal(main.length, 5, 'no invented walls');
  assert.equal(res.rooms.length, 2);
  assert.ok(res.rooms.every((r) => !r.est && near(r.y2 - r.y1, 300, 10) && near(r.x2 - r.x1, 200, 10)));
  assert.ok(near(res.grid.pitch, 20, 0.5), `pitch ${res.grid?.pitch}`);
  assert.equal(res.gaps.length, 0);
});

test('the same sheet half in shadow gives the same walls', () => {
  const res = analyseSketch(sheet({ withShadow: true }));
  const main = res.walls.filter((w) => !w.stray);
  assert.equal(matchWalls(main).filter(Boolean).length, 5);
  assert.equal(main.length, 5);
  assert.equal(res.rooms.length, 2);
});

test('graph lines are not ink; plain paper gives no grid and a scale warning', () => {
  const g = sheet({ extras: false });
  const mask = inkMask(g);
  let onGridOnly = 0;
  for (let y = 500; y < 780; y += 1) for (let x = 20; x < 580; x += 1) onGridOnly += mask[y * g.w + x];
  assert.equal(onGridOnly, 0, 'nothing but graph lines down there');
  const plain = analyseSketch(sheet({ withGrid: false }));
  assert.equal(plain.grid, null);
  assert.ok(plain.warnings.some((w) => /scale/i.test(w)));
  assert.equal(plain.walls.filter((w) => !w.stray).length, 5);
});

test('labels, numbers and circles are kept as notes, never as walls or rooms', () => {
  const res = analyseSketch(sheet());
  assert.ok(res.notes.some((n) => n.kind === 'circle' && near(n.x + n.w / 2, 200, 6) && near(n.y + n.h / 2, 250, 6)));
  assert.ok(res.notes.some((n) => n.kind === 'mark' && !n.outside && near(n.x, 370, 8)));
  assert.ok(res.notes.some((n) => n.outside && near(n.y, 600, 8)), 'a note outside the building is still kept');
});

test('a photographed sheet (angled, on a timber table) is found and squared up', () => {
  const flatSheet = sheet({ extras: false });
  const quad = [{ x: 150, y: 90 }, { x: 760, y: 140 }, { x: 800, y: 980 }, { x: 90, y: 930 }];
  const photo = makeImage(900, 1100);
  const H = homography(quad, [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 800 }, { x: 0, y: 800 }]);
  for (let y = 0; y < photo.h; y += 1) for (let x = 0; x < photo.w; x += 1) {
    const s = applyH(H, x, y); const o = (y * photo.w + x) * 4;
    if (s.x >= 0 && s.x < 600 && s.y >= 0 && s.y < 800) { const i = (Math.floor(s.y) * 600 + Math.floor(s.x)) * 4; photo.data[o] = flatSheet.data[i]; photo.data[o + 1] = flatSheet.data[i + 1]; photo.data[o + 2] = flatSheet.data[i + 2]; } else { photo.data[o] = 190; photo.data[o + 1] = 140; photo.data[o + 2] = 85; }
  }
  const paper = findPaper(photo);
  assert.ok(paper.found);
  paper.quad.forEach((q, i) => assert.ok(Math.hypot(q.x - quad[i].x, q.y - quad[i].y) < 25, `corner ${i} off by ${Math.hypot(q.x - quad[i].x, q.y - quad[i].y).toFixed(1)}`));
  const flatAgain = warpImage(photo, paper.quad, 800);
  const res = analyseSketch(flatAgain);
  const main = res.walls.filter((w) => !w.stray);
  assert.equal(main.length, 5);
  assert.equal(res.rooms.length, 2);
  // squared up: every wall is exactly level or upright
  assert.ok(main.every((w) => (w.o === 'h' ? w.y1 === w.y2 : w.x1 === w.x2)));
});

test('a photo with no visible page edge is reported, not guessed', () => {
  const paper = findPaper(sheet());
  assert.equal(paper.found, false);
  assert.deepEqual(paper.quad[2], { x: 600, y: 800 });
});

test('a wall that stops short is flagged, and an L-shaped room is marked as an estimate', () => {
  const img = makeImage(600, 800, 244);
  // L shape: 400 x 300 with a 200 x 150 bite out of the top right
  [[100, 100, 300, 100], [300, 100, 300, 250], [300, 250, 500, 250], [500, 250, 500, 400], [100, 400, 500, 400], [100, 100, 100, 400]].forEach((w) => pencil(img, ...w));
  pencil(img, 200, 400, 200, 300); // a stub wall that ends in the middle of the room
  const res = analyseSketch(img);
  assert.equal(res.rooms.length, 1);
  assert.equal(res.rooms[0].est, true);
  assert.equal(res.gaps.length, 1);
  assert.ok(near(res.gaps[0].x, 200, 8) && near(res.gaps[0].y, 300, 8));
  const stub = res.walls.find((w) => w.flags.includes('open-end'));
  assert.ok(stub && stub.conf < 0.9);
  assert.ok(res.warnings.some((w) => /do not meet/.test(w)));
});

test('hand-over: world coordinates, estimate flags, and numbers only mean what the user says', () => {
  const res = analyseSketch(sheet());
  let n = 0;
  const { items, fit } = toSketchItems(res, { worldW: 1400, worldH: 1000, newId: () => `id${n += 1}` });
  assert.deepEqual(fit, fitInWorld(600, 800, 1400, 1000));
  const walls = items.filter((i) => i.kind === 'wall'); const rooms = items.filter((i) => i.kind === 'room');
  assert.equal(walls.length, 5); assert.equal(rooms.length, 2);
  assert.ok(items.every((i) => i.est === true), 'everything detected starts as an estimate');
  assert.equal(items.filter((i) => i.kind === 'text').length, 0, 'unread notes add nothing');
  assert.ok(rooms.every((r) => r.name === '' && r.zone === undefined && r.hl === undefined), 'no names, zones or loads invented');
  const left = walls.find((w) => w.x1 === w.x2 && near(w.x1, fit.dx + 100 * fit.k, 8 * fit.k));
  assert.ok(left && near(left.y2 - left.y1, 300 * fit.k, 12));
  // the user reads "7" as a zone, "Bed 2" as a room name, and "18kW" as a plain note
  const note = res.notes.find((x) => !x.outside && x.kind === 'mark'); const circ = res.notes.find((x) => x.kind === 'circle'); const out = res.notes.find((x) => x.outside);
  const labelled = toSketchItems(res, { worldW: 1400, worldH: 1000, newId: () => `id${n += 1}`, labels: [{ ...note, text: '7', meaning: 'zone' }, { ...circ, text: 'Bed 2', meaning: 'room' }, { ...out, text: '18kW', meaning: 'note' }] }).items;
  const r = labelled.filter((i) => i.kind === 'room');
  assert.deepEqual(r.map((x) => x.zone).filter(Boolean), ['Zone 7']);
  assert.deepEqual(r.map((x) => x.name).filter(Boolean), ['Bed 2']);
  assert.deepEqual(labelled.filter((i) => i.kind === 'text').map((t) => t.text), ['18kW']);
  // walls switched off in review are left out; rooms can be left out
  res.walls[0].off = true;
  const fewer = toSketchItems(res, { worldW: 1400, worldH: 1000, newId: () => 'x', includeRooms: false }).items;
  assert.equal(fewer.length, 4);
});

test('scale comes only from what the user says a square is worth', () => {
  const res = analyseSketch(sheet());
  const fit = fitInWorld(res.w, res.h, 1400, 1000);
  assert.equal(scaleFromGrid(res.grid, '', fit), null);
  assert.equal(scaleFromGrid(null, 500, fit), null);
  const sc = scaleFromGrid(res.grid, 500, fit); // one square = 500 mm
  // the 400 px outer wall is 20 squares = 10 m
  assert.ok(near((400 * fit.k) / sc.pxPerM, 10, 0.25));
  assert.equal(sc.grid.squareMm, 500);
});

test('helpers: clean copy hides graph lines, rotate and shrink keep the picture', () => {
  const s = sheet({ extras: false });
  const c = cleanImage(s);
  assert.equal(c.data[(600 * s.w + 47) * 4], 255, 'graph line at x=47 is white in the clean copy');
  assert.ok(c.data[(250 * s.w + 100) * 4] < 80, 'pencil stays dark');
  assert.equal(s.data[(600 * s.w + 47) * 4], 176, 'the source image is untouched');
  const r = rotateImage90(s);
  assert.deepEqual([r.w, r.h], [800, 600]);
  assert.equal(shrinkImage(s, 400).h, 400);
  assert.equal(shrinkImage(s, 2000), s);
});
