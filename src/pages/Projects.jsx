import { useRef, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import DrawingWorkspace from '@/components/DrawingWorkspace';
import { toast } from 'sonner';
import { exportBackup, readBackup, restoreBackup } from '@/services/backup';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PROJECT_FIELDS = ['Id', 'Name', 'suburb_c', 'address_c', 'phone_c', 'revision_c', 'ModifiedOn'];
const PAGE_FIELDS = ['Id', 'Name', 'projectId_c', 'level_c', 'drawingJson_c', 'planFile_c', 'sitePhotos_c', 'ModifiedOn'];

async function fetchProjects() {
  const res = await sdk.table('projects_c').select(PROJECT_FIELDS).page(1, 100).fetch();
  if (!res.success) throw new Error(res.message);
  return [...res.data].sort((a, b) => String(b.ModifiedOn || '').localeCompare(String(a.ModifiedOn || '')));
}

export default function Projects() {
  const { data, loading, error, run: reloadProjects } = useFetch(fetchProjects, []);
  const projects = data ?? [];
  const [customer, setCustomer] = useState('');
  const [suburb, setSuburb] = useState('');
  const [activePage, setActivePage] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [projectPages, setProjectPages] = useState([]);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreData, setRestoreData] = useState(null);
  const restoreInputRef = useRef(null);

  async function downloadBackup() {
    setBackupBusy(true);
    try {
      const r = await exportBackup();
      toast.success('Backup downloaded', { description: `${r.projects} project${r.projects === 1 ? '' : 's'} and ${r.files} file${r.files === 1 ? '' : 's'}. Keep it somewhere safe (OneDrive, USB).` });
    } catch (err) {
      toast.error('Backup failed', { description: err?.message || 'Please try again.' });
    } finally {
      setBackupBusy(false);
    }
  }

  async function pickRestore(file) {
    if (!file) return;
    try {
      setRestoreData(await readBackup(file));
    } catch (err) {
      toast.error('Could not read that file', { description: err?.message });
    }
  }

  async function confirmRestore() {
    if (!restoreData) return;
    setBackupBusy(true);
    try {
      await restoreBackup(restoreData);
      toast.success('Backup restored');
      setRestoreData(null);
      await reloadProjects();
    } catch (err) {
      toast.error('Restore failed', { description: err?.message || 'Please try again.' });
    } finally {
      setBackupBusy(false);
    }
  }

  // Delete a project and its drawing page(s).
  async function deleteProject() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const pagesRes = await sdk.table('plan_pages_c').select(['Id', 'projectId_c']).page(1, 200).fetch();
      const pageIds = (pagesRes.data || []).filter((row) => String(row.projectId_c) === String(deleteTarget.Id)).map((row) => row.Id);
      if (pageIds.length) await sdk.table('plan_pages_c').remove(pageIds);
      const res = await sdk.table('projects_c').remove([deleteTarget.Id]);
      if (res && res.success === false) {
        toast.error('Could not delete the project', { description: (res.messages || []).join(' ') || res.message || 'Please try again.' });
        return;
      }
      toast.success(`Deleted ${deleteTarget.Name}`);
      setDeleteTarget(null);
      await reloadProjects();
    } catch (err) {
      toast.error('Could not delete the project', { description: err?.message || 'Please try again.' });
    } finally {
      setDeleting(false);
    }
  }

  async function createProject(event) {
    event.preventDefault();
    if (!customer.trim() || !suburb.trim()) return;

    const projectRes = await sdk.table('projects_c').create({
      Name: customer.trim(),
      suburb_c: suburb.trim(),
      address_c: address.trim(),
      phone_c: phone.trim(),
      revision_c: 'A',
    });
    if (projectRes.messages?.length) {
      setMessage(projectRes.messages.join(' '));
    }
    if (!projectRes.data?.length) return;

    const project = projectRes.data[0];
    const pageRes = await sdk.table('plan_pages_c').create({
      Name: 'Level 1',
      projectId_c: project.Id,
      level_c: 'Level 1',
      drawingJson_c: '[]',
    });
    if (pageRes.messages?.length) {
      setMessage(pageRes.messages.join(' '));
    }
    if (!pageRes.data?.length) return;

    setCustomer('');
    setSuburb('');
    setAddress('');
    setPhone('');
    setMessage('Project created ✓');
    await reloadProjects();
  }

  async function openProject(project) {
    setMessage('Opening…');
    const res = await sdk.table('plan_pages_c').select(PAGE_FIELDS).page(1, 100).fetch();
    if (!res.success) {
      setMessage(res.message || 'Could not load plan pages');
      return;
    }

    let pages = res.data.filter((row) => String(row.projectId_c) === String(project.Id)).sort((a, b) => a.Id - b.Id);
    if (!pages.length) {
      const created = await sdk.table('plan_pages_c').create({
        Name: 'Level 1',
        projectId_c: project.Id,
        level_c: 'Level 1',
        drawingJson_c: '[]',
      });
      if (created.messages?.length) setMessage(created.messages.join(' '));
      if (!created.data?.length) return;
      pages = [created.data[0]];
    }

    setMessage('');
    setActiveProject(project);
    setProjectPages(pages);
    setActivePage(pages[0]);
  }

  // Each floor level is its own drawing page. Re-read from the server so plan / photo links are fresh.
  async function switchLevel(pageId) {
    if (!activeProject) return;
    const res = await sdk.table('plan_pages_c').select(PAGE_FIELDS).page(1, 100).fetch();
    const pages = res.success
      ? res.data.filter((row) => String(row.projectId_c) === String(activeProject.Id)).sort((a, b) => a.Id - b.Id)
      : projectPages;
    const next = pages.find((p) => String(p.Id) === String(pageId));
    if (!next) {
      toast.error('Could not open that level', { description: res.message || 'Please try again.' });
      return;
    }
    setProjectPages(pages);
    setActivePage(next);
  }

  async function addLevel(name) {
    if (!activeProject) return;
    const created = await sdk.table('plan_pages_c').create({
      Name: name,
      projectId_c: activeProject.Id,
      level_c: name,
      drawingJson_c: '[]',
    });
    if (!created.data?.length) {
      toast.error('Could not add the level', { description: (created.messages || []).join(' ') || 'Please try again.' });
      return;
    }
    const page = created.data[0];
    setProjectPages((current) => [...current, page]);
    setActivePage(page);
    toast.success(`${name} added`, { description: 'Load its plan or sketch it. Switch levels from the drop-down at the top.' });
  }

  async function saveDrawing(drawingJson, planFiles, photoFiles) {
    if (!activePage) return false;
    const record = { Id: activePage.Id, drawingJson_c: drawingJson };
    if (Array.isArray(planFiles)) record.planFile_c = sdk.storage.toUpdateFormat(planFiles);
    if (Array.isArray(photoFiles)) record.sitePhotos_c = sdk.storage.toUpdateFormat(photoFiles);
    let res = await sdk.table('plan_pages_c').update(record);
    if (!res.data?.length && (record.planFile_c || record.sitePhotos_c)) {
      // If the files can't be attached, still save the drawing itself.
      delete record.planFile_c;
      delete record.sitePhotos_c;
      res = await sdk.table('plan_pages_c').update(record);
    }
    if (res.messages?.length) setMessage(res.messages.join(' '));
    if (!res.data?.length) return false;
    const saved = res.data[0] || {};
    const patch = { drawingJson_c: drawingJson, ModifiedOn: saved.ModifiedOn || new Date().toISOString() };
    setActivePage((current) => ({ ...current, ...patch }));
    setProjectPages((current) => current.map((p) => (p.Id === activePage.Id ? { ...p, ...patch } : p)));
    return true;
  }

  // Save customer / job details edited from inside the drawing.
  async function saveProject(patch) {
    if (!activeProject) return false;
    const res = await sdk.table('projects_c').update({
      Id: activeProject.Id,
      Name: (patch.Name || '').trim() || activeProject.Name,
      address_c: (patch.address_c || '').trim(),
      suburb_c: (patch.suburb_c || '').trim(),
      phone_c: (patch.phone_c || '').trim(),
    });
    if (!res.data?.length) {
      if (res.messages?.length) toast.error(res.messages[0]);
      return false;
    }
    setActiveProject((current) => ({ ...current, ...res.data[0] }));
    reloadProjects();
    return true;
  }

  if (activePage) {
    return (
      <DrawingWorkspace
        page={activePage}
        project={activeProject}
        levels={projectPages}
        onSwitchLevel={switchLevel}
        onAddLevel={addLevel}
        onSave={saveDrawing}
        onSaveProject={saveProject}
        onBack={() => { setActivePage(null); setActiveProject(null); setProjectPages([]); }}
      />
    );
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-5 space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading font-semibold mb-1">New project</h2>
          <p className="text-sm text-muted-foreground mb-4">Start a Level 1 concept drawing for a new customer.</p>
          <form onSubmit={createProject} className="grid sm:grid-cols-2 lg:grid-cols-[1.2fr_1.6fr_1fr_1fr_auto] gap-2">
            <Input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Customer name" aria-label="Customer name" />
            <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street address" aria-label="Street address" />
            <Input value={suburb} onChange={(event) => setSuburb(event.target.value)} placeholder="Suburb" aria-label="Suburb" />
            <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" aria-label="Phone" />
            <Button type="submit" disabled={!customer.trim() || !suburb.trim()}>
              <ApperIcon name="Plus" size={16} />
              New project
            </Button>
          </form>
          {message && <p className="text-xs text-muted-foreground mt-3">{message}</p>}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">Projects</h2>
              <p className="text-sm text-muted-foreground">Open a project to work on its drawings. Add more levels from inside the drawing.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" disabled={backupBusy} onClick={downloadBackup} title="Save every job, plan and photo to one file">
                <ApperIcon name="Download" size={14} />
                Backup
              </Button>
              <Button variant="outline" size="sm" disabled={backupBusy} onClick={() => restoreInputRef.current?.click()} title="Load jobs from a backup file">
                <ApperIcon name="Upload" size={14} />
                Restore
              </Button>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; pickRestore(f); }}
              />
              <Button variant="outline" size="sm" onClick={reloadProjects}>
                <ApperIcon name="RefreshCw" size={14} />
                Refresh
              </Button>
            </div>
          </div>

          {loading && (
            <div className="grid md:grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse mb-2" />
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl border border-destructive bg-card p-8 text-sm text-destructive space-y-3">
              <p>Could not load projects: {String(error.message || error)}</p>
              <Button variant="outline" size="sm" onClick={reloadProjects}>Retry</Button>
            </div>
          )}
          {!loading && !error && projects.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              <ApperIcon name="DraftingCompass" size={28} className="mx-auto mb-2" />
              <p>No projects yet. Create one above to start a Level 1 drawing.</p>
            </div>
          )}
          {!loading && !error && projects.length > 0 && (
            <div className="grid md:grid-cols-2 gap-3">
              {projects.map((project) => (
                <div key={project.Id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => openProject(project)}
                    className="block flex-1 min-w-0 text-left hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  >
                    <div className="font-semibold">{project.Name}</div>
                    <div className="text-xs text-muted-foreground">
                      {project.suburb_c} · rev {project.revision_c || 'A'}
                    </div>
                    {(project.address_c || project.phone_c) && (
                      <div className="text-xs text-muted-foreground truncate">{[project.address_c, project.phone_c].filter(Boolean).join(' · ')}</div>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${project.Name}`}
                    title="Delete project"
                    onClick={() => setDeleteTarget(project)}
                  >
                    <ApperIcon name="Trash2" size={16} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={!!restoreData} onOpenChange={(open) => { if (!open && !backupBusy) setRestoreData(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace everything with this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreData ? `The backup from ${String(restoreData.exportedAt || '').slice(0, 10)} has ${(restoreData.tables?.projects_c || []).length} project(s). Every job currently on this computer will be replaced. Download a backup first if you want to keep them.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backupBusy}>Cancel</AlertDialogCancel>
            <Button variant="outline" disabled={backupBusy} onClick={downloadBackup}>Back up current first</Button>
            <AlertDialogAction variant="destructive" disabled={backupBusy} onClick={(event) => { event.preventDefault(); confirmRestore(); }}>
              {backupBusy ? 'Restoring…' : 'Replace with backup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.Name}" and all its levels will be permanently deleted. This can't be undone.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); deleteProject(); }}>
              {deleting ? 'Deleting…' : 'Delete project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
