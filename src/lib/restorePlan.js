// Works out what a restore may write without losing anything on this device.
// Ids are only counters, so two devices (or a reinstall) both have a job 1: the same Id
// does not mean the same job. Pure function, no database, so it can be tested on its own.

const time = (row) => Date.parse(row?.ModifiedOn || '') || 0;
const latest = (project, pages) => Math.max(time(project), ...pages.map(time));

function sameJob(a, b) {
  if (a.CreatedOn && b.CreatedOn) return a.CreatedOn === b.CreatedOn;
  return String(a.Name || '') === String(b.Name || '');
}

/**
 * For each job in the backup:
 *  - not on this device: added, keeping its Id if free
 *  - a different job has its Id: added under a new Id
 *  - same job, backup newer: updated in place
 *  - same job, unchanged: left alone
 *  - same job, changed here since: added as a "(restored …)" copy, the live job untouched
 * @returns {{ projects:any[], pages:any[], summary:{added:number,updated:number,copied:number,skipped:number} }}
 */
export function planRestore(manifest, local) {
  const backupProjects = manifest.projects || [];
  const backupPages = manifest.pages || [];
  const localProjects = new Map(local.projects.map((p) => [p.Id, p]));
  const localPages = new Map(local.pages.map((p) => [p.Id, p]));
  const pagesOf = (list, id) => list.filter((p) => String(p.projectId_c) === String(id));

  let next = Math.max(0, ...[...backupProjects, ...backupPages, ...local.projects, ...local.pages].map((r) => Number(r.Id) || 0)) + 1;
  const newId = () => { next += 1; return next - 1; };
  const backupProjectIds = new Set(backupProjects.map((p) => p.Id));

  const projects = [];
  const pages = [];
  const summary = { added: 0, updated: 0, copied: 0, skipped: 0 };
  const stamp = String(manifest.exportedAt || '').slice(0, 10);

  backupProjects.forEach((p) => {
    const levels = pagesOf(backupPages, p.Id);
    const here = localProjects.get(p.Id);
    const same = !!here && sameJob(here, p);
    let project = p;
    let inPlace = false;
    if (same) {
      const backupAt = latest(p, levels);
      const hereAt = latest(here, pagesOf(local.pages, here.Id));
      if (backupAt === hereAt) { summary.skipped += 1; return; }
      if (backupAt > hereAt) {
        inPlace = true;
        summary.updated += 1;
      } else {
        project = { ...p, Id: newId(), Name: `${p.Name || 'Job'} (restored${stamp ? ` ${stamp}` : ''})`, wbJobId_c: '', wbJobRef_c: '' };
        summary.copied += 1;
      }
    } else {
      if (here) project = { ...p, Id: newId() };
      summary.added += 1;
    }
    projects.push(project);
    levels.forEach((pg) => {
      const taken = localPages.get(pg.Id);
      const keepId = !taken || (inPlace && String(taken.projectId_c) === String(p.Id));
      pages.push({ ...pg, Id: keepId ? pg.Id : newId(), projectId_c: project.Id });
    });
  });

  // Levels whose job isn't in the backup: bring them across, never over something else.
  backupPages.filter((pg) => !backupProjectIds.has(pg.projectId_c)).forEach((pg) => {
    if (!localPages.has(pg.Id)) pages.push(pg);
  });

  return { projects, pages, summary };
}
