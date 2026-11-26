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

// Loaded only when a delete is requested, so the dialog library isn't part of the first page load.
export default function DeleteProjectDialog({ target, deleting, onClose, onConfirm }) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this project?</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? `"${target.Name}" and all its levels will be permanently deleted. This can't be undone.` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); onConfirm(); }}>
            {deleting ? 'Deleting…' : 'Delete project'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
