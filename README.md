# Plan2Print — Dollhouse Studio

A Next.js + React-Three-Fiber app that turns a traced 2D floor plan into an
FDM-print-ready dollhouse: manifold walls with door/window cutouts, a
removable roof with a slip-fit registration lip, printable miniature
furniture, and one-click STL/OBJ export at a real dollhouse scale.

> **Build status:** this sandbox has no network access, so `npm install` /
> `npm run build` could not be run here to verify compilation. The code is
> written against the documented three.js / three-bvh-csg / R3F APIs and is
> internally consistent, but treat first `npm install && npm run dev` as the
> real smoke test, and expect to fix the odd import path or type nit.

## Getting it running

```bash
npm install
npm run dev
```

Requires Node 18+. Open http://localhost:3000.

## Architecture

```
app/page.tsx              — layout: 2D canvas | 3D viewport | controls panel
components/
  BlueprintCanvas.tsx      — upload + calibrate + trace walls/openings (2D)
  Viewport3D.tsx            — R3F scene: live preview, click-to-place furniture
  Toolbar.tsx / ControlsPanel.tsx / FurniturePalette.tsx — UI chrome
store/
  floorPlanStore.ts         — zustand store, single source of truth (FloorPlanDocument)
lib/
  types.ts                  — all shared types + the coordinate-system contract
  coords.ts                 — canvas px <-> plan mm <-> three.js world units
  wallGeometry.ts            — CSG: fuse wall corners, punch door/window cutouts
  slabGeometry.ts            — baseplate + union helpers
  roofGeometry.ts            — procedural gable/hip/flat roof + registration lip
  furniture.ts                — low-poly furniture primitive library
  modelBuilder.ts             — orchestrates walls+slab+furniture(+roof) per print settings
  validate.ts                  — FDM printability pre-flight checks
  exportMesh.ts                 — resolves print scale, serializes STL/OBJ
  pdfLoader.ts                   — rasterizes an uploaded PDF's first page
```

### Coordinate system (read this before touching geometry code)

Three coordinate spaces, converted only in `lib/coords.ts`:

1. **Canvas space** — raw pixels on the `<canvas>` in `BlueprintCanvas.tsx`.
   Never leaves that file.
2. **Plan space** — real-world millimetres. This is the **single source of
   truth**, stored in `FloorPlanDocument` (walls, openings, furniture
   positions, roof settings all live here). Derived from canvas space via
   the calibration's `mmPerPixel`.
3. **World space** — three.js scene units. `WORLD_UNITS_PER_MM = 0.1`, purely
   to keep camera/controls distances in a comfortable range — it has **zero**
   effect on the exported model, because `exportMesh.ts` converts world units
   straight back to millimetres (`worldToMm`) before applying the actual
   print/dollhouse scale factor.

Everything downstream (CSG, furniture placement, roof generation) works in
world units derived directly from plan-mm, so the 3D scene is always a pure,
lossless projection of the plan document — never a second source of truth.

### CSG pipeline (the part that makes it print-safe)

`lib/wallGeometry.ts`:
- Each wall becomes a box **extended by its own half-thickness at both
  ends** before any union — this is what makes two walls meeting at a
  corner fuse into a solid miter instead of leaving a seam or gap.
- All wall boxes are unioned (`ADDITION`) into one brush.
- Every door/window becomes a cutter box **oversized through the wall's
  thickness axis** (2mm epsilon each side) so the subtraction never leaves
  a paper-thin, non-manifold skin on either face.
- All cutters are unioned together, then subtracted from the wall union in
  a single `SUBTRACTION` pass.
- The result is cleaned (`computeVertexNormals`, dropped UVs) before being
  hooked up to the baseplate.

`lib/slabGeometry.ts` unions the fused wall shell onto a baseplate box, so
**walls + floor slab export as one manifold, watertight print** — no loose
parts to align by hand.

`lib/roofGeometry.ts` builds each roof pitch as an independently-manifold
solid via a generic "extrude a 2D polygon along a right-handed 3D basis"
helper (`makePanelGeometry`) — this is what lets the same code produce
gable, hip, and flat roofs without hand-tuned rotation math per style. The
registration **lip** is a rectangular picture-frame ring hanging below the
roof underside, sized to the wall's inner footprint minus
`lipToleranceMm` (default 0.35mm) — a snug slip-fit on a typical 0.4mm-nozzle
Ender 3. Skylight/viewing-void cutouts are vertical drop-cutters subtracted
from the finished roof+lip union.

`lib/modelBuilder.ts` is the single place that decides, per
`PrintSettings.mergeMode`:
- **merged** — every furniture piece is CSG-unioned into the base shell
  (with the bathtub actually hollowed via a real `SUBTRACTION`, not just a
  visual notch) → one giant fused, watertight dollhouse.
- **loose** — furniture pieces don't intersect the shell, so they're just
  concatenated (`mergeGeometries`, no CSG needed) into a second file of
  independent, individually-manifold play pieces at the same scale.

The live 3D viewport does **not** run the full merged-furniture CSG pass on
every drag — that would stutter. It renders the fused wall+slab shell (CSG,
debounced 250ms) and furniture as plain, independently-transformed meshes.
The true merge only happens once, at export time, in `buildFullModel`.

### Print settings & scale

`exportMesh.ts` resolves one scale factor for the whole model — either a
named dollhouse preset (1:12 / 1:24 / 1:50 / 1:64) or, if
`targetBedWidthMm` is set (e.g. 220 for an Ender 3), a factor solved so the
plan's longest footprint side fits that bed. The **same** factor is applied
to the building and every furniture piece, so scale stays proportional
whichever mode you pick.

### Known scope cuts (documented, not hidden)

- **Registration lip** is a bounding-rectangle frame, so it's most accurate
  for rectilinear footprints; an L-shaped house gets a lip sized to its
  bounding box rather than tracing the exact inner perimeter.
- **Hip roofs** assume the footprint is wider (X) than deep (Y); a deeper-
  than-wide plan gets a warning and a simplified approximation.
- **Gable roofs** deliberately leave the two gable-end triangles open above
  the wall top (draw end walls up to the ridge yourself, or use hip/flat)
  — filling them automatically would require re-deriving wall heights per
  wall from the roofline, which is a bigger feature than "generate a roof."
- Furniture "merged" mode unions pieces into the shell but does not run a
  self-intersection cleanup between furniture pieces that overlap each
  other (only piece-vs-shell is guaranteed manifold).

## FDM print defaults

- Wall thickness: 3.5mm (clamp 2–8mm; `validate.ts` warns outside a sane
  0.4mm-nozzle range).
- Baseplate: 2.5mm.
- Roof lip tolerance: 0.35mm slip-fit clearance.
- Minimum lintel band above an opening: 4mm (warns, doesn't block export).
