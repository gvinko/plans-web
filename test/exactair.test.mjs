import test from 'node:test';
import assert from 'node:assert/strict';
import { EAR, earCount, earFaces, earLabel, earLines, earNormalize, earOptions, earOuts, earPortMm, earPorts, earShort, earSpecs, earValid, earZones } from '../src/lib/exactAir.js';

const L = earLabel;
const qty = (lines, name) => lines.find((l) => l.name === name)?.qty || 0;

test('big body defaults to 1 in, 3 out, each on its own zone', () => {
  assert.equal(earCount('earbig', {}), 3);
  assert.deepEqual(earOuts('earbig', {}).map((o) => [o.mm, o.damper]), [[250, 'Zone 1'], [250, 'Zone 2'], [250, 'Zone 3']]);
  assert.equal(earPorts('earbig', {}).length, 4);
});

test('outlet count follows the picked number, 1 to 6', () => {
  assert.equal(earCount('earbig', { outs: '6 outlets' }), 6);
  assert.equal(earCount('earbig', { outs: '4 outlets' }), 4);
  assert.equal(earPorts('earbig', { outs: '6 outlets' }).filter((p) => p.id !== 'in').length, 6);
  assert.equal(earCount('earmini', { outs: '6 outlets' }), 2);
});

test('six 12" outlets fit, four 16" do not', () => {
  const six = { outs: '6 outlets', o1: L(300), o2: L(300), o3: L(300), o4: L(300), o5: L(300), o6: L(300) };
  assert.equal(earValid('earbig', six), null);
  const three = { outs: '3 outlets', o1: L(400), o2: L(400), o3: L(400) };
  assert.equal(earValid('earbig', three), null);
  const four = { outs: '4 outlets', o1: L(400), o2: L(400), o3: L(400), o4: L(400) };
  assert.ok(earValid('earbig', four));
  assert.equal(earValid('earbig', earNormalize('earbig', four)), null);
});

test('a large outlet is only offered while a face is free', () => {
  const spec = { outs: '6 outlets' }; // six 10" = three full faces
  assert.ok(!earOptions('earbig', 'o1', spec).includes(L(400)));
  assert.ok(earOptions('earbig', 'o1', { outs: '3 outlets' }).includes(L(400)));
  assert.ok(earOptions('earbig', 'inlet', spec).includes(L(400)));
});

test('ports carry the picked sizes and every port id is unique', () => {
  const spec = { inlet: L(400), outs: '4 outlets', o1: L(200), o2: L(250), o3: L(300), o4: L(350) };
  assert.equal(earPortMm('earbig', spec, 'in'), 400);
  assert.equal(earPortMm('earbig', spec, 'o4'), 350);
  assert.equal(earPortMm('earbig', spec, 'o5'), null);
  const ids = earPorts('earbig', spec).map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(earFaces(spec).length, 3);
  assert.equal(earShort('earbig', spec), '16/8·10·12·14');
});

test('parts list: body, adaptors, blanks, motors and cable', () => {
  const lines = earLines('earbig', { inlet: L(400), outs: '4 outlets', o1: L(250), o2: L(250), o3: L(300), o4: L(250), d4: 'Manual damper', cable: '12m' });
  assert.equal(qty(lines, `Advantage Air ${EAR.earbig.name} — body`), 1);
  assert.equal(qty(lines, `Exact Air adaptor — ${L(250)}`), 3);
  assert.equal(qty(lines, `Exact Air adaptor — ${L(400)}`), 1);
  assert.equal(qty(lines, 'Exact Air blank plate'), 2);
  assert.equal(qty(lines, 'Exact Air damper motor (MyPlace)'), 3);
  assert.equal(qty(lines, 'Exact Air manual damper handle'), 1);
  assert.equal(qty(lines, 'Zone Cable — 12m'), 3);
});

test('clip-in zone is 1 in 1 out, inline, with its zone', () => {
  const spec = { inlet: L(250), outlet: L(250), zone: 'Zone 4', cable: '20m' };
  assert.deepEqual(earPorts('earclip', spec).map((p) => p.id), ['w', 'e']);
  assert.equal(earPortMm('earclip', spec, 'w'), 250);
  assert.equal(earPortMm('earclip', spec, 'e'), 250);
  assert.deepEqual(earZones('earclip', spec), ['Zone 4']);
  assert.equal(qty(earLines('earclip', spec), `Exact Air adaptor — ${L(250)}`), 2);
  assert.equal(qty(earLines('earclip', spec), 'Zone Cable — 20m'), 1);
});

test('panel fields hide outlets past the count and default to their own zone', () => {
  const f = earSpecs('earbig');
  const o5 = f.find((x) => x.key === 'o5');
  assert.equal(o5.show({ outs: '3 outlets' }), false);
  assert.equal(o5.show({ outs: '5 outlets' }), true);
  assert.equal(f.find((x) => x.key === 'd2').def, 'Zone 2');
  assert.equal(earSpecs('earmini').filter((x) => /^o\d$/.test(x.key)).length, 2);
});
