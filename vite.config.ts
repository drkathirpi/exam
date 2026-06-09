import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// base: './' produces a fully relative build so the SAME dist/ works unmodified
// on GitHub Pages (served from /<repo>/) and on Cloudflare Pages (served from /).
// Combined with HashRouter, deep links never 404 on refresh on either host.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
