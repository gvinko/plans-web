import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // relative paths — required for Cloudflare Pages sub-path safety
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [], // explicitly empty: zero external runtime fetches by design
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
