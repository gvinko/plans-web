import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import Projects from '@/pages/Projects';
import { requestPersistence } from '@/services/db';

export default function App() {
  const [persisted, setPersisted] = useState(null);

  useEffect(() => {
    requestPersistence().then(setPersisted);
  }, []);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="dp-noprint flex items-center gap-2 border-b border-border bg-card px-4 py-2">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-6" />
        <span className="font-semibold">Ductplanner</span>
        <span className="ml-auto text-[11px] text-muted-foreground" title="Jobs are kept in this browser on this computer. Use Backup to copy them elsewhere.">
          {persisted === false ? 'Stored on this computer · use Backup regularly' : 'Stored on this computer'}
        </span>
      </header>
      <Projects />
      <Toaster richColors position="top-center" />
    </div>
  );
}
