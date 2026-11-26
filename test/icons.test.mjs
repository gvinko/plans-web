import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ApperIcon only bundles the icons it lists. This catches an icon name used in the app that isn't listed.
const src = new URL('../src/', import.meta.url).pathname;
const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : /\.jsx?$/.test(f) ? [join(d, f)] : []));

test('every ApperIcon name in the app is in the icon list', () => {
  const icon = readFileSync(join(src, 'components/ApperIcon.jsx'), 'utf8');
  const known = new Set(icon.slice(icon.indexOf('const KNOWN'), icon.indexOf('};', icon.indexOf('const KNOWN'))).match(/[A-Z][A-Za-z0-9]+/g));
  const used = new Set();
  for (const f of files(src)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/<ApperIcon\b([\s\S]*?)\/?>/g)) {
      const n = /name=(?:"([^"]*)"|\{([\s\S]*?)\}\s)/.exec(m[1] + ' ');
      if (n?.[1]) used.add(n[1]);
      else if (n?.[2]) for (const q of n[2].matchAll(/'([A-Z][A-Za-z0-9]+)'/g)) used.add(q[1]);
    }
    // Icon names held in data, e.g. the toolbar list and app config.
    for (const q of s.matchAll(/\[(?:null|'[a-z]+'), '([A-Z][A-Za-z0-9]+)', '/g)) used.add(q[1]);
    for (const q of s.matchAll(/\bicon: '([A-Z][A-Za-z0-9]+)'/g)) used.add(q[1]);
  }
  const missing = [...used].filter((n) => !known.has(n));
  assert.ok(used.size > 50, `found ${used.size} icon names`);
  assert.deepEqual(missing, []);
});
