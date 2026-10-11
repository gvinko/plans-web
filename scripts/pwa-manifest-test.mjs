import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', dist), 'utf8'));

assert.equal(manifest.name, 'Plans to Print — 2D/3D Print Design Studio');
assert.equal(manifest.short_name, 'Plans to Print');
assert.equal(manifest.start_url, '.');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons?.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons?.some((icon) => icon.sizes === '512x512'));
for (const icon of manifest.icons ?? []) {
  assert.ok(typeof icon.src === 'string' && !icon.src.includes('..'), 'Unsafe icon path');
  assert.ok(existsSync(new URL(icon.src, dist)), `Missing built PWA icon: ${icon.src}`);
}
const html = readFileSync(new URL('index.html', dist), 'utf8');
assert.match(html, /<div id="root"><\/div>/);
assert.doesNotMatch(html, /plandroid|workbrain/i, 'Legacy product identity in built HTML');
console.log('PASS: standalone Plans to Print PWA identity, shell and icons');
