# PlanDroid duct-only colour drawing style — 22 November 2026

## Intent
Make Gerad's Ductplanner / PlanDroid (gvinko/plans-web) drawings look like clean Australian HVAC plans: readable, smooth, size-labelled coloured ductwork over monochrome architectural linework and original CAD-style HVAC symbols. PolyPlan and the supplied Plandroid/SkillCat symbol images are visual references only; do not copy proprietary assets.

## Confirmed decisions
- Whether the floor plan is uploaded or drawn inside PlanDroid, walls and architectural detail remain black/grey.
- Only ductwork receives presentation colours. Do not tint rooms or entire zones; room/zone areas remain editable and retain their underlying engineering data.
- Supply/return/exhaust duct colours remain semantically distinguishable; maintain real duct width after scale calibration, visible diameters, lengths and clean rounded flex bends.
- Equipment, outlets, fittings and their labels have technical black/grey drafting appearance in the exported drawing. Temporary selected/error/touch target highlights may remain.
- The on-screen drawing and its customer PDF use the same appearance. Existing SHOP technical/fabrication mode remains and its actual geometry is unchanged.
- Existing jobs, plans, backups, IndexedDB schema and all engineering/airflow/heat-load/takeoff calculations must remain unchanged.
- No paid tools, new rendering library, third-party graphics or production deployment.

## Approaches considered
A. **Chosen: targeted SVG appearance changes** using the existing DrawingWorkspace and HvacSymbol/UnitSymbol renderers; lowest regression risk.
B. Replace the renderer/library to imitate PolyPlan; rejected as costly, risky and unnecessary.
C. Icons-only colour update; rejected because rounded ducts and untinted rooms are central to the request.

## Technical design
- Add src/lib/drawingAppearance.js with small pure helpers for duct corner radius and neutral zone/room draft styling; test those helpers.
- Integrate the helpers only into drawing SVG rendering in src/components/DrawingWorkspace.jsx, retaining connections and persisted drawing fields.
- Apply grayscale/neutral ink to component symbol presentation within the drawing, not the underlying symbol geometry or parts catalogue data.
- Improve flex duct bend radius relative to its displayed width, preserving square sheet-metal shop corners.
- Validate with Node tests, Vite build and synthetic plan screenshots/print inspection on a development branch.

## Acceptance
1. A loaded black/white plan remains visually uncoloured under a green/blue/purple duct run.
2. A floor plan drawn with WorkBrain/PlanDroid walls and room boundaries is monochrome, while placed ducts remain coloured.
3. Zone rectangles no longer tint the canvas; an active/selected zone is still discoverable and editable.
4. Existing ducts, connection endpoints, sizes, labels, selection and SHOP detail work as before.
5. Save/reload and PDF export keep the appearance with no data migration or deployment.
