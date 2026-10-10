import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));

assert.equal(manifest.name, 'Plans to Print — 2D/3D Print Design Studio');
assert.equal(manifest.short_name, 'Plans to Print');
console.log('PASS built PWA manifest identifies Plans to Print');
