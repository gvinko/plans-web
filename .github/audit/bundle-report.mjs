// Size of each npm package / source folder inside the built JS chunks, from source maps.
// Usage: node bundle-report.mjs <dist-with-maps> > report.txt
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.argv[2], 'assets');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js.map'))) {
  const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const by = {};
  m.sources.forEach((s, i) => {
    const pkg = s.includes('node_modules/') ? s.split('node_modules/').pop().split('/').slice(0, s.split('node_modules/').pop().startsWith('@') ? 2 : 1).join('/') : s.replace(/^(\.\.\/)+/, '').split('/').slice(0, 3).join('/');
    by[pkg] = (by[pkg] || 0) + (m.sourcesContent?.[i]?.length || 0);
  });
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  console.log(`\n== ${f} (source chars ${total})`);
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(v).padStart(10), k);
}
