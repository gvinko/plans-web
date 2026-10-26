import test from 'node:test';
import assert from 'node:assert/strict';
import { pageTextFromItems, looksScanned, searchSources, scanWatch, crossCheck, clauseAt } from '../src/lib/specs.js';

const spec = {
  id: 'spec1', kind: 'spec', name: 'Mechanical spec.pdf',
  pages: [
    '4.3 DUCTWORK\n4.3.1 General\nAll supply ductwork shall be internally lined with 25 mm acoustic lining for the first 3 m from the unit. Insulation to be R1.5 minimum.\n4.3.2 Dampers\nProvide volume control dampers at every branch take-off.',
    '5.1 FIRE\nFire dampers to AS 1682 at all fire walls. Electrical isolators by others.\nBlanking plates to unused spigots.',
  ],
};
const plan = { id: 'lvl1', kind: 'plan', name: 'Level 1', pages: ['SA 600x300 LINED\nFD-01 FD-02'] };

test('pdf text items become lines', () => {
  const t = pageTextFromItems([
    { str: '4.3.1', transform: [1, 0, 0, 1, 0, 700] }, { str: 'General', transform: [1, 0, 0, 1, 40, 700] },
    { str: 'All ductwork', transform: [1, 0, 0, 1, 0, 680] },
  ]);
  assert.equal(t, '4.3.1 General\nAll ductwork');
});

test('scanned detection', () => {
  assert.equal(looksScanned(['', ' ', 'x']), true);
  assert.equal(looksScanned(spec.pages), false);
});

test('search finds words across line breaks, with page and clause', () => {
  const hits = searchSources([spec, plan], 'volume control');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].page, 1);
  assert.equal(hits[0].clause, '4.3.2');
  assert.match(hits[0].snippet.text, /volume control dampers at every branch/);
  assert.equal(searchSources([spec, plan], 'lined').length, 2); // spec + plan
  assert.equal(clauseAt(spec.pages[1], spec.pages[1].indexOf('Fire dampers')), '5.1');
  assert.equal(clauseAt(spec.pages[0], spec.pages[0].indexOf('Dampers')), '4.3.2'); // a match on the heading line itself
});

test('watch list flags the gotchas', () => {
  const ids = scanWatch([spec, plan], ['spigots']).map((w) => w.id);
  for (const id of ['lined', 'insul', 'vcd', 'fd', 'blank', 'scope', 'standards', 'my:spigots']) assert.ok(ids.includes(id), id);
});

test('cross-check: spec items missing from the parts list come first', () => {
  const w = scanWatch([spec]);
  const res = crossCheck(w, [{ name: 'Volume Control Damper — 300x200mm', qty: 4 }]);
  const byId = Object.fromEntries(res.map((r) => [r.id, r]));
  assert.equal(byId.vcd.missing, false);
  assert.equal(byId.fd.missing, true);
  assert.equal(byId.blank.missing, true);
  assert.ok(res.findIndex((r) => r.missing) < res.findIndex((r) => !r.missing));
});
