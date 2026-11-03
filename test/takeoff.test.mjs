import test from 'node:test';
import assert from 'node:assert/strict';
import { bomFor, jobEquipment } from '../src/lib/wbTakeoff.js';

const here = { groups: [{ name: 'Outlets', rows: [{ name: 'Diffuser 250', qty: 3, note: 'x' }] }] };
const drawn = JSON.stringify({ items: [{ id: 'a' }], sketch: [] });

test('bomFor keeps only what the list needs', () => {
  const b = bomFor({ groups: [{ name: 'G', rows: [{ name: 'N', qty: '2', note: '', extra: 1 }] }], keep: [] });
  assert.deepEqual(b, { groups: [{ name: 'G', rows: [{ name: 'N', qty: 2, note: '' }] }] });
});

test('levels add up, matching lines by group and name', () => {
  const other = { Id: 2, Name: 'Level 2', drawingJson_c: drawn, bom_c: { groups: [{ name: 'Outlets', rows: [{ name: 'Diffuser 250', qty: 2 }, { name: 'Diffuser 200', qty: 1 }] }, { name: 'Ducts', rows: [{ name: 'Flex', qty: 4 }] }] } };
  const { equipment, levels, missing } = jobEquipment(here, { Id: 1 }, [{ Id: 1, Name: 'Level 1' }, other]);
  assert.equal(levels, 2);
  assert.deepEqual(missing, []);
  assert.equal(equipment.groups[0].rows[0].qty, 5);
  assert.equal(equipment.groups[0].rows[1].name, 'Diffuser 200');
  assert.equal(equipment.groups[1].rows[0].qty, 4);
});

test('a drawn level with no saved list is reported, an empty one is not', () => {
  const { missing, levels } = jobEquipment(here, { Id: 1 }, [
    { Id: 1, Name: 'Level 1' },
    { Id: 2, Name: 'Level 2', drawingJson_c: drawn },
    { Id: 3, Name: 'Roof', drawingJson_c: '[]' },
    { Id: 4, Name: 'Page 4', drawingJson_c: JSON.stringify({ items: [], connections: [], joins: [], sketch: [], scale: null, sheet: { w: 1, h: 1 } }) },
  ]);
  assert.deepEqual(missing, ['Level 2']);
  assert.equal(levels, 1);
});
