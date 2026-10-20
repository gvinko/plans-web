// On-device storage for Ductplanner (replaces the Apper cloud database).
// Everything lives in this browser's IndexedDB: projects, drawing pages and the
// plan / site-photo image files. Use Backup (top bar) to copy it all to a zip.
import Dexie from 'dexie';

export const db = new Dexie('ductplanner');
db.version(1).stores({
  projects: '++Id, Name, ModifiedOn',
  plan_pages: '++Id, projectId_c, ModifiedOn',
  files: 'key',
});

const TABLES = { projects_c: 'projects', plan_pages_c: 'plan_pages' };
const tableFor = (name) => db.table(TABLES[name] || name);

// Ask the browser not to clear our data when the disk gets full.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}

// ---- Files (plan images, site photos) ----
const urlCache = new Map();

function fileUrl(key, blob) {
  if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(blob));
  return urlCache.get(key);
}

const fileFields = ['planFile_c', 'sitePhotos_c', 'projectDocuments_c'];

// Saved file lists hold only {key, name, size, type}; add a live URL for display.
async function hydrateFiles(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of fileFields) {
    if (!Array.isArray(row[f])) continue;
    const list = [];
    for (const meta of row[f]) {
      // Official references have no local blob. Keep their source URL and version
      // intact alongside uploaded PDFs.
      if (!meta?.key) { list.push(meta); continue; }
      const rec = await db.files.get(meta.key);
      if (rec?.blob) list.push({ ...meta, url: fileUrl(meta.key, rec.blob) });
    }
    out[f] = list;
  }
  return out;
}

export const storage = {
  async upload(file) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.name || 'file'}`;
    await db.files.put({ key, name: file.name || 'file', type: file.type || 'application/octet-stream', size: file.size, blob: file, addedOn: new Date().toISOString() });
    return { key, name: file.name || 'file', size: file.size, type: file.type, url: fileUrl(key, file) };
  },
  toUpdateFormat(files) {
    return (files || []).filter((f) => f?.key).map(({ key, name, size, type }) => ({ key, name, size, type }));
  },
};

// ---- Tables: the same shape of calls the Apper SDK used ----
function query(name) {
  let pageNo = 1;
  let pageSize = 1000;
  const q = {
    select() { return q; },
    page(n, size) { pageNo = n; pageSize = size; return q; },
    async fetch() {
      try {
        const rows = await tableFor(name).orderBy('Id').offset((pageNo - 1) * pageSize).limit(pageSize).toArray();
        return { success: true, data: await Promise.all(rows.map(hydrateFiles)) };
      } catch (err) {
        return { success: false, message: err?.message || 'Could not read saved data', data: [] };
      }
    },
  };
  return q;
}

export const sdk = {
  storage,
  table(name) {
    const t = tableFor(name);
    return {
      select: (...a) => query(name).select(...a),
      async create(record) {
        try {
          const now = new Date().toISOString();
          const Id = await t.add({ ...record, CreatedOn: now, ModifiedOn: now });
          return { success: true, data: [await hydrateFiles(await t.get(Id))] };
        } catch (err) {
          return { success: false, messages: [err?.message || 'Could not save'], data: [] };
        }
      },
      async update(record) {
        try {
          const { Id, ...rest } = record;
          const patch = { ...rest, ModifiedOn: new Date().toISOString() };
          const n = await t.update(Id, patch);
          if (!n && !(await t.get(Id))) return { success: false, messages: ['Record not found'], data: [] };
          return { success: true, data: [await hydrateFiles(await t.get(Id))] };
        } catch (err) {
          return { success: false, messages: [err?.message || 'Could not save'], data: [] };
        }
      },
      async remove(ids) {
        try {
          if (name === 'plan_pages_c') {
            // Drop the page's image files too.
            const rows = await t.bulkGet(ids);
            const keys = rows.flatMap((r) => fileFields.flatMap((f) => (r?.[f] || []).map((m) => m.key))).filter(Boolean);
            if (keys.length) await db.files.bulkDelete(keys);
          }
          if (name === 'projects_c') {
            const rows = await t.bulkGet(ids);
            const keys = rows.flatMap((r) => (r?.projectDocuments_c || []).map((m) => m.key)).filter(Boolean);
            if (keys.length) await db.files.bulkDelete(keys);
          }
          await t.bulkDelete(ids);
          return { success: true };
        } catch (err) {
          return { success: false, messages: [err?.message || 'Could not delete'] };
        }
      },
    };
  },
};
