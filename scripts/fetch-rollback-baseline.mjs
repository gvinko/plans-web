import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Mirror the immutable production artifact, not a rebuild with today's dependencies.
const origin = 'https://09cfaca3.plans-web.pages.dev';
const directory = '.tmp/rollback-artifact';
const pending = ['/'];
const seen = new Set();
const manifest = {};
const unavailable = [];
while (pending.length) {
  const url = pending.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const response = await fetch(origin + url);
  if (!response.ok) throw new Error(`${origin}${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (url !== '/' && /text\/html/.test(response.headers.get('content-type') || '')) {
    // Pages returns the SPA shell for missing optional fallback filenames.
    unavailable.push(url);
    continue;
  }
  if (url === '/' && crypto.createHash('sha256').update(data).digest('hex') !== '6da834983eb119b33bffd5c271dd93456b80cc32fce974c81cfdf0edbd541341') {
    throw new Error('Immutable baseline document changed; verify deployment identity before QA.');
  }
  const target = path.join(directory, url === '/' ? 'index.html' : url.slice(1));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  manifest[url] = crypto.createHash('sha256').update(data).digest('hex');
  if (url === '/' || /\.(js|css)$/.test(url)) {
    const text = data.toString();
    for (const match of text.matchAll(/(?:["'`(])((?:\.?\/?assets\/|\.\/)[A-Za-z0-9_.-]+\.(?:js|css|png|svg|woff2|mjs))/g)) {
      const asset = '/assets/' + match[1].split('/').pop();
      if (!seen.has(asset)) pending.push(asset);
    }
  }
}
await fs.writeFile(`${directory}/manifest.json`, JSON.stringify({ origin, deployment: '09cfaca3-989a-4c73-98ae-5a59b8927160', source: 'a794d8f33f15972d4785860ab03805d56faf2c53', sha256: manifest, unavailable }, null, 2));
console.log(`Mirrored ${Object.keys(manifest).length} immutable baseline files for disposable rollback QA; unavailable optional references: ${unavailable.join(', ') || 'none'}.`);
