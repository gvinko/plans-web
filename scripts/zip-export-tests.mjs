import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const filename = resolve(root, 'src/lib/export/zip.ts');
const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  fileName: filename,
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { createStoredZip } = module.exports;
const decoder = new TextDecoder();

function checksum(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const source = [
  { name: 'box-part-01.stl', data: Uint8Array.from([1, 2, 0, 255, 12]) },
  { name: 'folder/assembly.json', data: '{"units":"mm"}' },
  { name: 'READ-ME.txt', data: new Blob(['123456789']) },
];
const archive = new Uint8Array(await (await createStoredZip(source)).arrayBuffer());
const v = new DataView(archive.buffer);
let offset = 0;
const parsed = [];
for (let i = 0; i < source.length; i += 1) {
  assert.equal(v.getUint32(offset, true), 0x04034b50, 'local header must be present');
  assert.equal(v.getUint16(offset + 8, true), 0, 'ZIP entry must use supported STORE compression method');
  const size = v.getUint32(offset + 18, true);
  const nameSize = v.getUint16(offset + 26, true);
  const name = decoder.decode(archive.subarray(offset + 30, offset + 30 + nameSize));
  const bytes = archive.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size);
  assert.equal(v.getUint32(offset + 14, true), checksum(bytes), 'each CRC32 must be correct');
  parsed.push({ name, data: bytes });
  offset += 30 + nameSize + size;
}
assert.deepEqual(parsed.map(x => x.name), ['box-part-01.stl', 'assembly.json', 'READ-ME.txt']);
assert.deepEqual([...parsed[0].data], [1, 2, 0, 255, 12]);
assert.equal(decoder.decode(parsed[1].data), '{"units":"mm"}');
assert.equal(decoder.decode(parsed[2].data), '123456789');
assert.equal(checksum(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC32 canonical fixture');

// Walk central directory and verify pointers back to the local headers.
const centralStart = offset;
const locations = [];
for (let i = 0; i < source.length; i += 1) {
  assert.equal(v.getUint32(offset, true), 0x02014b50);
  const nameLen = v.getUint16(offset + 28, true);
  const storedName = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLen));
  assert.equal(storedName, parsed[i].name);
  const localOffset = v.getUint32(offset + 42, true);
  assert.equal(v.getUint32(localOffset, true), 0x04034b50);
  locations.push(localOffset);
  offset += 46 + nameLen;
}
assert.deepEqual(locations.slice().sort((a, b) => a - b), locations);
assert.equal(v.getUint32(offset, true), 0x06054b50, 'end-of-central-directory marker');
assert.equal(v.getUint16(offset + 10, true), source.length, 'directory entry count');
assert.equal(v.getUint32(offset + 12, true), offset - centralStart, 'directory byte length');
assert.equal(v.getUint32(offset + 16, true), centralStart, 'directory pointer');

await assert.rejects(createStoredZip([]), /between 1 and 100/);
await assert.rejects(createStoredZip([
  { name: '../abc.txt', data: 'one' },
  { name: 'abc.txt', data: 'two' },
]), /Duplicate ZIP filename/);
const dotOnlyZip = new Uint8Array(await (await createStoredZip([{ name: '.....', data: 'x' }])).arrayBuffer());
const dotNameSize = new DataView(dotOnlyZip.buffer).getUint16(26, true);
assert.equal(decoder.decode(dotOnlyZip.subarray(30, 30 + dotNameSize)), 'file');

console.log('PASS ZIP32 headers, CRC, filenames, payload, directory, and invalid-input guards');
