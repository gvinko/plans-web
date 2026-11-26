import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRestoredFiles } from '../src/lib/restoreFiles.js';

const file = (key) => ({ key, blob: 'bytes from backup' });
const page = (key) => ({ Id: 3, projectId_c: 2, planFile_c: [{ key, name: 'plan.pdf' }] });

test('an existing local attachment is never overwritten by a backup with the same key', () => {
  const plan = { projects: [{ Id: 2 }], pages: [page('collision')] };
  const result = prepareRestoredFiles(plan, [file('collision')], ['collision'], (key) => `${key}-new`);
  assert.equal(result.files[0].key, 'collision-new');
  assert.equal(result.pages[0].planFile_c[0].key, 'collision-new');
  assert.equal(plan.pages[0].planFile_c[0].key, 'collision');
});

test('a file collision for a skipped backup job cannot overwrite the local file', () => {
  const result = prepareRestoredFiles({ projects: [], pages: [] }, [file('collision')], ['collision'], () => 'unused');
  assert.deepEqual(result.files, []);
});

test('unused uncollided backup files keep the original key for backward compatibility', () => {
  const result = prepareRestoredFiles({ projects: [], pages: [] }, [file('new-file')], ['other'], () => 'unused');
  assert.equal(result.files[0].key, 'new-file');
});

test('project specifications and page photographs follow their restored file keys', () => {
  const plan = {
    projects: [{ Id: 2, specDocs_c: [{ key: 'doc' }] }],
    pages: [{ Id: 3, sitePhotos_c: [{ key: 'photo' }] }],
  };
  const result = prepareRestoredFiles(plan, [file('doc'), file('photo')], ['doc', 'photo'], (key) => `${key}-copy`);
  assert.equal(result.projects[0].specDocs_c[0].key, 'doc-copy');
  assert.equal(result.pages[0].sitePhotos_c[0].key, 'photo-copy');
  assert.deepEqual(result.files.map((f) => f.key), ['doc-copy', 'photo-copy']);
});

test('two references to a colliding file share one newly allocated key', () => {
  const plan = { projects: [], pages: [{ Id: 3, planFile_c: [{ key: 'x' }], sitePhotos_c: [{ key: 'x' }] }] };
  const result = prepareRestoredFiles(plan, [file('x')], ['x'], () => 'x-safe');
  assert.equal(result.pages[0].planFile_c[0].key, 'x-safe');
  assert.equal(result.pages[0].sitePhotos_c[0].key, 'x-safe');
  assert.equal(result.files.length, 1);
});
