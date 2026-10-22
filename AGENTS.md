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
- Sheet length defaults to 2400 (`SM_DEFAULT_SHEET`); each straight is 2400s plus one balance piece.
- Duct sizing: `smAirflow(L/s, w, h)` gives velocity and friction (Altshul–Tsal on equivalent diameter). `smSuggest()` gives the smallest width per depth for the run's `sizeBy` rule (`SM_SIZING`: standard 1.0 Pa/m max 6 m/s, quiet 0.8 Pa/m max 4 m/s). Shown in the run panel and the Checks tab ("Duct sizing").
- New parts: `flexconn` (flexible canvas connection, drops into a run like a damper) and `rafilterbox` (R/A filter box: face size, filter grade, spigots or a rect neck `rfbNeck`).

## Added 15 Oct 2026

- The toolbar is one compact row. `compact` state (H key) hides the parts library, and hides the right panel when nothing is selected.
- Run materials: `s.mat` is 'sheet' | 'spiral' | 'board' (`SM_MATS`, `smMat`, `smDims`, `smRunName`).
- End caps: `s.capA` / `s.capB` (E key, `toggleCaps`).
- Snap-in transitions: a `transition` part dropped near an open run end is placed by `smSeatTransition` / `fitTransition` (X key), and the run end is tied to its 'w' port. New runs started on its 'e' port take the outlet size.
- Inline exhaust fans fitted in a run draw a flexible canvas connection each side (`item.canvas`, C key), and these are counted in the BOM.
- DXF export: `src/lib/dxf.js` plus `exportDxf()` (Ctrl+Shift+E). Output is R12, in mm, with layers per kind.

## Testing builds

- The CI workflow also pushes each built `dist` to the `build-preview` branch.
- Serve it locally to click-test with a headless browser before telling Gerad it works.

## Wish list (do one at a time, only when asked)

1. ~~Airflow, stage 2~~ — done 22 Oct 2026, see below.
2. Duct board (PolyPlan) and spiral duct as run materials.
3. Manufacturer equipment catalogue with real port positions (Daikin / Fujitsu / Mitsubishi / Rinnai / Fantech).
4. Vector PDF (the current PDF comes from the browser's print view, which is already sharp but not a CAD file), plus DXF export.
5. Commercial rates for the bill of materials.

## Drawing tools and selection (16 Oct 2026)

- With a drawing tool on (e.g. SM duct), pressing a part's free duct connection starts a run from it; pressing the part body moves it. A tap (no drag) with SM duct on selects the run or part under it. Don't go back to "any press on a part starts drawing" — it stopped parts moving.
- The toolbar and the hint line under it keep the same height whatever is selected (controls go `invisible`, not removed), so the drawing doesn't jump under the pointer.
- The Rotate button and connection dots on a selected part sit clear of it, so small parts (transitions) can still be grabbed.
- To test a branch before it goes live: run the "Build Ductplanner" workflow on that branch (Actions → Run workflow). It publishes the build to the `build-check` branch.

## Tap-by-tap sheet metal runs (19 Oct 2026)

- `smChain` holds where the next segment of the run being drawn starts (`end` of a run, a `port`, or a `free` point). Each tap adds a bend to the same run (no joining separate runs); `smChainAt()` gives its live point and `smDraftEnd()` the 0/45/90° snap. Clicking back on the run (last point or anywhere along it), a double-click, Esc / Enter, or ending on a connection finishes it and returns to Select (D to draw the next run) — don't make it keep drawing after a finish.
- With Material set to sheet metal, spiral or duct board, dragging or tapping a part's duct connection draws one of these free runs (not a squared-off part-to-part duct). Old squared-off sheet ducts have "Make free run (45° bends)" in their panel (`convertConnToRun`).

## Unit sizes (19 Oct 2026)

- `src/data/unitDims.js` holds spec-sheet H x W x D (mm) for the costing-sheet ducted units, indoor and outdoor, matched by regex on the model name (first match wins). `indoorPreset()` and `pairOutdoor()` use it, and fall back to the series outline when a model isn't listed (ActronAir Aires 10/20/23, Braemar, old R410a Fujitsu big units).
- `src/data/ductedModels.js` was refreshed from Echo DOMESTIC costings 11-10-26 (Ducted tab, unit groups only). Model names in saved drawings are unchanged.

## Drawing style (19 Oct 2026 review) — keep it like a CAD mechanical plan

- Annotation is sized in paper mm at the print scale: `ann(paperMm, fallbackPx)` (print scale picked in Export PDF, else 1:50). Tags 2.5 mm, duct sizes 2 mm. Don't go back to fixed screen-pixel text that balloons or shrinks with zoom.
- Design view (default) shows a run as tinted fill + edge with one size tag `300×200` (RA/EA/OA prefix), centred in the duct in the longest stretch clear of parts (`clearSeg`). No length, piece count, piece numbers, shading, centre line or TDF ticks there.
- TEXT control: `textStyle` {size multiplier (default 0.7), color ('' = default)} saved with the drawing; `ann()` applies the size, labels and duct tags use the colour.
- SHOP toggle (`showFab`, saved with the drawing) turns on sheet pieces, numbers, TDF joints, centre line, lengths and transition sizes.
- Parts draw as plain white outlines once the plan is to scale (no app-tile shadow / rounding).
- Known gap: parts rotate in 90° steps, so a transition or fan on a sloped run won't line up. Keep runs at 0/45/90 near parts.

## Parts, layout and tools (19 Oct 2026 evening)

- Dampers / fans / flex connections fit into sheet metal runs at any angle (`smSeat`, rot in degrees) and also when first dropped on a run (`addItem` → `seated()`). `portInfo` and `itemBox` round rot to 90° steps; angled parts rotate as a whole box. VCD casing is 150 mm along the run.
- Canvas connections: `canvasJoints` (either side of a fan fitted in a run, and where a run ends on a fan's port), on by default, counted in the BOM.
- Every part panel: W × D × H (`dims`, `heightMm`), `airflow`, `model`, `supplier`, `notes`, and `hideLabel`. Runs: `hideTag` hides the size tag. Per-tag colour: part `labelColor`, run `tagColor` ('' / undefined = follow TEXT colour), picked with `TagColourPicker` in the part / run panel. TEXT menu has "Tap tags to hide them" (`tagErase`, not saved) and "Show N hidden tags".
- Page layout in Export PDF (`layout`: orient, side beside/below/none, title, page2), plan window from `planBox()`. Pick slip editor (`pickEdit`: rows, deliver, needed, po, notes; Reset from drawing). Both saved with the drawing.
- Title bar is sticky under the app bar; toolbar + hint line are sticky below it (one row, scrolls sideways when narrow).
- PDF legend: top of `.dp-side-list`, only the part types and duct services used.
- Title block: `DESIGNER` details, `DRAWING_KINDS` issue stamp + note (`layout.kind`), `layout.dwgNo`, `layout.refs` ("Read with"). Logo is `src/assets/echo-logo.png` via `ECHO_LOGO` (the old inline base64 was corrupt); also shown in the app bar.
- Eraser tool (Q, `eraseAt`). Select all (Ctrl+A, `allSel`) + `rotateAll` (R / Shift+R) turns everything 90° about the drawing centre; the plan image stays put.

## Airflow stage 2 (22 Oct 2026)

- `src/lib/airflow.js` `networkAirflow()` treats each sheet metal system as a tree rooted at its unit (role `unit`/`section`) or, with no unit, an inline exhaust fan. A run's L/s = the sum of the terminals downstream of it (side branches count upstream). Past the last grille to a louvre / roof cowl (`anyTerm`), a run carries the whole system. No unit or fan → no auto figure.
- Terminal L/s: typed `item.airflow` first, else (supply outlets only) the room's load × `LPS_PER_KW` split between the supply outlets inside that room / zone area.
- `runLs(s)` in DrawingWorkspace: typed `s.ls` wins, else the auto figure. Sizing in the run panel and the Checks tab use it. Plan annotation still shows typed L/s only.
- Flex (domestic) ducts are not covered — the auto layout already sizes those.
- Tests: `node --test test/airflow.test.mjs`.
## Heat load: windows, glazing, walls (22 Oct 2026)

- `hl.windows` [{orient, glass, shading}] per room. Rooms saved before this keep one window in `hl.orient` / `hl.glass` / `hl.shading` and calculate exactly as before; the first edit in the Windows list saves `hl.windows`.
- `hl.glazing` ('single' default, 'double') and `hl.wallType` (`WALLS`, 'standard' default = the old U 0.6) in `src/lib/heatLoad.js`. Defaults reproduce the old numbers.
- Tests: `node --test test/heatload.test.mjs`.
