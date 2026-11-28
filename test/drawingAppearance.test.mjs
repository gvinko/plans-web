import test from 'node:test';
import assert from 'node:assert/strict';
import { ductCornerRadius, zoneAreaStyle, roomDraftStyle, DRAWING_INK } from '../src/lib/drawingAppearance.js';

test('flex bends curve with duct width, but stay within readable radius limits', () => {
  assert.equal(ductCornerRadius({ isFlex: true, width: 20, inv: 1 }), 30);
  assert.equal(ductCornerRadius({ isFlex: true, width: 3, inv: 1 }), 10);
  assert.equal(ductCornerRadius({ isFlex: true, width: 100, inv: 1 }), 45);
  assert.equal(ductCornerRadius({ isFlex: true, width: 3, inv: 2 }), 20);
});

test('technical sheet ducts retain square scaled ends and non-flex bends stay unchanged', () => {
  assert.equal(ductCornerRadius({ isSheet: true, scaled: true, width: 100, isFlex: false }), 0);
  assert.equal(ductCornerRadius({ isFlex: false, hasBends: true, width: 100 }), 6);
  assert.equal(ductCornerRadius({ isFlex: false, hasBends: false, width: 100 }), 10);
});

test('invalid widths or zoom factors cannot produce NaN curve radii', () => {
  assert.equal(ductCornerRadius({ isFlex: true, width: NaN, inv: NaN }), 10);
  assert.equal(ductCornerRadius({ isFlex: true, width: -40, inv: 1 }), 10);
});

test('zone areas remain unfilled with neutral outlines when not selected', () => {
  const style = zoneAreaStyle(false);
  assert.equal(style.backgroundColor, 'transparent');
  assert.equal(style.border, '2px dashed #94a3b8');
  assert.equal(zoneAreaStyle(true).border, '3px dashed #2563eb');
});

test('newly sketched rooms have no coloured fill or walls', () => {
  const style = roomDraftStyle();
  assert.equal(style.fill, 'none');
  assert.equal(style.stroke, DRAWING_INK);
  assert.equal(style.strokeDasharray, '8 5');
});
