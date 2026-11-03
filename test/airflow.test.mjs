import test from 'node:test';
import assert from 'node:assert/strict';
import { networkAirflow, unitScale } from '../src/lib/airflow.js';

const roles = { indoor: 'unit', supply: 'supplyTerm', return: 'returnTerm', eggcrate: 'exhaustTerm', exhfan: 'fit', roofcowl: 'anyTerm', vcd: 'fit' };
const roleOf = (t) => roles[t] || 'fit';
const run = (id, a, b) => ({ kind: 'smduct', id, pts: [], a, b });
const port = (itemId) => ({ kind: 'port', itemId, portId: 'x' });

test('main run carries all outlets, a branch carries its own, side branches count upstream', () => {
  const items = [
    { id: 'u', type: 'indoor' },
    { id: 's1', type: 'supply', airflow: 100 },
    { id: 's2', type: 'supply', airflow: 150 },
    { id: 's3', type: 'supply' }, // no airflow yet
    { id: 'd', type: 'vcd', onRun: { id: 'R2' } },
  ];
  const sketch = [
    run('R1', port('u'), null),
    run('R2', { kind: 'run', id: 'R1', end: 'b' }, port('s1')),
    run('R3', { kind: 'side', id: 'R1', seg: 0, t: 0.5 }, port('s2')),
    run('R4', { kind: 'side', id: 'R1', seg: 0, t: 0.8 }, port('s3')),
  ];
  const { runs } = networkAirflow({ sketch, items }, { roleOf });
  assert.equal(runs.get('R1').lps, 250);
  assert.equal(runs.get('R1').missing, 1);
  assert.equal(runs.get('R2').lps, 100);
  assert.equal(runs.get('R3').lps, 150);
  assert.equal(runs.get('R4').lps, 0);
});

test('room share fills outlets with no typed airflow; return runs stay separate', () => {
  const items = [
    { id: 'u', type: 'indoor' },
    { id: 's1', type: 'supply' },
    { id: 'g', type: 'return', airflow: 400 },
  ];
  const sketch = [run('SA', port('u'), port('s1')), run('RA', port('g'), port('u'))];
  const { runs, terminals } = networkAirflow({ sketch, items }, { roleOf, roomLps: (it) => (it.id === 's1' ? 220 : null) });
  assert.equal(terminals.get('s1').source, 'room');
  assert.equal(runs.get('SA').lps, 220);
  assert.equal(runs.get('RA').lps, 400);
});

test('exhaust: rooted at the fan, discharge to the roof cowl carries the whole system', () => {
  const items = [
    { id: 'e1', type: 'eggcrate', airflow: 60 },
    { id: 'e2', type: 'eggcrate', airflow: 40 },
    { id: 'f', type: 'exhfan', onRun: { id: 'X1' } },
    { id: 'rc', type: 'roofcowl' },
  ];
  const sketch = [
    run('X1', port('e1'), null),
    run('X2', { kind: 'side', id: 'X1', seg: 0, t: 0.2 }, port('e2')),
    run('X3', { kind: 'run', id: 'X1', end: 'b' }, port('rc')),
  ];
  const { runs } = networkAirflow({ sketch, items }, { roleOf });
  assert.equal(runs.get('X2').lps, 40);
  assert.equal(runs.get('X3').lps, 100);
});

test('a system with no unit or fan is left alone', () => {
  const { runs } = networkAirflow({ sketch: [run('R', port('s'), null)], items: [{ id: 's', type: 'supply', airflow: 50 }] }, { roleOf });
  assert.equal(runs.size, 0);
});

const sup = (id, lps) => ({ id, type: 'supply', airflow: lps });

test('outside air is what is supplied but not returned, not supply plus return', () => {
  const items = [{ id: 'u', type: 'indoor' }, sup('s', 1000), { id: 'r', type: 'return', airflow: 800 }, { id: 'oa', type: 'roofcowl' }];
  const sketch = [run('A', port('u'), port('s')), run('B', port('u'), port('r')), run('C', port('u'), port('oa'))];
  const { runs } = networkAirflow({ sketch, items }, { roleOf });
  assert.equal(runs.get('C').lps, 200);
});

test('with supply and return balanced, outside air gets no made-up figure', () => {
  const items = [{ id: 'u', type: 'indoor' }, sup('s', 600), { id: 'r', type: 'return', airflow: 600 }, { id: 'oa', type: 'roofcowl' }];
  const sketch = [run('A', port('u'), port('s')), run('B', port('u'), port('r')), run('C', port('u'), port('oa'))];
  const { runs } = networkAirflow({ sketch, items }, { roleOf });
  assert.equal(runs.get('C'), undefined);
});

test('a blank return grille takes the unit airflow, shared between grilles', () => {
  const items = [{ id: 'u', type: 'indoor' }, sup('s', 500), { id: 'r1', type: 'return' }, { id: 'r2', type: 'return' }];
  const sketch = [run('A', port('u'), port('s')), run('B', port('u'), port('r1')), run('C', port('u'), port('r2'))];
  const { runs, terminals } = networkAirflow({ sketch, items }, { roleOf, unitLps: () => 700 });
  assert.equal(runs.get('B').lps, 350);
  assert.equal(runs.get('B').missing, 0);
  assert.equal(terminals.get('r1').source, 'unit');
});

test('with no unit airflow known, a blank return takes the supply total', () => {
  const items = [{ id: 'u', type: 'indoor' }, sup('s', 500), { id: 'r', type: 'return' }];
  const sketch = [run('A', port('u'), port('s')), run('B', port('u'), port('r'))];
  const { runs } = networkAirflow({ sketch, items }, { roleOf });
  assert.equal(runs.get('B').lps, 500);
});

test('a typed return grille is left alone', () => {
  const items = [{ id: 'u', type: 'indoor' }, sup('s', 500), { id: 'r1', type: 'return', airflow: 300 }, { id: 'r2', type: 'return' }];
  const sketch = [run('A', port('u'), port('s')), run('B', port('u'), port('r1')), run('C', port('u'), port('r2'))];
  const { runs } = networkAirflow({ sketch, items }, { roleOf, unitLps: () => 700 });
  assert.equal(runs.get('B').lps, 300);
  assert.equal(runs.get('C').lps, 400);
});

test('room airflow is scaled so the rooms add up to what the units move', () => {
  assert.equal(unitScale(700, 10, 50), 1.4);
  assert.equal(unitScale(0, 10, 50), 1);
  assert.equal(unitScale(700, 0, 50), 1);
});
