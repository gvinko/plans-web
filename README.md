# Plans to Print

Plans to Print is an offline-first 2D/3D design-to-print PWA for creating, importing, checking and exporting real 3D-printable parts.

This repository is **not PlanDroid**. Legacy drawing/import infrastructure is being retained only where it is genuinely useful to Plans to Print. HVAC-specific workflows are no longer part of the active product path.

## Current rebuild status

The active rebuild lives on the `plans-to-print-rebuild` branch until preview testing is complete.

Implemented:

- Project dashboard with create, open, rename, duplicate and delete.
- Recovery-first project opening and read-only IndexedDB recovery diagnostics.
- 2D CAD workspace with:
  - select/move
  - pan/zoom
  - rectangle, circle and text tools
  - exact width, height, X, Y and rotation editing
  - undo/redo of add and delete actions, duplicate, delete, lock and unlock
  - explicit Save now
  - guarded autosave that blocks accidental blank overwrites
- Plan/photo/PDF reference import.
- Two-point scale calibration using a known real-world measurement.
- Built-in printer profiles for:
  - Creality Ender 3
  - Creality Ender 3 V2
  - Creality Ender 3 Pro
- Custom printer profiles.
- Model-vs-printer build-volume checks.
- Deterministic oversized-model split planning.
- Guarded, physical STL slicing for watertight meshes with a single convex contour at each cut. Capped and manifold-validated parts can be downloaded separately, with assembly-position JSON metadata.
- Single-download ZIP export of all split STL pieces, their assembly offsets and a print-preparation guide. ZIPs are generated offline; the safe package limit is 64 MB.
- Printable primitive STL generation:
  - solid box
  - solid cylinder
  - rectangular frame / centre cutout
  - tube / centre hole
- STL Studio:
  - ASCII and binary STL import
  - bounds measurement
  - X/Y/Z scaling
  - X/Y/Z rotation
  - interactive rotate view
  - top/front/side/isometric views
  - fit-to-printer scaling
  - binary STL export
  - project-persistent STL files and transforms
- Photo relief / lithophane-style generation:
  - image sampling
  - width, backing thickness and relief depth
  - invert option
  - adjustable resolution
  - closed printable mesh
  - STL export
- Wall-art / light-box shell generation:
  - width/height/depth
  - wall thickness
  - back thickness
  - recessed internal cavity
  - STL export
- PWA/offline application shell.
- Cloudflare Pages branch preview.
- GitHub build validation.

## Reliability rules

Plans to Print treats local project data as durable user work.

- IndexedDB remains the primary project store.
- The database currently retains the historical name `plandroid_web` intentionally so existing local projects are not destroyed during the product separation.
- IndexedDB v4 adds project STL asset persistence without dropping existing stores.
- Canvas restore completes before autosave is allowed.
- Autosave refuses to replace known non-empty work with a transient blank canvas.
- Failed canvas restore keeps saving disabled and failed saves keep the user in the workspace rather than navigating away.
- File-import, restore and save failures surface an actionable error.
- Destructive project/STL deletion requires confirmation.

## Architecture

- React 18
- TypeScript
- Vite
- Fabric.js for the current 2D canvas
- Dexie / IndexedDB for durable local persistence
- Zustand for transient application state
- PDF.js / PDF tooling for plan import
- PWA service worker via `vite-plugin-pwa`
- Native Plans to Print STL parser/exporter and triangle-mesh generators

The geometry code uses millimetres as the physical modelling unit.

## Local development

```bash
npm ci
npm run dev
```

Production validation:

```bash
npm run test:geometry
npm run test:zip
npm run build
```

The geometry regression checks cover watertight capping, 1/2/3-axis splits, printer-bed fit, rejection of open or disconnected meshes, and no-split models. ZIP tests check checksums, local headers, central directory offsets, archive payload integrity, and filename guards.

## Cloudflare Pages

Current Pages project: `plans-web`

Build settings:

- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`
- Rebuild branch preview: `plans-to-print-rebuild`

Production is not updated from the rebuild branch until the preview has passed user validation.

## Important incomplete work

These capabilities are intentionally **not** presented as finished:

- Unrestricted arbitrary-mesh cutting (concave boundaries, cut surfaces with holes, and multiple disconnected section loops). This release deliberately fails closed on unsupported shapes; it does not export invalid partial STLs.
- Removable clip-fit joins. The joining panel keeps this mode unavailable until it can export and validate the separate clip geometry.
- General boolean CSG beyond the guarded split-boundary join workflow.
- Full solid modelling / constraint solving.
- Arbitrary text/path extrusion to 3D solids.
- Transform/edit history across every modification type (basic add/delete undo/redo is present).
- Final device/browser acceptance testing, and slicer/physical-print verification of new split parts.

Dimensional split planning and guarded mesh cutting are implemented. On supported closed meshes, the app validates generated split solids and can add complementary dovetail-plus-pin or pins-only geometry. Every output still needs slicer and physical-fit validation on the target printer.

## Release acceptance checklist

Before publishing the rebuild branch, validate one oversized closed STL in the browser and slicer:

1. Select the correct printer profile, import the STL, and create the split parts.
2. Generate a dovetail-plus-pin plan, download the ZIP, and confirm the manifest records the joining mode and clearance.
3. Reopen the saved STL and confirm the joining geometry is restored; change the clearance and confirm it must be regenerated before export.
4. Repeat with Pins only, then inspect all exported parts in a slicer for bed fit, layers and wall integrity.
5. Print one mating boundary on the target printer before relying on the join for a full-size model.

## Product direction

The target workflow is:

**Design → Preview → Validate against printer → Split if required → Export printable STL**

The app should remain practical for a non-CAD-specialist while preserving exact numeric dimensions and reliable project recovery.
