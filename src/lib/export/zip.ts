/**
 * Small deterministic ZIP32 (STORE/no compression) writer.
 * STL meshes are already dense binary data, so the benefit of compression is
 * usually limited. No network access, runtime package or file service needed.
 */
export interface ZipEntry {
  name: string;
  data: Blob | Uint8Array | string;
}

const encoder = new TextEncoder();
const MAX_ENTRIES = 100;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_FILENAME_BYTES = 180;
const UTF8 = 0x0800;

function safeName(value: string): string {
  // ZIP entries are deliberately flat: no traversal or platform-specific paths.
  const sanitized = value
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/[^\w .()-]/g, '-')
    .trim()
    .replace(/^\.+$/, 'file');
  if (!sanitized) throw new Error('An archive item has no valid filename.');
  const bytes = encoder.encode(sanitized);
  if (bytes.length > MAX_FILENAME_BYTES) throw new Error('Archive filename is too long.');
  return sanitized;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function put16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function put32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

async function bytesFor(data: ZipEntry['data']): Promise<Uint8Array> {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return data;
}

interface Packed {
  name: Uint8Array;
  bytes: Uint8Array;
  crc: number;
  offset: number;
}

/**
 * Produces a standards-compliant, non-ZIP64 archive, with stable 1980 timestamps.
 * Rejects oversized archives instead of emitting a truncated/corrupted ZIP.
 */
export async function createStoredZip(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length < 1 || entries.length > MAX_ENTRIES) {
    throw new Error('A ZIP must contain between 1 and 100 files.');
  }
  const names = new Set<string>();
  const packed: Packed[] = [];
  let position = 0;
  for (const entry of entries) {
    const safe = safeName(entry.name);
    const duplicateKey = safe.toLowerCase();
    if (names.has(duplicateKey)) throw new Error('Duplicate ZIP filename: ' + safe);
    names.add(duplicateKey);
    const name = encoder.encode(safe);
    const bytes = await bytesFor(entry.data);
    if (bytes.byteLength > MAX_TOTAL_BYTES || position + 30 + name.length + bytes.byteLength > MAX_TOTAL_BYTES) {
      throw new Error('STL package exceeds 64 MB. Export individual parts instead.');
    }
    packed.push({ name, bytes, crc: crc32(bytes), offset: position });
    position += 30 + name.length + bytes.byteLength;
  }
  const directoryStart = position;
  for (const entry of packed) position += 46 + entry.name.length;
  const directoryLength = position - directoryStart;
  position += 22;
  if (position > MAX_TOTAL_BYTES) throw new Error('ZIP package exceeds 64 MB.');

  const archive = new Uint8Array(position);
  const view = new DataView(archive.buffer);
  let cursor = 0;
  for (const entry of packed) {
    put32(view, cursor, 0x04034b50);
    put16(view, cursor + 4, 20); // version to extract
    put16(view, cursor + 6, UTF8);
    put16(view, cursor + 8, 0); // STORE, not DEFLATE
    put16(view, cursor + 10, 0); // DOS time
    put16(view, cursor + 12, 0x0021); // 1980-01-01
    put32(view, cursor + 14, entry.crc);
    put32(view, cursor + 18, entry.bytes.byteLength);
    put32(view, cursor + 22, entry.bytes.byteLength);
    put16(view, cursor + 26, entry.name.length);
    put16(view, cursor + 28, 0);
    cursor += 30;
    archive.set(entry.name, cursor);
    cursor += entry.name.length;
    archive.set(entry.bytes, cursor);
    cursor += entry.bytes.byteLength;
  }

  for (const entry of packed) {
    put32(view, cursor, 0x02014b50);
    put16(view, cursor + 4, 20); // version made by
    put16(view, cursor + 6, 20); // version needed
    put16(view, cursor + 8, UTF8);
    put16(view, cursor + 10, 0);
    put16(view, cursor + 12, 0);
    put16(view, cursor + 14, 0x0021);
    put32(view, cursor + 16, entry.crc);
    put32(view, cursor + 20, entry.bytes.byteLength);
    put32(view, cursor + 24, entry.bytes.byteLength);
    put16(view, cursor + 28, entry.name.length);
    put16(view, cursor + 30, 0);
    put16(view, cursor + 32, 0);
    put16(view, cursor + 34, 0);
    put16(view, cursor + 36, 0);
    put32(view, cursor + 38, 0);
    put32(view, cursor + 42, entry.offset);
    cursor += 46;
    archive.set(entry.name, cursor);
    cursor += entry.name.length;
  }
  put32(view, cursor, 0x06054b50);
  put16(view, cursor + 4, 0);
  put16(view, cursor + 6, 0);
  put16(view, cursor + 8, packed.length);
  put16(view, cursor + 10, packed.length);
  put32(view, cursor + 12, directoryLength);
  put32(view, cursor + 16, directoryStart);
  put16(view, cursor + 20, 0);
  return new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' });
}
