import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:8787' }
  }
});
