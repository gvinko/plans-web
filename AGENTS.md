# AGENTS.md — Plans to Print

## Mission

This repository is **Plans to Print**: a production-grade, offline-capable 2D/3D design application for creating real 3D-printable parts.

It is a standalone product. It is **not PlanDroid** and must not drift back into HVAC/jobsite-specific functionality.

The application should be reliable enough for practical use on Windows laptops and Surface/tablet devices, while remaining usable on phones where appropriate.

---

## Product boundaries

### Remove
- PlanDroid branding.
- HVAC-specific tools, terminology, icons, equipment libraries, ductwork logic, grille logic, job-specific HVAC workflows, and any other domain logic that belongs to PlanDroid.
- Legacy naming such as `plandroid-web` where it refers to this product rather than shared infrastructure.

### Retain and refactor when genuinely reusable
- Canvas/drawing infrastructure.
- PDF and image import.
- Calibration and scale tools.
- Selection, move, resize, rotate, pan and zoom.
- Undo/redo logic.
- IndexedDB/Dexie persistence.
- Autosave and recovery.
- File/project management.
- Useful shared UI components.
- PWA/offline support.

Do not delete useful infrastructure merely because it originated in PlanDroid.

---

## Core product requirements

### 1. Project dashboard
Provide a clear project area with:
- Create project.
- Open project.
- Rename project.
- Duplicate project.
- Delete project.
- Autosave status.
- Recovery status.
- Recent projects.

Projects must survive reloads and accidental browser/app closure.

### 2. CAD / design workspace
The primary workspace must allow users to create printable designs from scratch.

Required capabilities:
- Accurate dimensions.
- Grid and snapping.
- Selectable objects.
- Move.
- Resize.
- Rotate.
- Duplicate.
- Delete.
- Editable numeric properties.
- Undo/redo.
- Multi-select where practical.
- Clear active-tool state.
- Easy tool drop/deselect.
- Keyboard shortcuts where appropriate.
- Sensible desktop/tablet layout.

No fake controls. Primary workflow buttons must either work or be clearly disabled with a reason.

### 3. 3D view
Provide a true 3D preview/work area with:
- Orbit.
- Pan.
- Zoom.
- Pick/select object.
- Rotate selected object.
- Top view.
- Front view.
- Side view.
- Isometric view.
- Reset view.
- Fit-to-model.

Prefer a maintainable browser-compatible 3D stack such as Three.js and well-supported companion libraries where justified.

### 4. STL import and editing
Users must be able to:
- Import STL files.
- Inspect imported geometry.
- Move/scale/rotate imported geometry.
- Measure model dimensions.
- Edit imported models where the operation is technically valid.
- Combine imported geometry with new design elements when supported.

Do not imply arbitrary mesh editing exists unless it is truly implemented.

### 5. Printable-part creation
Provide practical solid-modelling workflows suitable for real printing:
- Primitive shapes.
- Exact dimensions.
- Holes/cut-outs.
- Basic constructive solid geometry where stable.
- Position and alignment controls.
- Wall thickness and depth controls where relevant.

Generated output must be printable geometry, not merely a visual preview.

### 6. Large-model mode
The app must support models larger than a printer build volume.

Required workflow:
- Compare model bounds with the selected printer's build volume.
- Warn when the model exceeds printable dimensions.
- Automatically propose split planes.
- Allow manual split adjustment.
- Generate multiple printable parts.
- Offer joining/alignment systems such as:
  - locating pins,
  - sockets,
  - dovetail-like joints,
  - clips,
  - tabs/slots,
  - alignment keys.
- Show the assembled preview.
- Export parts individually.

Joining systems must respect tolerances suitable for FDM printing.

### 7. Printer profiles
Built-in initial printer profiles:
- Creality Ender 3.
- Creality Ender 3 V2.
- Creality Ender 3 Pro.

Provide:
- build volume,
- printable bounds,
- nozzle diameter,
- sensible default clearances/tolerances where relevant.

Provide an **Add Printer** workflow so future printers can be created without code changes.

Do not hard-code business logic around only these three printers.

### 8. Plan / image import and calibration
Users must be able to:
- Import image plans.
- Import PDFs.
- Select a known measurement.
- Enter the real dimension.
- Calibrate the drawing scale.
- Verify scale after calibration.
- Recalibrate safely.

Calibration must be reliable and testable. Never silently lose scale state.

### 9. Photo-to-print
Support workflows such as:
- Image relief.
- Lithophane-style generation.
- Adjustable width/height/depth.
- Base thickness.
- Relief strength.
- Invert option where appropriate.
- Preview before export.

Generated geometry must remain within sensible printable limits.

### 10. Wall-art tools
Support creation of printable wall art, including:
- text/shapes,
- raised or recessed designs,
- modular wall panels,
- optional cavities/channels for lighting,
- cable paths where appropriate,
- mounting features.

### 11. Export
Export workflows must produce valid output where implemented:
- STL for printable geometry.
- Separate parts for split models.
- Clear filenames.
- Basic validation before export.

Never present a mock export as successful.

### 12. Reliability
Reliability is a top-level requirement.

Must include:
- IndexedDB persistence.
- Autosave.
- Explicit save option.
- Save-status indicator.
- Crash/reload recovery.
- Protection against empty-canvas overwrite.
- Guarded storage writes.
- File-import error handling.
- Safe migrations when data structure changes.
- Recovery-first behavior when stored data is inconsistent.
- No destructive reset without explicit user confirmation.

---

## Architecture expectations

Current stack includes React, TypeScript, Vite, Dexie, Zustand, Fabric.js, PDF tooling and PWA support.

Prefer incremental refactoring over blind rewrites.

### Code structure
Keep responsibilities separated:
- UI components.
- Domain/model logic.
- Persistence.
- Import/export.
- 2D canvas.
- 3D scene.
- Printer profiles.
- Geometry operations.
- Project lifecycle.
- Validation/recovery.

Avoid large monolithic files.

### State
Use predictable state ownership.
- Project state must have one authoritative source.
- Do not duplicate mutable state unnecessarily between canvas objects, UI state and persistence.
- Persist durable project data, not transient interaction state.

### Geometry
Geometry operations must be deterministic and testable.
- Keep units explicit.
- Prefer millimetres internally for 3D-printing dimensions.
- Separate display transforms from model-space dimensions.
- Never rely on pixel size as the physical model size after calibration.

---

## UX rules

Primary audience is a practical user who wants to make a printable object, not a CAD engineer.

Therefore:
- Use plain terminology.
- Keep advanced controls available without overwhelming the main workflow.
- Make dimensional values visible.
- Make the current tool obvious.
- Make selection state obvious.
- Make save state obvious.
- Make errors actionable.
- Avoid hidden destructive behavior.
- Desktop/tablet is the primary CAD experience.
- Phone layouts may simplify editing but should still support project access and preview.

---

## Development rules for Codex

Before making large changes:
1. Inspect the relevant code.
2. Identify reusable components.
3. Identify legacy PlanDroid-specific code.
4. Preserve working behavior unless replacement is clearly better.
5. Explain any destructive migration before performing it.

When implementing:
- Make the change, not just a recommendation.
- Keep changes scoped and reviewable.
- Prefer small coherent commits.
- Do not replace the whole application merely to simplify the task.
- Add or update tests for non-trivial logic.
- Run lint/build/tests after significant changes.
- Fix build errors before declaring a task complete.
- Report any remaining limitation precisely.

For new dependencies:
- Prefer mature, actively maintained, browser-compatible libraries.
- Avoid unnecessary dependencies.
- Document why a geometry/3D dependency was added.
- Avoid abandoned packages for core geometry or persistence.

---

## Priority order

Unless a task explicitly overrides this order, prioritize:

1. Project save/recovery reliability.
2. Import and calibration reliability.
3. Core CAD/design workspace.
4. 3D preview and object manipulation.
5. STL import.
6. Real printable geometry creation/export.
7. Printer profiles.
8. Large-model splitting and joins.
9. Photo-to-print/lithophane.
10. Wall-art and lighting features.
11. Further polish and advanced modelling tools.

---

## Definition of done

A feature is not complete because its UI exists.

A feature is complete only when:
- the primary interaction works,
- data persists correctly where required,
- errors are handled,
- the project builds successfully,
- the behavior has been manually verified or tested,
- the user is not misled by placeholders.

If something cannot yet be implemented safely, mark it clearly as incomplete and explain the blocking technical reason.

---

## Product identity

Use the name **Plans to Print** consistently in product-facing UI and documentation.

Do not reintroduce PlanDroid branding or HVAC-specific workflow into this repository.

The goal is a dependable design-to-print tool: **design it, preview it, validate it, split it if needed, and export it for a real printer.**
