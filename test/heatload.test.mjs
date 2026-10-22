import test from 'node:test';
import assert from 'node:assert/strict';
import { calcRoomLoad } from '../src/lib/heatLoad.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

test('old single-window rooms give the same load as before', () => {
  // Hand-worked with the pre-change formula: 20 m², west, 4 m² glass, eaves, 2 walls, insulated roof, western Sydney.
  const r = calcRoomLoad({ type: 'living', orient: 'W', glass: 4, shading: 'eaves', walls: 2 }, 20, 'west');
  const wallArea = 2 * Math.sqrt(20) * 2.4 - 4;
  const want = 20 * 22 * 1.1 + wallArea * (0.6 * 12 + 4) + 4 * (480 * 0.7 * 1.1 + 5.8 * 12) + 0.33 * 0.7 * 48 * 12 + 4 * 130 + 300;
  near(r.coolW, want);
});

test('two windows add up; a south window adds less than a west one', () => {
  const one = calcRoomLoad({ windows: [{ orient: 'W', glass: 4, shading: 'none' }] }, 20, 'west');
  const two = calcRoomLoad({ windows: [{ orient: 'W', glass: 4, shading: 'none' }, { orient: 'S', glass: 2, shading: 'none' }] }, 20, 'west');
  const westOnly = calcRoomLoad({ windows: [{ orient: 'W', glass: 6, shading: 'none' }] }, 20, 'west');
  assert.ok(two.coolW > one.coolW);
  assert.ok(two.coolW < westOnly.coolW);
  assert.equal(two.inputs.glass, 6);
});

test('double glazing and wall insulation lower the load', () => {
  const base = calcRoomLoad({ orient: 'W', glass: 4, walls: 2, wallType: 'brickVeneer' }, 20, 'west');
  assert.ok(calcRoomLoad({ orient: 'W', glass: 4, walls: 2, wallType: 'brickVeneer', glazing: 'double' }, 20, 'west').coolW < base.coolW);
  assert.ok(calcRoomLoad({ orient: 'W', glass: 4, walls: 2, wallType: 'wellInsulated' }, 20, 'west').heatW < base.heatW);
});
