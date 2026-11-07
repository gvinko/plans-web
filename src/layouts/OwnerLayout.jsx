import { Link, Outlet } from 'react-router-dom';
import BackupMenu from '@/components/BackupMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ECHO_LOGO } from '@/assets/echoLogo';

export default function OwnerLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-[var(--spacing-header)] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/ductplanner-mark.svg" alt="" aria-hidden="true" className="size-8" />
            <span className="font-heading text-base font-semibold text-foreground">Ductplanner</span>
          </Link>
          <span className="hidden sm:block h-6 w-px bg-border" aria-hidden="true" />
          <img src={ECHO_LOGO} alt="Echo Air Conditioning" className="hidden sm:block h-8 w-auto rounded-sm bg-white px-1" />
          <div className="ml-auto flex items-center gap-2">
            <BackupMenu />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
