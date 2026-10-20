# Ductplanner

HVAC duct design, takeoff and workshop drawings for Echo Air Conditioning, for domestic and commercial jobs.
Moved off Apper on 14 Oct 2026. There is no login and no cloud database. Everything saves in the browser on your computer.

## Run it on your computer

1. Install Node.js 20 or newer (https://nodejs.org).
2. In this folder run:
   ```
   npm install
   npm run dev
   ```
3. Open the address it prints (usually http://localhost:5173).

## Put it online for free (GitHub + Cloudflare Pages)

1. Create a new **private** GitHub repo, e.g. `gvinko/ductplanner`, and push this folder to it.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Use these build settings:
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. Deploy. Every push to `main` redeploys automatically.

`public/_redirects` makes page refreshes work on Cloudflare.

## Where drawings are saved — read this

- Drawings, plans and site photos are stored in **this browser, on this computer, for this web address only**.
- Always open the **same address**, e.g. `https://ductplanner.pages.dev`. Cloudflare's per-branch preview addresses (`xxxx.ductplanner.pages.dev`) each have their own empty storage.
- Don't clear browsing data / site data for that address. The app asks the browser to keep its storage permanently.
- Chrome and Edge on Windows work best, because they can save backups straight into a folder.

## Backups (top-right "Backup" button)

- **Back up now (zip):** one zip holds every project, level, drawing, plan image and site photo.
- **Choose backup folder:** pick your **Dropbox** folder. Every backup then goes straight into Dropbox, so it's off the computer as well.
- **Weekly:** when you open the app and the last backup is 7+ days old, it saves a backup into that folder automatically. If the browser needs you to OK the folder again, the button turns **amber ("Backup due")**. Click it, then Back up now.
- **Restore from backup:** pick a backup zip. Restoring **adds or updates** jobs. It never deletes anything already in the app.
- Inside the zip, `jobs/<Customer>/<Level>.json` is a readable copy of each drawing. `backup.json` plus `files/` is what Restore uses.

## Code map

Repair QA uses Node 22.19+ and disposable browser data:

```sh
npm ci --ignore-scripts --no-fund
npx playwright install chromium
node scripts/fetch-rollback-baseline.mjs
npm run build
npm test
npm run audit:security
npm run audit:lighthouse
```

The baseline download is an immutable existing preview, used only for local rollback tests.
The Lighthouse command retains three mobile reports in `.lighthouseci`; CI uploads them.
See `docs/RELEASE_CHECKLIST.md` before any production release.

| File | What it is |
|---|---|
| `src/components/DrawingWorkspace.jsx` | The whole drawing screen: parts catalogue, ducts, sketch tools, BOM, checks, PDF |
| `src/components/HvacSymbol.jsx`, `UnitSymbol.jsx` | Plan symbols |
| `src/pages/Phase1.jsx` | Projects list (create / open / delete), levels |
| `src/services/localDb.js` | On-device storage (IndexedDB via Dexie). Same `sdk.table()` / `sdk.storage` calls the Apper version used |
| `src/lib/backup.js`, `src/components/BackupMenu.jsx` | Backup zip, Dropbox folder, weekly reminder, restore |
| `src/lib/heatLoad.js`, `src/lib/autoLayout.js` | Heat loads and auto duct layout |
| `src/data/*` | Ducted / split models, pipe sizing |

## Changes since the last Apper version

- Parts draw at their real size once the plan scale is set. Before then, small parts still get a minimum size so they're easy to tap.
- Wall grilles, louvres, transfer and door grilles are drawn as a thin in-wall strip with angled blades. Supply wall grilles show a throw arrow.
- New **Transition (sheet metal)** fitting under Fittings. You type the inlet, outlet (W x H, or one number for round) and length. It draws the real tapered shape, concentric or eccentric, and goes on the bill of materials.
