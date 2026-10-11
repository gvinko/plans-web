// Backup / restore every job (projects, levels, plans, photos) as one .json file.

import { getAll, put, clearStore, TABLES } from '@/services/db';

const FORMAT = 'ductplanner-backup';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

export async function exportBackup() {
  const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), tables: {}, files: [] };
  for (const t of TABLES) data.tables[t] = await getAll(t);
  const files = await getAll('files');
  for (const f of files) {
    data.files.push({ Id: f.Id, name: f.name, type: f.type, size: f.size, data: await blobToBase64(f.blob) });
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ductplanner-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { projects: data.tables.projects_c.length, files: data.files.length };
}

// Check a backup file before anything is replaced.
export async function readBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Ductplanner backup.');
  }
  if (data?.format !== FORMAT || !data.tables) throw new Error('That file is not a Ductplanner backup.');
  return data;
}

// Replace everything on this computer with the backup's contents.
export async function restoreBackup(data) {
  for (const t of TABLES) await clearStore(t);
  await clearStore('files');
  await clearStore('meta');
  for (const t of TABLES) {
    const rows = data.tables[t] || [];
    for (const row of rows) await put(t, row);
    const max = rows.reduce((n, r) => Math.max(n, Number(r.Id) || 0), 0);
    await put('meta', { key: `seq:${t}`, value: max });
  }
  for (const f of data.files || []) {
    await put('files', { Id: f.Id, name: f.name, type: f.type, size: f.size, blob: base64ToBlob(f.data, f.type) });
  }
}
