import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  }, // relative paths — required for Cloudflare Pages sub-path safety
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Plandroid Web — HVAC Duct Design & Takeoff',
        short_name: 'Plandroid',
        description: 'Offline-first HVAC duct design, takeoff, and quoting tool',
        start_url: '.',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        orientation: 'landscape',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + all built assets precached. No network calls ever attempted —
        // this is a pure cache-first offline app, not a stale-while-revalidate one.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [],
      },
    }),
  ],
  worker: {
    format: 'es', // for the PDF-render / calc web workers added in later phases
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
