import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'dist');
const target = resolve(root, 'dist-plan2print');
const pending = ['plan2print.html', 'plan2print-studio.html'];
const copied = new Set();

async function copyWithReferences(path) {
  if (copied.has(path)) return;
  copied.add(path);
  const sourcePath = resolve(source, path);
  const targetPath = resolve(target, path);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath);
  if (!/\.(html|js|mjs)$/i.test(path)) return;
  const text = await readFile(sourcePath, 'utf8');
  const refs = [...text.matchAll(/["']\.\/([^"']+)["']/g), ...text.matchAll(/new URL\(["']([^"']+)["']/g)];
  for (const match of refs) {
    const reference = relative(source, resolve(dirname(sourcePath), match[1]));
    if (reference.startsWith('..') || reference.endsWith('.map')) continue;
    try { await stat(resolve(source, reference)); pending.push(reference); } catch { /* optional source-map or library fallback */ }
  }
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
while (pending.length) await copyWithReferences(pending.shift());
await writeFile(resolve(target, 'plan2print.html'), (await readFile(resolve(target, 'plan2print.html'), 'utf8')).replace(/\s*<link rel="manifest"[^>]*>/, ''));
await writeFile(resolve(target, 'index.html'), '<!doctype html><meta http-equiv="refresh" content="0; url=./plan2print-studio.html">');
const files = [];
async function list(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) entry.isDirectory() ? await list(resolve(directory, entry.name)) : files.push(relative(target, resolve(directory, entry.name))); }
await list(target);
console.log(`Plan2Print package ready: ${files.length} files in ${target}`);
