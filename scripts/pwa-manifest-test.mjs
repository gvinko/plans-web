import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
assert.equal(manifest.name, 'Plans to Print — 2D/3D Print Design Studio');
assert.equal(manifest.short_name, 'Plans to Print');
assert.equal(manifest.start_url, '.');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons?.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons?.some((icon) => icon.sizes === '512x512'));
console.log('PASS: standalone Plans to Print PWA identity and icons');
