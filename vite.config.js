import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

// One id per build. The app carries it, and /version.json on the server says which build is live,
// so an open tab can tell when it's out of date (see src/components/UpdateBanner.jsx).
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12) || `local-${Date.now()}`;
const BUILT_AT = new Date().toISOString();

// Generate the offline manifest after Vite has emitted every lazy chunk and PDF worker.
const offlineShell = () => {
  let config;
  return ({
  name: 'dp-offline-shell',
  apply: 'build',
  configResolved(resolved) { config = resolved; },
  closeBundle() {
    const root = path.resolve(config.root, config.build.outDir);
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(ent => {
      const file = path.join(dir, ent.name);
      return ent.isDirectory() ? walk(file) : [file];
    });
    const assets = walk(root).map(file => '/' + path.relative(root, file).split(path.sep).join('/'))
      .filter(url => url === '/index.html' || url === '/favicon.svg' || url.startsWith('/assets/'));
    const template = readFileSync(path.resolve(config.publicDir, 'sw.js'), 'utf8');
    writeFileSync(path.join(root, 'sw.js'), template.replace('/* BUILD_MANIFEST */ null', JSON.stringify({ build: BUILD_ID + '-' + BUILT_AT, assets })));
  },
  });
};

const versionFile = () => ({
  name: 'dp-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, builtAt: BUILT_AT }) });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile(), offlineShell()],
  define: { __DP_BUILD__: JSON.stringify(BUILD_ID), __DP_BUILT_AT__: JSON.stringify(BUILT_AT) },
  build: { target: "esnext" },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
