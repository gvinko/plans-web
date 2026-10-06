import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  addTracePoint,
  buildAsciiStl,
  buildSvg,
  calibrate,
  createTraceState,
  finishTrace,
  undoTrace,
  verifyScale,
} from '../src/plan2print/house-model-core.js';

test('calibrate stores pixels per millimetre for two points', () => {
  assert.deepEqual(calibrate([{ x: 0, y: 0 }, { x: 200, y: 0 }], 100), { pixelsPerMm: 2 });
});

test('calibrate rejects non-positive real distances', () => {
  assert.equal(calibrate([{ x: 0, y: 0 }, { x: 20, y: 0 }], 0).error, 'Enter a positive real distance.');
  assert.equal(calibrate([{ x: 0, y: 0 }, { x: 20, y: 0 }], -1).error, 'Enter a positive real distance.');
});

test('calibrate rejects point spans shorter than one pixel', () => {
  assert.equal(calibrate([{ x: 0, y: 0 }, { x: 0.5, y: 0 }], 100).error, 'Choose two distinct calibration points.');
});

test('verifyScale accepts measurements within 0.25 mm at 1:100', () => {
  assert.deepEqual(verifyScale(2500, 25.2, 100), { expectedMm: 25, differenceMm: 0.2, passed: true });
  assert.equal(verifyScale(2500, 25.3, 100).passed, false);
  assert.equal(verifyScale(0, 0, 100).passed, false);
});

test('undo removes unfinished points before completed traces', () => {
  let state = createTraceState();
  state = addTracePoint(state, { x: 0, y: 0 });
  state = addTracePoint(state, { x: 50, y: 0 });
  state = finishTrace(state, false);
  state = addTracePoint(state, { x: 5, y: 5 });
  assert.equal(undoTrace(state).activePoints.length, 0);
  assert.equal(undoTrace(undoTrace(state)).traces.length, 0);
});

test('finish and close save traces while clearing active selection', () => {
  let state = createTraceState();
  state = addTracePoint(state, { x: 0, y: 0 });
  state = addTracePoint(state, { x: 100, y: 0 });
  state = addTracePoint(state, { x: 100, y: 80 });
  state = finishTrace(state, true);
  assert.deepEqual(state.activePoints, []);
  assert.deepEqual(state.traces, [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], closed: true }]);
});

test('exports a 1:100 SVG and non-degenerate closed-room STL', () => {
  const trace = { points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1600 }, { x: 0, y: 1600 }, { x: 0, y: 1600 }], closed: true };
  const svg = buildSvg([trace], 2, 100);
  const stl = buildAsciiStl([trace], 2, { scale: 100, wallHeightMm: 25, wallThicknessMm: 1.2, baseThicknessMm: 1.2 });
  assert.match(svg, /width="10mm"/);
  assert.match(svg, /height="8mm"/);
  assert.match(stl, /^solid plan2print-house/m);
  assert.match(stl, /facet normal/);
  assert.doesNotMatch(stl, /NaN|Infinity/);
  assert.doesNotMatch(stl, /facet normal 0 0 0/);
  assert.equal((stl.match(/facet normal/g) || []).length, 60);
});

test('standalone studio mounts the House Model without Plandroid navigation', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../plan2print.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/plan2print/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="house-model"/);
  assert.match(main, /mountHouseModelWorkspace/);
  assert.match(main, /image\.onload/);
  assert.doesNotMatch(html + main, /Back to calibrated plans|Plandroid/i);
});

test('Vite multi-page config avoids Node-only globals', async () => {
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /node:path|__dirname/);
  assert.match(config, /plan2print/);
});

test('build script explicitly uses the TypeScript Vite config', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.build, /--config vite\.config\.ts/);
});
