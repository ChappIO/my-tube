import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteError } from './components/shell/RouteError';
import { routeTree } from './routeTree.gen';
import '@fontsource-variable/archivo/wght.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles.css';

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  // A route that throws while rendering gets a plain error line with Retry, inside the shell.
  defaultErrorComponent: RouteError,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
