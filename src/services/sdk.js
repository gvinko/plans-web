// Local stand-in for the Apper data SDK, so the drawing code runs unchanged.
// sdk.table(name).select(fields).page(n, size).fetch() / create / update / remove
// sdk.storage.upload(file) / toUpdateFormat(files)
// Everything is stored in IndexedDB on this computer — no server, works offline.

import { getAll, get, put, removeKeys, nextId } from '@/services/db';

const FILE_FIELDS = { plan_pages_c: ['planFile_c', 'sitePhotos_c'] };
const urlCache = new Map();

async function fileUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const row = await get('files', id);
  if (!row?.blob) return null;
  const url = URL.createObjectURL(row.blob);
  urlCache.set(id, url);
  return url;
}

async function hydrate(table, record) {
  const fields = FILE_FIELDS[table] || [];
  if (!fields.length) return record;
  const out = { ...record };
  for (const f of fields) {
    if (!Array.isArray(out[f])) continue;
    out[f] = await Promise.all(out[f].map(async (ref) => ({ ...ref, url: await fileUrl(ref.id) })));
  }
  return out;
}

function stripFiles(table, record) {
  const fields = FILE_FIELDS[table] || [];
  const out = { ...record };
  fields.forEach((f) => {
    if (Array.isArray(out[f])) out[f] = toUpdateFormat(out[f]);
  });
  return out;
}

function ok(data) {
  return { success: true, data, messages: [] };
}

function fail(message) {
  return { success: false, data: [], message, messages: [message] };
}

function table(name) {
  let fields = null;
  const api = {
    select(list) {
      fields = list;
      return api;
    },
    page() {
      return api;
    },
    async fetch() {
      try {
        const rows = (await getAll(name)).sort((a, b) => a.Id - b.Id);
        const shaped = fields ? rows.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]]))) : rows;
        return ok(await Promise.all(shaped.map((r) => hydrate(name, r))));
      } catch (err) {
        return fail(err?.message || 'Could not read local storage');
      }
    },
    async get(id) {
      const row = await get(name, Number(id));
      return row ? ok(await hydrate(name, row)) : fail('Not found');
    },
    async create(record) {
      try {
        const now = new Date().toISOString();
        const row = stripFiles(name, { ...record, Id: await nextId(name), CreatedOn: now, ModifiedOn: now });
        await put(name, row);
        return ok([await hydrate(name, row)]);
      } catch (err) {
        return fail(err?.message || 'Could not save');
      }
    },
    async update(record) {
      try {
        const id = Number(record.Id);
        const current = await get(name, id);
        if (!current) return fail('Record not found');
        const row = stripFiles(name, { ...current, ...record, Id: id, ModifiedOn: new Date().toISOString() });
        await put(name, row);
        return ok([await hydrate(name, row)]);
      } catch (err) {
        return fail(err?.message || 'Could not save');
      }
    },
    async remove(ids) {
      try {
        const list = (Array.isArray(ids) ? ids : [ids]).map(Number);
        const fileFields = FILE_FIELDS[name] || [];
        if (fileFields.length) {
          const rows = await Promise.all(list.map((id) => get(name, id)));
          const fileIds = rows.flatMap((r) => fileFields.flatMap((f) => (Array.isArray(r?.[f]) ? r[f].map((x) => x.id) : [])));
          if (fileIds.length) await removeKeys('files', fileIds);
        }
        await removeKeys(name, list);
        return ok([]);
      } catch (err) {
        return fail(err?.message || 'Could not delete');
      }
    },
  };
  return api;
}

export function toUpdateFormat(files) {
  return (files || []).filter((f) => f && f.id).map(({ id, name, size, type }) => ({ id, name, size, type }));
}

async function upload(file) {
  const id = crypto.randomUUID();
  const name = file.name || `${id}.bin`;
  await put('files', { Id: id, name, type: file.type, size: file.size, blob: file });
  const url = URL.createObjectURL(file);
  urlCache.set(id, url);
  return { id, name, size: file.size, type: file.type, url };
}

export const sdk = {
  table,
  storage: { upload, toUpdateFormat },
};
