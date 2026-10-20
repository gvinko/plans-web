# Rollback procedure

Known production baseline: `a794d8f33f15972d4785860ab03805d56faf2c53`, Cloudflare deployment
`09cfaca3-989a-4c73-98ae-5a59b8927160`, immutable URL `https://09cfaca3.plans-web.pages.dev`.
Its existence and successful canonical status were verified through Cloudflare's read API.
No actual rollback was executed; that release gate remains open.

1. Ask users to keep working tabs open and use Backup > Back up now while the app is available.
   Never clear site data, delete IndexedDB, rename the database or restore into an empty database.
2. In Cloudflare Pages > plans-web > Deployments, restore the known successful production deployment.
   Alternatively revert the repair merge on main and let the normal build deploy. Do not force-push main.
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
