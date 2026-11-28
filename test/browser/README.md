# Reliability browser regression

This is an optional Chromium/Playwright test. It creates a fresh browser context with a synthetic project, 12 levels and 19 duct runs per populated level. It never opens a live deployment or uses existing drawings. Run the unit tests with `npm test`, build with `npm run build`, then serve `dist` locally, for example:

```sh
python3 -m http.server 18749 --bind 127.0.0.1 --directory dist
```

In a second shell (Playwright/Chromium must already be installed):

```sh
node test/browser/reliability-smoke.mjs
```

If Playwright is installed in another existing workspace, set `PLAYWRIGHT_MODULE` to its `index.mjs` path. The optional `DP_TEST_URL` must be a loopback URL. The test covers offline cold reload, persisted level selection, keyboard selection, pointer cancellation, calibrated DXF radius/joint export, offline PDF import and preserving unrelated caches.
