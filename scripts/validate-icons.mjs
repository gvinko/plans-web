import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ICONS, resolveIcon } from '../src/lib/icons.js';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
let count = 0;
for (const p of walk('src')) {
  if (!/\.(jsx|js)$/.test(p) || p.endsWith('/icons.js')) continue;
  const source = fs.readFileSync(p, 'utf8');
  for (const m of source.matchAll(/(?:name=|\bicon:\s*)["']([A-Z][A-Za-z0-9]+)["']/g)) {
    assert.ok(ICONS[m[1]], `${p}: unregistered icon ${m[1]}`); count++;
  }
  for (const expression of source.matchAll(/<ApperIcon\s+name=\{([^}]+)\}/g)) {
    for (const m of expression[1].matchAll(/["']([A-Z][A-Za-z0-9]+)["']/g)) {
      assert.ok(ICONS[m[1]], `${p}: unregistered conditional icon ${m[1]}`); count++;
    }
  }
  if (p.endsWith('/DrawingWorkspace.jsx')) {
    const tools = source.match(/\{\[\[null,[\s\S]+?\.map\(\(\[tool, icon, label, key\]/)?.[0];
    assert.ok(tools, 'Drawing tool icon list must be validated');
    for (const m of tools.matchAll(/\[(?:null|'[^']*'),\s*'([^']+)'/g)) {
      assert.ok(ICONS[m[1]], `Unregistered HVAC tool icon ${m[1]}`); count++;
    }
  }
  // Includes names in tool arrays, conditional expressions, and config defaults.
  if (source.includes('ApperIcon')) {
    for (const m of source.matchAll(/["']([A-Z][A-Za-z0-9]+)["']/g)) {
      // Known control/data words aren't necessarily icons. JSX names above are strict.
      if (ICONS[m[1]]) assert.ok(resolveIcon(m[1]));
    }
  }
}
assert.equal(resolveIcon('not-an-icon'), ICONS.CircleHelp);
assert.equal(resolveIcon(undefined), ICONS.CircleHelp);
console.log(`${count} literal icon references valid; ${Object.keys(ICONS).length} registry entries; fallback verified.`);
