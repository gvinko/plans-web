import { createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small controlled dialog with the same API the app uses (open / onOpenChange).
const DialogCtx = createContext({ open: false, onOpenChange: () => {} });

function Dialog({ open = false, onOpenChange = () => {}, children }) {
  return <DialogCtx.Provider value={{ open, onOpenChange }}>{children}</DialogCtx.Provider>;
}

function useDialogShell(dismissible = true) {
  const { open, onOpenChange } = useContext(DialogCtx);
  const ref = useRef(null);
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        changeRef.current(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => {
      const el = ref.current?.querySelector('[autofocus], input, select, textarea, button');
      (el || ref.current)?.focus?.();
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, dismissible]);
  return { open, onOpenChange, ref };
}

function DialogContent({ className, children, showCloseButton = true, ...props }) {
  const { open, onOpenChange, ref } = useDialogShell(true);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden"
          >
            <X size={16} />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />;
}

function DialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

function DialogTitle({ className, ...props }) {
  return <h2 className={cn('text-lg leading-none font-semibold', className)} {...props} />;
}

function DialogDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogCtx, useDialogShell };
