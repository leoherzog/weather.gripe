import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  publicDir: 'static',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-maplibre': ['maplibre-gl'],
          'vendor-chroma': ['chroma-js'],
          'vendor-fontawesome': [
            '@fortawesome/fontawesome-svg-core',
            '@fortawesome/pro-solid-svg-icons'
          ],
          'vendor-webawesome': [
            '@awesome.me/webawesome-pro/dist/webawesome.js',
            '@awesome.me/webawesome-pro/dist/styles/webawesome.css',
            '@awesome.me/webawesome-pro/dist/components/button/button.js',
            '@awesome.me/webawesome-pro/dist/components/button-group/button-group.js',
            '@awesome.me/webawesome-pro/dist/components/input/input.js',
            '@awesome.me/webawesome-pro/dist/components/icon/icon.js',
            '@awesome.me/webawesome-pro/dist/components/card/card.js',
            '@awesome.me/webawesome-pro/dist/components/skeleton/skeleton.js',
            '@awesome.me/webawesome-pro/dist/components/callout/callout.js',
            '@awesome.me/webawesome-pro/dist/components/tooltip/tooltip.js'
          ],
        },
      },
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8787' }
  }
});
