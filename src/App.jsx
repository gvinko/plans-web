import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { router } from '@/router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import UpdateBanner from '@/components/UpdateBanner';

export default function App() {
  return (
    // No TooltipProvider: nothing uses tooltips, and it pulled Radix's popper into the first load.
    // Wrap the app in <TooltipProvider> from '@/components/ui/tooltip' again if tooltips are added.
    <ThemeProvider>
      <RouterProvider router={router} />
      <UpdateBanner />
      <Toaster position="top-right" richColors closeButton duration={3000} />
    </ThemeProvider>
  );
}
