# SHOP Sheet-Metal Joint Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show clear entrance/exit seam lines on square/radius sheet-metal elbows in scaled SHOP plans, with a hard 2400 mm stock-length cap.

**Architecture:** Keep `smLayout` geometry and the existing SVG drawing. Add a tiny pure seam/stock helper tested through Node, then use it only in the existing SHOP overlay in DrawingWorkspace. Do not change persistence or calculations beyond the 2400 mm maximum validation.

**Tech Stack:** React 19, SVG, Vite, Node 22 `node:test`.

**Spec:** docs/superpowers/specs/2026-11-23-shop-sheet-joints-design.md

## Global Constraints
- Edit only the clean existing `feat/duct-colour-polyplan-20261122` branch; `origin/main` is source truth. Do not merge or deploy main.
- Maximum sheet-metal straight stock length: 2400 mm; 1200/1500 remain valid.
- Elbow joint marks appear only in scaled SHOP mode for rectangular sheet metal.
- Preserve IndexedDB `ductplanner`, saved project/backup formats, connection geometry, airflow, original symbols, and all customer jobs.

## Review Focus
- Extremely short elbow legs: seam markers must not extend past the run and must be finite.
- Radius elbows: joint markers must meet arc tangent points at the right angle.
- Zero/invalid sizes, zoom, stock lengths: finite paths and no section greater than 2400 mm.
- SHOP off, no scale, spiral/board: no new elbow seams.
- Export/PDF and save/reload: appearance controlled by SHOP only; no permanent changes to jobs.

---

### Task 1: Pure seam and stock helpers

**Files:**
- Create: src/lib/sheetMetalJoints.js
- Create: test/sheetMetalJoints.test.mjs

**Interfaces:**
- Produces: `sheetStockLengthMm(value)` -> integer within (0,2400]; `elbowJointStrokes({bends,points,widthPx,pixelsPerMm})` -> array of finite SVG path strings. Square bends have offset joints on both legs, radius bends use tangent endpoints.

- [ ] **Step 1: Write tests** for default and clamped stock sizes, square/radius elbow joints, two markers per bend, and malformed/short input.
- [ ] **Step 2: Run** `node --test test/sheetMetalJoints.test.mjs`; expect missing module/exports (RED).
- [ ] **Step 3: Implement** the two helpers, without React or persistence changes.
- [ ] **Step 4: Rerun** targeted test; expect all green.
- [ ] **Step 5: Review** for finite coordinates, clear labels, and no duplicate markers.

### Task 2: Render SHOP elbow joints and verify

**Files:**
- Modify: src/components/DrawingWorkspace.jsx (helper import, existing `smPieces`, `sheetW`, `ticks` render path).

**Interfaces:**
- Consumes: `sheetStockLengthMm` and `elbowJointStrokes` from Task 1, with `lay.bends`, live `P`, `dw`, and `mm=ppm/1000`.

- [ ] **Step 1: Apply** stock-length clamp in piece counting and existing straight flange stroke positions.
- [ ] **Step 2: Render** elbow joint paths only when `showFab && scale && mat==='sheet'`; keep square/radius routes and non-SHOP paths unchanged.
- [ ] **Step 3: Run** `npm test`, `npm run build`, and `git diff --check`; require all pass.
- [ ] **Step 4: Visually check** square and radius runs with SHOP on/off; inspect scaled synthetic PDF and verify separate storage.
- [ ] **Step 5: Commit/push** only the feature branch, wait for Cloudflare preview deployment success; check its URL.
