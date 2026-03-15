import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  publicDir: 'static',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('chroma-js')) return 'vendor-chroma';
          if (id.includes('@fortawesome')) return 'vendor-fontawesome';
          if (id.includes('@web.awesome.me')) return 'vendor-webawesome';
        },
      },
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8787' }
  }
});
