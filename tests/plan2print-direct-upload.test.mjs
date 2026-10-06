import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Direct Upload package script creates a standalone Plan2Print entry', async () => {
  const script = await readFile(new URL('../scripts/package-plan2print.mjs', import.meta.url), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(script, /plan2print\.html/);
  assert.match(script, /plan2print-studio\.html/);
  assert.match(script, /endsWith\('\.map'\)/);
  assert.match(script, /new URL/);
  assert.match(script, /manifest/);
  assert.match(script, /replace\(\/\\s\*<link rel="manifest"/);
  assert.match(packageJson.scripts['package:plan2print'], /package-plan2print/);
});
