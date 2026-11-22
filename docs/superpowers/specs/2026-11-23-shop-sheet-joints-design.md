# SHOP sheet-metal elbow joints — 23 November 2026

## Intent
Gerad wants clearer sheet-metal plan drawings, with square or radius elbows as distinct fittings and visible construction joints at both sides of every elbow. A full straight stock section must never exceed 2400 mm; show segment lengths only after scale calibration and with SHOP detail switched on.

## Approved behaviour
- On ordinary plans, retain the clean coloured duct drawing. Never show new fabrication seams or piece numbers without SHOP.
- On calibrated SHOP drawings, show clear transverse joint markers at the entrance and exit of each square or radius elbow.
- Square elbows retain the existing mitred path; radius elbows retain the existing selected centre radius. No change to actual run endpoints, airflow or duct widths.
- Existing straight-section tally restarts at every bend and shows pieces at 2400 mm maximum; shorter configurable stock lengths (1200/1500) remain valid. Clamp unexpected stock-length values above 2400 rather than display overlong pieces.
- For very short segments, keep markers inside the adjacent straight lengths; omit a marker if a stable, legible position is impossible.
- Do not modify saved document fields, database names, backup structure, non-sheet materials, or production hosting.
- Keep drawing colour on ductwork, architectural linework black/grey.

## Approaches considered
1. **Chosen: overlay-only seam geometry.** Add a small pure helper returning transverse joint strokes for existing elbows, use existing `smLayout` bends and stock-length tally, show the strokes under the existing SHOP+scale condition. No new persisted fields or rework of the geometry engine.
2. Rebuild each elbow as its own persisted duct object. Rejected: large storage/takeoff migration and unnecessary editing complexity.
3. Display joints on every scaled drawing. Rejected by Gerad: SHOP only.

## Acceptance
- On a scaled 90° square elbow, exactly two joint markers are visible, one on each approach, plus existing straight joins.
- Radius elbows show two joints at the tangent ends, not in the curve; the selected radius stays intact.
- A 5500 mm straight sheet-metal run at the default cap shows 2400+2400+700 mm stock pieces; no piece exceeds 2400 mm.
- SHOP off, scale absent, flex/spiral/board paths: no new sheet-metal elbow markers.
- Existing drawing save/reload, tests, build and preview PDF still work. Publish only to the existing feature branch preview, not main.
