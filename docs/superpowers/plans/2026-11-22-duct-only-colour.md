# PlanDroid Duct-Only Colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Improve PlanDroid's SVG presentation so only ductwork is coloured, including duct runs over imported or hand-drawn floor plans.

**Architecture:** Keep the current React SVG canvas, geometry and existing storage untouched. Extract small testable drawing-style helpers and apply them in DrawingWorkspace to neutralise zone fills and equipment ink while making flex bends smoother. No new dependencies.

**Tech Stack:** React 19, Vite, SVG, Node.js 22 node:test.

**Spec:** docs/superpowers/specs/2026-11-22-duct-only-colour-design.md

## Global Constraints
- Build from current origin/main in a separate worktree. Do not modify the existing test/community-preview branch or its untracked test-results.
- Keep IndexedDB names, saved fields, backup zip format, duct sizing, engineering and geometry unchanged.
- Walls, rooms, zones and component symbols black/grey; ductwork coloured. Active selection/port warnings may retain transient colour.
- Preserve SHOP detail and customer PDF, and avoid external graphics, paid dependencies and production deployment.

## Review Focus
- Tiny/unscaled duct and zero-length bend points: never emit NaN SVG paths; test style helper on zero/negative widths.
- Zoomed and scaled bends: radius remains sensible and never changes connection endpoint coordinates; test three zoom/width values.
- Saved zone areas: continue edit/resize without coloured fill; inspect with a synthetic room and check saved project data.
- Existing/removed duct statuses: preserve dashed/removed distinction; inspect in canvas and test style rules.
- PDF and SHOP output: no accidental monochrome filter on ductwork; inspect synthetic print and regular canvas.

---

### Task 1: Pure SVG presentation helpers

**Files:**
- Create: src/lib/drawingAppearance.js
- Create: test/drawingAppearance.test.mjs

**Interfaces:**
- Produces: ductCornerRadius({ width, inv, isSheet, scaled }) -> finite nonnegative number; zoneAreaStyle(selected) -> CSS style object with transparent background and neutral dashed border; DRAWING_INK -> neutral hex string.

- [ ] **Step 1: Write failing node:test cases** for sheet metal at scale yielding radius 0, unscaled flex radius growing with width and inverse zoom within bounds, invalid/zero widths yielding finite radius, and selected/unselected zone styles having no background fill.
- [ ] **Step 2: Run** node --test test/drawingAppearance.test.mjs. **Expected:** fail because helper is missing.
- [ ] **Step 3: Implement** the three exports above with no React dependencies or persisted-state changes.
- [ ] **Step 4: Run** node --test test/drawingAppearance.test.mjs. **Expected:** all pass.
- [ ] **Step 5: Commit** helper/test in one feature commit.

### Task 2: Canvas duct and zone styling

**Files:**
- Modify: src/components/DrawingWorkspace.jsx (imports; zonearea rectangle; room draft rectangle; flex conn roundedPath invocation)

**Interfaces:**
- Consumes: Task 1 helpers. Existing roundedPath(pts,r) remains unchanged, as do routePoints, calculated widths, persisted drawing data and SHOP flag.

- [ ] **Step 1: Extend the helper tests** with a noncoloured room-outline style requirement for draft rooms. **Expected:** fail (missing helper).
- [ ] **Step 2: Implement/export** roomDraftStyle() and use it for the room drawing preview; apply zoneAreaStyle() to editable zone areas; compute flex bend radius from displayed width before roundedPath(). Keep scaled sheet corners square.
- [ ] **Step 3: Run** node --test test/drawingAppearance.test.mjs. **Expected:** pass.
- [ ] **Step 4: Run** npm test and npm run build. **Expected:** all tests and build pass.
- [ ] **Step 5: Commit** canvas integration with its tests.

### Task 3: CAD symbol ink and visual verification

**Files:**
- Modify: src/components/DrawingWorkspace.jsx (rendered symbol wrapper and in-plan zone labels only)
- Test: test/drawingAppearance.test.mjs (DRAWING_INK contract)

**Interfaces:**
- Consumes: DRAWING_INK. Duct SVG paths and colours are NOT descendants of the equipment symbol wrapper.

- [ ] **Step 1: Add/confirm failing test** for a neutral symbol ink style contract and the fact that the zone area is uncoloured. **Expected:** RED until the contract exists.
- [ ] **Step 2: Render** all equipment icons with neutral ink/grayscale only inside their symbol wrapper; neutralise in-plan zone labels. Keep canvas duct colours intact.
- [ ] **Step 3: Run** node --test test/drawingAppearance.test.mjs, npm test, npm run build. **Expected:** pass.
- [ ] **Step 4: Perform a synthetic screenshot/print inspection** with at least a wall, zone, FCU, flex run and outlet; confirm duct-only colour and SHOP details.
- [ ] **Step 5: Commit** presentation updates; inspect git diff and working-tree status. Do not push or deploy without Gerad's approval.
