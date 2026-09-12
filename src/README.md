# Plandroid Web — Phase 1

Zero-backend HVAC duct design/takeoff/quoting PWA.

## Local dev
```
npm install
npm run dev
```

## Cloudflare Pages deploy settings
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` (or the repo subpath if monorepo)
- Node version: 20+ (set `NODE_VERSION=20` env var)

## Phase 1 scope
- Vite + React + TS + Tailwind scaffold
- `vite-plugin-pwa` — offline-first service worker, no runtime network caching (by design: zero cloud dependency)
- Dexie (IndexedDB) schema covering the full domain: `Project`, `PlanPage`, `DuctRun`, `Fitting`, `Terminal`, `Equipment`, `CostItem`
- Repository layer (`src/db/repository.ts`) — CRUD isolated from components

## Phase 2 scope (this delivery)
- `CanvasEngine` (`src/lib/canvas/CanvasEngine.ts`) — Fabric.js v6 wrapper, framework-agnostic:
  - Pan: middle-mouse drag, or spacebar + left-drag, or dedicated Pan tool
  - Zoom: mouse wheel, zooms to cursor position, clamped 5%–2000%
  - Calibration: click-click capture in canvas coordinate space, draws a live dimension line + marker, hands the two points back to React
- Floor plan import (`src/lib/floorplan`, `src/lib/pdf`) — drag-and-drop or file-picker, PNG/JPG/WEBP loaded directly, PDF page 1 rasterized client-side via `pdfjs-dist` at 2x scale (~144dpi)
- `CalibrationModal` — prompts for real-world distance in mm after the 2nd click; on confirm, `repository.setPageScale` computes and persists `pxPerMm` on the active `PlanPage`
- Autosave — canvas state (`fabric.Canvas#toJSON`) debounced 600ms into `PlanPage.canvasJSON` on any object add/modify/remove
- `appStore` (Zustand) — active project/page/tool selection only; all persisted data stays in Dexie

## Phase 3 scope (this delivery)
- HVAC symbol catalog (`src/lib/catalog`) — Fan Coil Unit, Supply/Return Plenum (configurable branch count), 3 diffuser/grille types, Straight Coupling, Reducer, 90°/45° Elbow. Built from Fabric primitives (not parsed SVG strings) so port coordinates and Fabric's native `.toSVG()` export stay exact and version-stable; visually and functionally these are the same vector icons, just constructed in code instead of round-tripped through an SVG parser.
- Port model (`src/lib/catalog/types.ts`, `src/lib/canvas/ports.ts`) — every component/duct carries `PortDef[]` in local (object-center-relative) coordinates; `getWorldPorts()` resolves live canvas position via Fabric's transform matrix, so ports stay correct through pan/zoom/rotate/drag.
- Rigid duct tool (`src/lib/canvas/ductDrawing.ts` + `ductGeometry.ts`) — 2-click segment draw, W×D from the floating toolbar, true-to-scale via the page's calibrated `pxPerMm`, rendered as a stroked (double-line) rectangle with a size label.
- Flex duct tool — 2-click bezier curve with sampled corrugated rail + rib rendering, diameter-driven envelope width.
- Magnetic snap (`src/lib/canvas/snapping.ts`) — dragging a duct/fitting within 15 screen-px of a compatible port rotates it to face the target port and locks position exactly; duct-drawing clicks also snap directly onto nearby ports (e.g. a plenum branch or diffuser neck) as you draw.
- `ComponentPalette` / `DuctToolOptions` — catalog sidebar (click item, then click canvas to place) and duct-dimension inputs.

## Not yet wired (expected gaps, not bugs)
- Snap connections aren't yet written back to `DuctRun.connectedFromPortId`/`connectedToPortId` in Dexie — only tracked transiently as `plandroidSnappedTo` on the Fabric object. Phase 4's takeoff engine reads object geometry directly instead, so this still isn't blocking, but a proper connection graph would let future phases (e.g. auto-sizing) walk the system.
- No compile/runtime verification was possible in this sandbox (no network egress) — the snap engine's rotation math in particular should be visually smoke-tested first.

## Phase 4 scope (this delivery)
- Takeoff engine (`src/lib/takeoff/takeoff.ts`) — pure function over plain serialized Fabric object records: groups rigid duct by W×D, flex duct by diameter, and every catalog component (equipment/fitting/terminal) by id, using each line's first port's size as its representative "Size" column entry.
- Project-wide aggregation (`collectRecords.ts`) — reads every plan page's persisted `canvasJSON` directly (no Fabric canvas needed for pages that aren't open), substituting the currently active page's *live* in-memory state so the BOM doesn't lag behind the 600ms autosave debounce.
- **Correction to Phase 2/3 autosave**: Fabric's `toJSON()` silently drops any custom properties unless you explicitly list them. Our autosave was serializing plain shapes with no `plandroid` port/kind metadata at all — meaning every previously "saved" plan would have reloaded as dead geometry, invisible to snapping and to this takeoff engine. Fixed by passing `['plandroid', 'plandroidId']` to every `toJSON()` call (autosave and the BOM's live-canvas read). If you have any saved projects from before this phase, their placed components/ducts will need to be redrawn — the JSON that's already on disk doesn't have the metadata to recover.
- Costing persistence (`costSync.ts`) — reconciles takeoff output against Dexie's `CostItem` table (schema already had this from Phase 1): creates rows for new items, updates quantity on existing ones without touching their edited price/margin, deletes rows for items no longer on any page. Schema tweak: `CostItem.refType` widened from a narrow fitting/terminal union to `string` (it now holds takeoff keys like `"duct_rigid:400x250"`), and `marginPercent` added — both non-indexed field changes, no Dexie version bump needed.
- `BomPanel` + `CostingTable` — Item / Size / Qty / Unit Cost / Margin % / Total, editable inline, with a live grand total. Recomputes on open and again shortly after every autosave of the active page while the panel stays open, plus a manual Refresh button.
- Metric ⇄ US Customary toggle — persisted on `Project.unitSystem` (already in the Phase 1 schema), affecting the BOM's Size and Qty columns (mm→in, m→ft) and CSV export. **Scope boundary**: this does not retrofit the on-canvas duct size labels drawn in Phase 3 (those stay in mm regardless of the toggle), and it doesn't touch airflow (L/s↔CFM) or velocity (m/s↔FPM) conversions — no duct in this app currently stores an airflow or velocity value, so there was nothing real to convert; `src/lib/units.ts` includes `lsToCfm`/`msToFpm` ready for whichever future phase adds that data.
- CSV export (`exportCsv.ts`) — client-side `Blob` download, no server involved, matching every other export in this app.

## Deferred to later phases
_(none — Phase 5 below was the last planned phase; see "Not yet wired" sections above and below for real gaps)_

## Phase 5 scope (this delivery) — PDF export, Excel importer, ortho wall tracing

### PDF export (`src/lib/pdf`)
- `pageLayout.ts` — A3/A4 landscape page regions (drawing area / title block / legend) and the standard engineering scale list (1:20 … 1:500) with auto-fit selection.
- `fabricToPdf.ts` — walks the live Fabric scene (recursing into Groups) and draws each shape as a **genuine jsPDF vector primitive** (Rect/Circle/Line/Text/Path/Polygon), not a rasterized snapshot — the CAD content stays sharp at any print zoom, satisfying "vector-sharp" honestly rather than just cranking up a raster export's DPI. Our own `Path` objects (flex duct) only ever contain M/L commands by construction, so no curve-fitting was needed. The one raster element is the calibrated floor-plan background image itself (`renderImage`) — that's inherent to it being a photo/scanned page, and it's embedded directly from the `<img>` element Fabric already holds, no re-encoding.
- `titleBlock.ts` — bottom-right block (Project/Client/Address/System/Scale/Date/Revision/Designer/Notes) plus a north arrow.
- `legend.ts` — color key (rigid/flex/equipment/terminal) plus a **duct & fitting schedule** table sourced from the same `computeTakeoff()` used by the BOM. Deliberately not called an "airflow schedule": no duct object in this app tracks an airflow value (see the Phase 4 note above), so a real per-zone airflow table would need fabricated numbers. This shows real quantities/sizes instead.
- `exportDrawing.ts` — computes the print scale (auto-fit or manual), builds the canvas-px→page-mm transform, draws the sheet border + traced objects + title block + legend, returns the `jsPDF` document. `ExportDialog.tsx` collects title-block fields and calls `doc.save()` — entirely client-side, no network call anywhere in the chain.
- **Known limitation**: whatever is currently on the canvas gets exported, including the hand-sketch underlay if you've added one and haven't hidden/removed it. There's no "exclude from print" layer flag yet — a natural small addition if the sketch underlay needs to stay out of the final drawing.

### Feature 1 — Excel/CSV equipment & pricing importer (`src/lib/import`, `src/db/catalogRepository.ts`)
- `parseWorkbook.ts` reads `.xlsx`/`.csv` via SheetJS entirely client-side; `excelSchema.ts` does fuzzy header matching (`"Item Name/Model"`, `"Item"`, `"Model"`, `"Name"` all match) so real-world sheets don't need to match column names exactly.
- Three new **global** (not per-project) Dexie tables — `equipmentCatalog`, `ductworkCatalog`, `fittingsCatalog` — added via a version-2 schema bump in `db/index.ts`. Global rather than per-project because this is a reusable company price book, not a one-off job list; import it once, use it everywhere.
- **Pricing linkage is real, not decorative.** Rows classified as sheet-metal/duct don't become placeable blocks — they can't meaningfully represent "a duct" as a discrete item — instead `costSync.ts` matches their parsed dimensions against your drawn duct-run sizes and seeds that size's unit cost automatically. Rows classified as equipment/fittings/grilles become placeable catalog blocks (`importedSymbol.ts`, listed in `ComponentPalette` under "Imported Price Book"); their price is denormalized onto the placed object (`plandroidImportedMeta`) so `computeTakeoff()` can seed a BOM row without an async DB round-trip while walking canvas objects.
- Category classification (`classifyCategory` in `excelSchema.ts`) is a keyword heuristic (`fcu|condenser|...` → equipment, `duct|sheet metal` → ductwork, else → fittings) — real spreadsheets aren't standardized, so this only needs to be right for the categories your team actually uses; worth a quick check against your first real import.

### Feature 2 — Ortho-snap wall tracing (`src/lib/canvas/orthoSnap.ts`, `wallTracing.ts`, `wallDimensionEdit.ts`)
- Hand-sketch underlay is a **separate layer** from the calibrated floor-plan background (new `PlanPage.sketchImage`/`sketchOpacity` fields) — this is a genuinely different workflow (trace-to-construct a plan vs. draw over an already-accurate one), not a variant of Phase 2's background.
- `Trace Wall` tool: click a chain of points; each new segment snaps to the nearest 90° cardinal if within 15° (`orthoSnap.ts`); clicking within 20 screen-px of the first point closes the loop into a room polygon.
- **Dimension override, and how the "unscaled sketch" problem is actually solved**: click a wall edge of a traced room while in Select mode to pick it (edge-level picking on a single Polygon object — Fabric doesn't support sub-object selection natively, so this is custom nearest-edge hit-testing in `wallDimensionEdit.ts`). Then:
  - **If the page has no established scale yet**, the mm you enter for that wall *becomes* the calibration — exactly like the normal 2-point calibration tool, just using the wall's two rough-sketch endpoints as the reference. Nothing moves; the page's `pxPerMm` gets set from this wall's existing pixel length.
  - **Once a scale exists** (from that first wall, or from the normal calibration tool), dimensioning a wall genuinely resizes it: the wall's far endpoint moves to hit the exact mm you entered, and the *one* immediately-attached perpendicular wall (sharing that moving corner) translates to follow — preserving its own original length and angle, per the spec's "the wall and attached perpendicular walls" wording. This is a **local edit**, not a whole-loop solver: on a simple 4-wall rectangle it behaves exactly like a proper parametric resize (the far wall's length changes correctly to close the rectangle); on a complex polygon (L-shape, etc.) only the immediate neighbor adjusts, and you'd dimension the next wall around the loop separately if it also needs correcting. This was a deliberate scope decision reading "the wall and attached perpendicular walls" literally rather than building a full constraint solver.
  - **Known limitation**: the traced room's vertex array is stored in world/canvas coordinates at trace-completion time, not relative to the object's own transform. If you drag or rotate the whole room afterward (as a normal Fabric selection), that stored array goes stale relative to the object's new position — the intended workflow is trace → dimension immediately, not trace → move → dimension later.

## Overall known gaps across every phase
- Nothing in this repo has been `npm install`ed, built, or run — this sandbox has no network egress. The code is written against current-version APIs (Fabric v6 namespace-free imports, Dexie 4, current jsPDF/SheetJS) as accurately as I can without compiling, but a first local build is the real test.
- Snap connections (`plandroidSnappedTo`) and the schema's `DuctRun.connectedFromPortId`/`connectedToPortId` fields still aren't the same thing — the former is transient Fabric-object metadata, the latter is an unused Dexie field from the original Phase 1 schema. A real connection graph (useful for future auto-sizing) would unify these.

## Required assets before first deploy
`public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `favicon.svg` — not generated here (binary/art assets, out of scope for a code scaffold).
