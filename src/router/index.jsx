import { Navigate, createBrowserRouter } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import RootLayout from '@/layouts/RootLayout';
import OwnerLayout from '@/layouts/OwnerLayout';
import { Loader2 } from 'lucide-react';

const PageLoader = () => (
  <div className="h-screen flex items-center justify-center bg-background">
    <Loader2 className="size-8 animate-spin text-muted-foreground" />
  </div>
);

const Projects = lazy(() => import('@/pages/Phase1'));
const NotFoundPage = lazy(() => import('@/pages/NotFound'));
const wrap = (C) => <Suspense fallback={<PageLoader />}><C /></Suspense>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { element: <OwnerLayout />, children: [{ index: true, element: wrap(Projects) }] },
      // Old Apper address — kept so existing links still land on the projects list.
      { path: 'phase1', element: <Navigate to="/" replace /> },
      { path: '*', element: wrap(NotFoundPage) },
    ],
  },
]);
