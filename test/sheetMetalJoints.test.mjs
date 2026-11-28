import test from 'node:test';
import assert from 'node:assert/strict';
import { elbowJointStrokes, sheetStockLengthMm, shouldShowShopElbowJoints } from '../src/lib/sheetMetalJoints.js';

test('sheet stock never exceeds 2400 mm and respects shorter selected lengths', () => {
  assert.equal(sheetStockLengthMm(undefined), 2400);
  assert.equal(sheetStockLengthMm(0), 2400);
  assert.equal(sheetStockLengthMm(1), 2400);
  assert.equal(sheetStockLengthMm(500), 2400);
  assert.equal(sheetStockLengthMm('bad'), 2400);
  assert.equal(sheetStockLengthMm(5000), 2400);
  assert.equal(sheetStockLengthMm(2400), 2400);
  assert.equal(sheetStockLengthMm(1500), 1500);
  assert.equal(sheetStockLengthMm(1200), 1200);
});

test('elbow seams are only visible in calibrated SHOP mode for sheet metal', () => {
  assert.equal(shouldShowShopElbowJoints({ showFab: false, scale: true, mat: 'sheet' }), false);
  assert.equal(shouldShowShopElbowJoints({ showFab: true, scale: false, mat: 'sheet' }), false);
  assert.equal(shouldShowShopElbowJoints({ showFab: true, scale: true, mat: 'spiral' }), false);
  assert.equal(shouldShowShopElbowJoints({ showFab: true, scale: true, mat: 'board' }), false);
  assert.equal(shouldShowShopElbowJoints({ showFab: true, scale: true, mat: 'sheet' }), true);
});

test('square elbow has one transverse joint on each adjoining leg', () => {
  const points = [{ x: 0, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 160 }];
  const bends = [{ i: 1, v: points[1], u1: { x: 1, y: 0 }, u2: { x: 0, y: 1 }, radius: false }];
  const paths = elbowJointStrokes({ bends, points, widthPx: 40, pixelsPerMm: 0.1 });
  assert.deepEqual(paths, ['M100,16.5 L100,63.5', 'M143.5,60 L96.5,60']);
});

test('radius elbow joints lie at the tangent points, not inside the curved section', () => {
  const points = [{ x: 0, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 160 }];
  const bends = [{ i: 1, v: points[1], u1: { x: 1, y: 0 }, u2: { x: 0, y: 1 }, radius: true, st: { x: 90, y: 40 }, en: { x: 120, y: 70 } }];
  const paths = elbowJointStrokes({ bends, points, widthPx: 40, pixelsPerMm: 0.1 });
  assert.deepEqual(paths, ['M90,16.5 L90,63.5', 'M143.5,70 L96.5,70']);
});

test('near-zero legs do not produce overlapping or invalid elbow joints', () => {
  const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }];
  const bends = [{ i: 1, v: points[1], u1: { x: 1, y: 0 }, u2: { x: 0, y: 1 }, radius: false }];
  assert.deepEqual(elbowJointStrokes({ bends, points, widthPx: 40, pixelsPerMm: 0.1 }), []);
});

test('invalid width, missing tangent, malformed bends and unscaled values never produce paths', () => {
  const points = [{ x: 0, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 160 }];
  const square = { i: 1, v: points[1], u1: { x: 1, y: 0 }, u2: { x: 0, y: 1 } };
  const radius = { ...square, radius: true };
  assert.deepEqual(elbowJointStrokes({ bends: [square], points, widthPx: 0, pixelsPerMm: 0.1 }), []);
  assert.deepEqual(elbowJointStrokes({ bends: [square], points, widthPx: 40, pixelsPerMm: 0 }), []);
  assert.deepEqual(elbowJointStrokes({ bends: [radius], points, widthPx: 40, pixelsPerMm: 0.1 }), []);
  assert.deepEqual(elbowJointStrokes({ bends: [{ ...square, u2: { x: NaN, y: 1 } }], points, widthPx: 40, pixelsPerMm: 0.1 }), []);
});

test('stock cut list includes a short remainder and never exceeds 2400 mm', async () => {
  const { stockSections } = await import('../src/lib/sheetMetalJoints.js');
  const parts = stockSections({ from: 0, to: 2401 }, 1, 2400);
  assert.deepEqual(parts.map(p => p.lenMm), [2400, 1]);
  assert.deepEqual(stockSections({ from: 200, to: 2650 }, 1, 2400).map(p => p.lenMm), [2400, 50]);
  assert.equal(stockSections({ from: 0, to: 4800 }, 1, 2400).length, 2);
});
