# Rollback procedure

Known production baseline: `a794d8f33f15972d4785860ab03805d56faf2c53`, Cloudflare deployment
`09cfaca3-989a-4c73-98ae-5a59b8927160`, immutable URL `https://09cfaca3.plans-web.pages.dev`.
Its existence and successful canonical status were verified through Cloudflare's read API.
An actual rollback API rehearsal has since passed on a separate disposable Pages project
using immutable-build proxies and the retirement overlay. See
[current evidence and limitations](audits/RELEASE_PREPARATION_20261020.md).
The real production rollback package/overlay delivery remains unverified. A local same-origin
swap to the immutable baseline artifact with a retirement overlay also passed; see below.

1. Ask users to keep working tabs open and use Backup > Back up now while the app is available.
   Never clear site data, delete IndexedDB, rename the database or restore into an empty database.
2. In Cloudflare Pages > plans-web > Deployments, restore the known successful production deployment.
   Alternatively revert the repair merge on main and let the normal build deploy. Do not force-push main.
   This production step is a future procedure, not authorized by the disposable rehearsal.
   First prepare and verify step 3's overlay; restoring the old deployment alone lacks it.
3. Keep `/sw.js` available to retire the legacy worker. For a rollback after the new worker shipped,
   serve a retirement script at `/offline-sw.js` which unregisters itself and does not delete storage,
   navigate tabs, or call skipWaiting during an active drawing session. Existing open tabs can close
   naturally; avoid forced reloads with unsaved work.
4. Verify the production canonical commit, asset HTTP responses and MIME types. In a disposable
   context, check a populated drawing, reload, Save, ZIP restore and offline-to-online behaviour.
5. Verify existing browser records remain readable at the original production origin. Use a backup
   only with the user's explicit intent: established restore merges and overwrites matching IDs.

Before release, rehearse the above on a disposable preview and record before/after IDs and drawing
bytes. A baseline deployment existing is not proof that service-worker rollback was tested. Database
and backup format were unchanged, so rollback does not require a destructive data migration.

## Executed local rehearsal (continuation)

Run `node scripts/fetch-rollback-baseline.mjs`, `npm run build`, then `npm test`.
`tests/rollback.spec.js` serves the current build and downloaded immutable baseline at one disposable
localhost origin. Its populated drawing and PNG records match byte-for-byte after rollback; the
baseline app reopens and saves them. The waiting worker does not interrupt an active drawing tab.
Baseline asset hashes and before/after records are attached as `rollback-evidence.json` in CI artifacts.

The tested overlay is `public/offline-sw-retire.js`, served **at `/offline-sw.js`** during rollback
with JavaScript MIME and `Cache-Control: no-cache`. Its source filename alone does not retire a worker.
It waits for tabs to close naturally, unregisters on activation, and deletes no caches or records.
A simple Cloudflare rollback to the original deployment lacks this new worker URL: prepare and verify
the overlay on a disposable hosted deployment before approving a production rollback plan.
