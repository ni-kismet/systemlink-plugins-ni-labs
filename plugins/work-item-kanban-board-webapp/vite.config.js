import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: './',
  build: {
    cssMinify: 'esbuild',
    outDir: '../dist/webapp/browser',
    emptyOutDir: true,
  },
});
