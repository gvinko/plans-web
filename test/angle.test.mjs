import test from 'node:test';
import assert from 'node:assert/strict';
import { normDeg, planAngleFrom, rotatePt, snapToPlan, squareToPlan } from '../src/lib/angle.js';

test('angles stay within a turn', () => {
  assert.equal(normDeg(-20), 340);
  assert.equal(normDeg(380), 20);
  assert.equal(normDeg(359.99), 0);
});

test('a wall and the wall square to it give the same plan angle', () => {
  const a = planAngleFrom({ x: 0, y: 0 }, { x: 100, y: 36.4 });
  const b = planAngleFrom({ x: 0, y: 0 }, { x: -36.4, y: 100 });
  assert.equal(a, 20);
  assert.equal(b, 20);
  assert.equal(planAngleFrom({ x: 0, y: 0 }, { x: 100, y: -36.4 }), -20);
  assert.equal(planAngleFrom({ x: 100, y: 36.4 }, { x: 0, y: 0 }), 20); // tapped either way round
});

test('square to plan keeps the part facing its nearest way', () => {
  assert.equal(squareToPlan(0, 20), 20);
  assert.equal(squareToPlan(90, 20), 110);
  assert.equal(squareToPlan(180, 20), 200);
  assert.equal(squareToPlan(270, -20), 250);
  assert.equal(squareToPlan(0, -20), 340);
});

test('rotating a point turns it clockwise on screen', () => {
  const [x, y] = rotatePt(10, 0, 90);
  assert.ok(Math.abs(x) < 1e-9);
  assert.ok(Math.abs(y - 10) < 1e-9);
});

test('duct draft snaps to the building', () => {
  assert.ok(Math.abs(snapToPlan(0.4, 20) - (20 * Math.PI) / 180) < 1e-9);
  assert.equal(snapToPlan(0.1), 0);
});
