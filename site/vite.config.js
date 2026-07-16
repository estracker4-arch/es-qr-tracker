import { defineConfig } from 'vite';

// Served by the app's Express server under /site/
export default defineConfig({
  base: '/site/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
