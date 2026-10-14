// Backup and restore: every project, level, drawing, plan image and site photo
// in one zip. Restore merges — it adds or overwrites, it never deletes.
import JSZip from 'jszip';
import { db } from '@/services/localDb';

const LAST_KEY = 'ductplanner-last-backup';
const FOLDER_DB = 'ductplanner-settings';
export const BACKUP_EVERY_DAYS = 7;

export function lastBackupAt() {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function daysSinceBackup() {
  const d = lastBackupAt();
  return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
}

function markBackedUp() {
  try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

const pad = (n) => String(n).padStart(2, '0');
export function backupFileName(d = new Date()) {
  return `Ductplanner-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}


const safe = (s) => String(s || 'untitled').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'untitled';

export async function buildBackupZip() {
  const [projects, pages, files] = await Promise.all([db.projects.toArray(), db.plan_pages.toArray(), db.files.toArray()]);
  const manifest = {
    app: 'Ductplanner',
    format: 1,
    exportedAt: new Date().toISOString(),
    counts: { projects: projects.length, levels: pages.length, files: files.length },
    projects,
    pages,
    files: files.map(({ key, name, type, size, addedOn }) => ({ key, name, type, size, addedOn, path: `files/${key}` })),
  };
  const z = new JSZip();
  z.file('backup.json', JSON.stringify(manifest, null, 1));
  z.file('README.txt',
      'Ductplanner backup\n\nTo restore: open Ductplanner > Backup > Restore from backup, and pick this zip.\n'
      + 'Restoring adds or updates projects; it never deletes anything already in the app.\n\n'
      + `Projects: ${projects.length}  Levels: ${pages.length}  Images: ${files.length}\nMade: ${manifest.exportedAt}\n`);
  // A readable copy of each drawing, filed by job, so a single job can be found without the app.
  for (const pg of pages) {
    const proj = projects.find((p) => p.Id === pg.projectId_c);
    z.file(`jobs/${safe(proj?.Name)} (${proj?.Id ?? '?'})/${safe(pg.Name || pg.level_c)} (${pg.Id}).json`, pg.drawingJson_c || '[]');
  }
  for (const f of files) {
    if (f.blob) z.file(`files/${f.key}`, await f.blob.arrayBuffer());
  }
  const blob = await z.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, manifest };
}

// ---- Optional backup folder (e.g. your Dropbox folder) ----
// Chrome / Edge on a computer can write the zip straight into a folder you pick.
export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function settingsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FOLDER_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kv(mode, fn) {
  const sdb = await settingsDb();
  return new Promise((resolve, reject) => {
    const tx = sdb.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getBackupFolder() {
  try { return (await kv('readonly', (s) => s.get('folder'))) || null; } catch { return null; }
}

export async function chooseBackupFolder() {
  const handle = await window.showDirectoryPicker({ id: 'ductplanner-backups', mode: 'readwrite' });
  await kv('readwrite', (s) => s.put(handle, 'folder'));
  return handle;
}

export async function forgetBackupFolder() {
  try { await kv('readwrite', (s) => s.delete('folder')); } catch { /* ignore */ }
}

async function folderWritable(handle, ask) {
  if (!handle?.queryPermission) return false;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return ask ? (await handle.requestPermission(opts)) === 'granted' : false;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Make a backup. Writes into the chosen folder if there is one (asking for
// permission if needed), otherwise downloads it. Returns where it went.
export async function runBackup({ ask = true } = {}) {
  const { blob, manifest } = await buildBackupZip();
  const name = backupFileName();
  const folder = await getBackupFolder();
  if (folder && (await folderWritable(folder, ask))) {
    const fh = await folder.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    markBackedUp();
    return { where: 'folder', folderName: folder.name, name, manifest };
  }
  if (!ask) return null;
  download(blob, name);
  markBackedUp();
  return { where: 'download', name, manifest };
}

// Weekly: when the app opens and a backup is due, write it to the chosen folder
// quietly if the browser still allows it. Returns null when it could not.
export async function autoBackupIfDue() {
  const days = daysSinceBackup();
  if (days !== null && days < BACKUP_EVERY_DAYS) return null;
  const count = await db.projects.count();
  if (!count) return null;
  try { return await runBackup({ ask: false }); } catch { return null; }
}

export async function restoreBackup(file) {
  const z = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = z.file('backup.json');
  if (!entry) throw new Error('This zip is not a Ductplanner backup (no backup.json inside).');
  const manifest = JSON.parse(await entry.async('string'));
  if (manifest.app !== 'Ductplanner') throw new Error('This zip is not a Ductplanner backup.');
  const fileRows = [];
  for (const f of manifest.files || []) {
    const zf = z.file(f.path || `files/${f.key}`);
    if (!zf) continue;
    const buf = await zf.async('arraybuffer');
    fileRows.push({ key: f.key, name: f.name, type: f.type, size: f.size, addedOn: f.addedOn, blob: new Blob([buf], { type: f.type || 'image/jpeg' }) });
  }
  await db.transaction('rw', db.projects, db.plan_pages, db.files, async () => {
    if (manifest.projects?.length) await db.projects.bulkPut(manifest.projects);
    if (manifest.pages?.length) await db.plan_pages.bulkPut(manifest.pages);
    if (fileRows.length) await db.files.bulkPut(fileRows);
  });
  return { projects: manifest.projects?.length || 0, levels: manifest.pages?.length || 0, files: fileRows.length, exportedAt: manifest.exportedAt };
}
