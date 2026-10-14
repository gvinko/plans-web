import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/error-boundary';

// Single-user app on this computer: no login, every page is open.
export default function RootLayout() {
  return (
    <ErrorBoundary fullPage>
      <Outlet />
    </ErrorBoundary>
  );
}
