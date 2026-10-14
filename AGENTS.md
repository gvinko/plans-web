# Notes for any AI working on this repo (Claude, ChatGPT/Codex, etc.)

Owner: Gerad (Echo Air Conditioning). He's an HVAC sales and design engineer, not a programmer. Keep replies short and plain.

## Ground rules

1. **GitHub `main` is the single source of truth.** Before changing anything, pull the latest. Never work from an old zip or from memory of the code. Two AIs take turns on this repo.
2. **Never lose drawings.** Don't change the IndexedDB database name (`ductplanner`), table names, or the saved field names (`drawingJson_c`, `planFile_c`, `sitePhotos_c`, `projectId_c`) without a Dexie version upgrade that migrates old data. Don't change the backup zip format (`backup.json` with `app: 'Ductplanner'`, `files/<key>`) in a way old backups can't restore.
3. Free tools only: no paid services, and no backend unless Gerad asks.
4. Make the smallest change that does the job. Don't rewrite whole files or swap libraries (no Fabric.js / TypeScript migration).
5. After each change, run `npm run build`, then tell Gerad what changed in one or two lines and give him the live link.

## How the app is built

- React 19 + Vite + Tailwind 4 + shadcn/ui (in `src/components/ui`).
- The drawing is plain SVG in `src/components/DrawingWorkspace.jsx`, in world units. `ppm` = world units per metre (set by "Set scale").
- Parts catalogue is the `CATALOG` array near the top of DrawingWorkspace.jsx:
  - Each part has `type`, `label`, `tag`, `role` and `specs`.
  - Footprint size in mm comes from `footprintMm()`.
  - Duct connection points come from `portDefs()`.
  - Symbols are in `renderSymbol()` and `HvacSymbol.jsx`.
- Roles: `unit`, `supplyTerm`, `supplyFit`, `returnTerm`, `returnFit`, `exhaustTerm`, `anyTerm`, `fit`, `none`. `resolveDuct()` uses them to stop wrong joins.
- Duct types: `DUCT_TYPES` covers supply, return, flex, exhaust and outside air. Sheet metal material is `conn.material === 'sheet'` with `w`/`h`.
- Freehand sketch elements are in `sketch[]`: wall, room, text, dim, pin, `smduct` (sheet metal run with `pts`) and `callout`.
- The bill of materials is the `takeoff` useMemo, grouped by catalogue group.
- Storage is `src/services/localDb.js`. Backup is `src/lib/backup.js`.

## Wish list (Gerad's spec, do one at a time, only when asked)

1. Sheet metal runs snap end-to-end and to fittings, and automatically add the elbow or transition where they meet.
2. Link spigots to the sheet metal run they sit on, so airflow checks include them.
3. Drag individual bend points on a sheet metal run.
4. Vector PDF export at a set print scale. The old repo `gvinko/plans-web` has a working one in `src/lib/pdf/` worth porting.
5. Fan schedule table (EF-1, EF-2 …) on the PDF.
6. Commercial rates for the bill of materials.
