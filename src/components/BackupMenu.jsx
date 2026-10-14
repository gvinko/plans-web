import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BACKUP_EVERY_DAYS,
  autoBackupIfDue,
  canPickFolder,
  chooseBackupFolder,
  daysSinceBackup,
  forgetBackupFolder,
  getBackupFolder,
  restoreBackup,
  runBackup,
} from '@/lib/backup';
import { requestPersistentStorage } from '@/services/localDb';

const ago = (d) => (d === null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);

export default function BackupMenu() {
  const [days, setDays] = useState(() => daysSinceBackup());
  const [folder, setFolder] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const due = days === null || days >= BACKUP_EVERY_DAYS;

  useEffect(() => {
    let live = true;
    (async () => {
      await requestPersistentStorage();
      const f = await getBackupFolder();
      if (live) setFolder(f);
      const done = await autoBackupIfDue();
      if (done && live) {
        setDays(daysSinceBackup());
        toast.success('Weekly backup saved', { description: `${done.name} → ${done.folderName}` });
      }
    })();
    return () => { live = false; };
  }, []);

  async function backupNow() {
    setBusy(true);
    try {
      const res = await runBackup({ ask: true });
      setDays(daysSinceBackup());
      if (res?.where === 'folder') toast.success('Backup saved', { description: `${res.name} → ${res.folderName}` });
      else if (res) toast.success('Backup downloaded', { description: `${res.name} — move it into Dropbox, or choose a backup folder so it goes there by itself.` });
    } catch (err) {
      toast.error('Backup failed', { description: err?.message || 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    try {
      const f = await chooseBackupFolder();
      setFolder(f);
      toast.success(`Backups will save to “${f.name}”`, { description: 'Pick your Dropbox folder and every backup is copied to Dropbox automatically.' });
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not use that folder', { description: err?.message });
    }
  }

  async function onRestore(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await restoreBackup(file);
      toast.success('Backup restored', { description: `${r.projects} projects, ${r.levels} levels, ${r.files} images. Reloading…` });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error('Restore failed', { description: err?.message || 'Check the file and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={onRestore} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={due ? 'default' : 'outline'} size="sm" disabled={busy} className={due ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}>
            <ApperIcon name={busy ? 'Loader2' : due ? 'TriangleAlert' : 'ShieldCheck'} size={15} className={busy ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{due ? 'Backup due' : 'Backup'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-semibold">Last backup: {ago(days)}</div>
            <div className="text-xs text-muted-foreground">
              {folder ? `Saving to folder “${folder.name}”` : 'No backup folder set — backups download'}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={backupNow}>
            <ApperIcon name="Download" size={15} />
            Back up now (zip)
          </DropdownMenuItem>
          {canPickFolder() && (
            <DropdownMenuItem onSelect={pickFolder}>
              <ApperIcon name="FolderInput" size={15} />
              {folder ? 'Change backup folder…' : 'Choose backup folder (e.g. Dropbox)…'}
            </DropdownMenuItem>
          )}
          {folder && (
            <DropdownMenuItem onSelect={async () => { await forgetBackupFolder(); setFolder(null); }}>
              <ApperIcon name="FolderX" size={15} />
              Stop using that folder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <ApperIcon name="Upload" size={15} />
            Restore from backup…
          </DropdownMenuItem>
          <div className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
            {`Drawings are saved in this browser on this computer. A backup is made automatically each week when you open the app (if a folder is set) — otherwise this button turns amber after ${BACKUP_EVERY_DAYS} days. Restoring adds or updates jobs; it never deletes any.`}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
