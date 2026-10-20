import { useState, lazy, Suspense } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
const DrawingWorkspace = lazy(() => import('@/components/DrawingWorkspace'));
import { toast } from 'sonner';
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
  return res.data;
}

export const route = {
  path: '/phase1',
  layout: 'owner',
  access: 'authenticated',
};

export const nav = {
  icon: 'DraftingCompass',
  label: 'Projects',
  section: null,
  order: 10,
};

export default function Phase1() {
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
      <Suspense fallback={<div role="status" className="p-5">Loading drawing…</div>}><DrawingWorkspace
        page={activePage}
        project={activeProject}
        levels={projectPages}
        onSwitchLevel={switchLevel}
        onAddLevel={addLevel}
        onSave={saveDrawing}
        onSaveProject={saveProject}
        onBack={() => { setActivePage(null); setActiveProject(null); setProjectPages([]); }}
      /></Suspense>
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
            <Button variant="outline" size="sm" onClick={reloadProjects}>
              <ApperIcon name="RefreshCw" size={14} />
              Refresh
            </Button>
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
