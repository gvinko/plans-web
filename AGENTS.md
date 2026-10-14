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

## Sheet metal network (built 14 Oct 2026)

- Runs are sketch items `{ kind: 'smduct', pts, w, h, air, sheetLen, a?, b? }`.
- `a` / `b` tie the start and end to one of:
  - a part connection: `{kind:'port', itemId, portId}`
  - another run's end: `{kind:'run', id, end}`
  - the side of a run, as a branch: `{kind:'side', id, seg, t}`
- Always read live points through `smPts(s, ctx)`, never `s.pts` directly, because tied ends follow what they're tied to.
- Fittings are worked out on the fly by `smEndFittings()`: transition, branch take-off (shoe), square-to-round, and bend at angled joins. Nothing stores them.
- Same-size runs that meet end to end are merged into one run by `smMerge()`.
- `smNetworks()` groups runs and parts into systems.
- Dampers and fans (`SM_INLINE`) drop into a run, and spigots (`SM_SIDE`) onto its side, via `smSeat()`. The part stores `item.onRun` and moves with the run.
- Ctrl + drag a run, or use the panel button, to disconnect it (`smBake` / `smDetachOthers`).
- PDF: Export PDF lets you pick A3 or A4 and 1:20 to 1:200 (`PAPER`, `PRINT_SCALES`, `exportPdf`). The fan schedule prints beside the plan.

## Shop-drawing detail (added 15 Oct 2026)

- Run fields (all optional, old drawings unaffected): `bend` ('square' default | 'radius'), `bendR` (1 | 1.5 × W), `vanes` (0/2/3), `trKind` ('con' | 'flatL' | 'flatR') and `taper` (4 | 7) for a transition at a tied end, `ls` and `elev` (label text only).
- `smLayout()` gives the centre-line path (radius bends as arcs) and the straight part of each segment. `smPieces()` cuts those into stock sheet lengths (`sheetLen`) — shown in the run panel and the BOM note.
- Eccentric reducers: `smEccShift()` moves the tied end sideways so one edge runs straight. `smPts()` applies it.
- "Add reducer" in the run panel calls `smSplit()`: the run splits at a distance from its start and the far part takes the new size. Ties and parts on the far part move with it.
- New parts: `flexconn` (flexible canvas connection, drops into a run like a damper) and `rafilterbox` (R/A filter box: face size, filter grade, spigots or a rect neck `rfbNeck`).

## Testing builds

- The CI workflow also pushes each built `dist` to the `build-preview` branch.
- Serve it locally to click-test with a headless browser before telling Gerad it works.

## Wish list (do one at a time, only when asked)

1. Airflow: give each system an airflow (from the fan duty or grille L/s), then show L/s and velocity on each run, and suggest duct sizes (section 5 of Gerad's spec).
2. Duct board (PolyPlan) and spiral duct as run materials.
3. Manufacturer equipment catalogue with real port positions (Daikin / Fujitsu / Mitsubishi / Rinnai / Fantech).
4. Vector PDF (the current PDF comes from the browser's print view, which is already sharp but not a CAD file), plus DXF export.
5. Commercial rates for the bill of materials.
