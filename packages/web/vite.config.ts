import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  server: {
    port: 5173,
    // The API is always reached under /api, in development via this proxy and in
    // production because Nest serves both. No CORS anywhere.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
