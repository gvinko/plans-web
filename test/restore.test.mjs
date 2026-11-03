import test from 'node:test';
import assert from 'node:assert/strict';
import { planRestore } from '../src/lib/restorePlan.js';

const job = (Id, Name, CreatedOn, ModifiedOn = CreatedOn, extra = {}) => ({ Id, Name, CreatedOn, ModifiedOn, ...extra });
const lvl = (Id, projectId_c, ModifiedOn, drawing = 'b') => ({ Id, projectId_c, Name: 'Level 1', ModifiedOn, drawingJson_c: drawing });
const T1 = '2026-10-01T00:00:00.000Z';
const T2 = '2026-10-02T00:00:00.000Z';
const T3 = '2026-10-03T00:00:00.000Z';

test('a different job with the same Id is added beside the local job, not over it', () => {
  const p = planRestore(
    { projects: [job(1, 'Backup job', T1)], pages: [lvl(1, 1, T1)] },
    { projects: [job(1, 'Local job', T2)], pages: [lvl(1, 1, T2, 'local')] },
  );
  assert.equal(p.projects.length, 1);
  assert.equal(p.projects[0].Name, 'Backup job');
  assert.notEqual(p.projects[0].Id, 1);
  assert.notEqual(p.pages[0].Id, 1);
  assert.equal(p.pages[0].projectId_c, p.projects[0].Id);
  assert.deepEqual(p.summary, { added: 1, updated: 0, copied: 0, skipped: 0 });
});

test('a job not on this device keeps its Id; a clashing level gets a new one', () => {
  const p = planRestore(
    { projects: [job(2, 'New', T1, T1, { wbJobId_c: 'J9' })], pages: [lvl(5, 2, T1)] },
    { projects: [job(1, 'Local', T2)], pages: [lvl(5, 1, T2, 'local')] },
  );
  assert.equal(p.projects[0].Id, 2);
  assert.equal(p.projects[0].wbJobId_c, 'J9');
  assert.notEqual(p.pages[0].Id, 5);
  assert.equal(p.pages[0].projectId_c, 2);
});

test('the same job, newer in the backup, updates in place', () => {
  const p = planRestore(
    { projects: [job(1, 'Same', T1, T3)], pages: [lvl(1, 1, T3)] },
    { projects: [job(1, 'Same', T1, T2)], pages: [lvl(1, 1, T2, 'old')] },
  );
  assert.equal(p.projects[0].Id, 1);
  assert.equal(p.pages[0].Id, 1);
  assert.equal(p.summary.updated, 1);
});

test('an older backup of a job changed since is kept as a copy, local work untouched', () => {
  const p = planRestore(
    { projects: [job(1, 'Same', T1, T2, { wbJobId_c: 'J1' })], pages: [lvl(1, 1, T2)] },
    { projects: [job(1, 'Same', T1, T2, { wbJobId_c: 'J1' })], pages: [lvl(1, 1, T3, 'newer')] },
  );
  assert.notEqual(p.projects[0].Id, 1);
  assert.match(p.projects[0].Name, /Same \(restored/);
  assert.equal(p.projects[0].wbJobId_c, ''); // the WorkBrain link stays on the live job
  assert.notEqual(p.pages[0].Id, 1);
  assert.equal(p.summary.copied, 1);
});

test('restoring a backup of what is already here changes nothing', () => {
  const p = planRestore(
    { projects: [job(1, 'Same', T1, T2)], pages: [lvl(1, 1, T2)] },
    { projects: [job(1, 'Same', T1, T2)], pages: [lvl(1, 1, T2)] },
  );
  assert.equal(p.projects.length, 0);
  assert.equal(p.pages.length, 0);
  assert.equal(p.summary.skipped, 1);
});

test('new Ids never reuse one from the backup or this device', () => {
  const p = planRestore(
    { projects: [job(1, 'A', T1), job(9, 'B', T1)], pages: [lvl(1, 1, T1), lvl(9, 9, T1)] },
    { projects: [job(1, 'Local', T2), job(4, 'L2', T2)], pages: [lvl(1, 1, T2), lvl(4, 4, T2)] },
  );
  const ids = p.projects.map((x) => x.Id);
  assert.ok(ids.includes(9));
  assert.equal(new Set(ids).size, 2);
  assert.ok(!ids.includes(1) && !ids.includes(4));
});
