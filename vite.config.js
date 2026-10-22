import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// One id per build. The app carries it, and /version.json on the server says which build is live,
// so an open tab can tell when it's out of date (see src/components/UpdateBanner.jsx).
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12) || `local-${Date.now()}`;
const BUILT_AT = new Date().toISOString();

const versionFile = () => ({
  name: 'dp-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, builtAt: BUILT_AT }) });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __DP_BUILD__: JSON.stringify(BUILD_ID), __DP_BUILT_AT__: JSON.stringify(BUILT_AT) },
  build: { target: "esnext" },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
