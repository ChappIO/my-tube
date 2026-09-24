import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// Production builds leave out the /dev/* demo pages. The router plugin then writes a route
// tree without them to this file instead of src/routeTree.gen.ts, so the committed tree keeps
// the dev routes and a build never dirties the checkout.
const PROD_ROUTE_TREE = fileURLToPath(
  new URL('./node_modules/.tanstack-router/routeTree.gen.ts', import.meta.url),
);

/** Points main.tsx's `./routeTree.gen` import at the production route tree. */
function productionRouteTree(): Plugin {
  return {
    name: 'mytube:production-route-tree',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './routeTree.gen' && importer?.endsWith('/src/main.tsx')) {
        return PROD_ROUTE_TREE;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    mode === 'production'
      ? [
          tanstackRouter({
            target: 'react',
            autoCodeSplitting: true,
            // Matches the `dev` directory entry, which drops everything under src/routes/dev.
            routeFileIgnorePattern: '^dev$',
            generatedRouteTree: PROD_ROUTE_TREE,
          }),
          productionRouteTree(),
        ]
      : tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  server: {
    port: 5173,
    // The API is always reached under /api, in development via this proxy and in
    // production because Nest serves both. No CORS anywhere.
    proxy: {
      // API_PORT lets several checkouts run side by side (one API per worktree).
      '/api': `http://localhost:${process.env.API_PORT ?? '8080'}`,
    },
  },
}));
