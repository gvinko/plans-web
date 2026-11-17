import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcRoomLoad,
  defaultRoomType,
  roomInputs,
} from '../src/lib/heatLoad.js';
import { ductMmFor, suggestModel } from '../src/lib/autoLayout.js';

test('classifies common room names into the expected load profiles', () => {
  assert.equal(defaultRoomType('Kitchen / Meals'), 'kitchen');
  assert.equal(defaultRoomType('Bedroom 2'), 'bed');
  assert.equal(defaultRoomType('Media Room'), 'media');
  assert.equal(defaultRoomType('Entry Hall'), 'hall');
  assert.equal(defaultRoomType('Unlabelled space'), 'other');
});

test('keeps multiple window inputs and totals their glass area', () => {
  const inputs = roomInputs({
    windows: [
      { orient: 'W', glass: 2, shading: 'none' },
      { orient: 'S', glass: 1.5, shading: 'blinds' },
    ],
    glazing: 'double',
  }, 20, 'Living');

  assert.equal(inputs.type, 'living');
  assert.equal(inputs.glass, 3.5);
  assert.equal(inputs.windows.length, 2);
  assert.equal(inputs.glazing, 'double');
});

test('calculates a finite zero-area load without negative values', () => {
  const load = calcRoomLoad({}, 0, 'west', 'Study');

  assert.equal(load.wPerM2, 0);
  assert.ok(Number.isFinite(load.coolW));
  assert.ok(Number.isFinite(load.heatW));
  assert.ok(load.coolW >= 0);
  assert.ok(load.heatW >= 0);
});

test('accounts for climate and window shading in cooling estimates', () => {
  const room = {
    type: 'living',
    windows: [{ orient: 'W', glass: 4, shading: 'none' }],
  };
  const shaded = calcRoomLoad({
    ...room,
    windows: [{ orient: 'W', glass: 4, shading: 'blinds' }],
  }, 25, 'coastal', 'Living');
  const inland = calcRoomLoad(room, 25, 'inland', 'Living');
  const coastal = calcRoomLoad(room, 25, 'coastal', 'Living');

  assert.ok(coastal.coolW > shaded.coolW);
  assert.ok(inland.coolW > coastal.coolW);
});

test('selects the smallest standard duct that carries the requested airflow', () => {
  assert.equal(ductMmFor(0), 150);
  assert.equal(ductMmFor(70), 150);
  assert.equal(ductMmFor(71), 200);
  assert.equal(ductMmFor(400), 400);
});

test('suggests the smallest model meeting the calculated capacity', () => {
  const models = [
    { code: 'S', kw: 5.0 },
    { code: 'M', kw: 7.1 },
    { code: 'L', kw: 10.0 },
  ];

  assert.equal(suggestModel(models, 6.0, (model) => model.kw).code, 'M');
  assert.equal(suggestModel(models, 12.0, (model) => model.kw).code, 'L');
  assert.equal(suggestModel([], 6.0, (model) => model.kw), '');
});
