import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogCtx, useDialogShell } from '@/components/ui/dialog';

// Confirm dialog: same open / onOpenChange API; clicking outside does not dismiss.
function AlertDialog(props) {
  return <Dialog {...props} />;
}

function AlertDialogContent({ className, children, ...props }) {
  const { open, ref } = useDialogShell(true);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function AlertDialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }) {
  return <h2 className={cn('text-lg font-semibold', className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function AlertDialogAction({ variant = 'default', size = 'default', onClick, ...props }) {
  const { onOpenChange } = useContext(DialogCtx);
  return (
    <Button
      variant={variant}
      size={size}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onOpenChange(false);
      }}
      {...props}
    />
  );
}

function AlertDialogCancel({ variant = 'outline', size = 'default', onClick, ...props }) {
  const { onOpenChange } = useContext(DialogCtx);
  return (
    <Button
      variant={variant}
      size={size}
      onClick={(e) => {
        onClick?.(e);
        onOpenChange(false);
      }}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
