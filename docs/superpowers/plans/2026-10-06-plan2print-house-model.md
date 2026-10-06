# Plan2Print House Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone Plan2Print Studio that imports and calibrates house plans, traces walls, verifies 1:100 output, and exports SVG and a simple 3D STL shell alongside the existing custom-part tools.

**Architecture:** Replace the oversized static standalone HTML with a small redirect page and a dedicated Vite-built Plan2Print entry page. `house-model-core.js` owns pure calibration, tracing, SVG and STL geometry; `house-model-workspace.js` owns the canvas, import and UI state; the Studio entry only wires tabs and downloads. PDF rendering uses the installed `pdfjs-dist` package in the dedicated Vite bundle rather than embedding a worker into HTML.

**Tech Stack:** HTML, CSS, browser canvas/File APIs, ES modules, `pdfjs-dist`, Node built-in test runner, Vite/TypeScript build, Cloudflare Pages Direct Upload.

**Spec:** `docs/superpowers/specs/2026-10-06-plan2print-house-model-design.md`

## Global Constraints

- The House Model tab is self-contained: no Plandroid link, HVAC tool, account, server or cloud database.
- Accept PDF first page, PNG, JPG/JPEG and device image capture; keep input data and traces in browser memory only.
- Calibration has exactly two points and a positive millimetre length; clear selection immediately when it succeeds.
- Trace in image coordinates; `Finish Trace` makes an open polyline and `Close Room` makes a closed perimeter; clear selection after each completion.
- Disable scale-dependent exports until calibration is valid; export SVG at 1:100.
- The scale verification tolerance is exactly 0.25 mm.
- Default 3D settings are 25 mm wall height, 1.2 mm wall thickness and 1.2 mm base thickness, at 1:100 print scale.
- STL is local ASCII STL of base slab plus vertical wall segments from closed traces only; do not infer openings, roofs, names or levels.
- Replace `public/plan2print-studio.html` with a compact redirect whose direct-upload package contains `index.html`, `plan2print.html` and `plan2print-studio.html`.

## Review Focus

- A camera image with an uppercase `.JPEG` extension must import exactly like a lower-case JPG; add an import-type test in Task 2.
- A two-point calibration with zero or negative real length must preserve the plan and report an inline validation state; add a core test in Task 1.
- Undo at the boundary between an unfinished trace and saved traces must remove only one most-recent element; add a state test in Task 1.
- A closed trace with repeated adjacent points must not produce degenerate STL triangles; add a rectangular/repeated-point STL test in Task 3.
- A failed PDF parse or an unreadable image must leave the current plan and completed traces visible; add an import-error test in Task 2.

---

## File Structure

- `plan2print.html` — Vite entry document for the standalone Studio.
- `src/plan2print/main.js` — Studio tabs, retained custom-print tools and House Model mounting.
- `src/plan2print/house-model-core.js` — pure calibration, trace-state, scale-verification, SVG and ASCII-STL functions.
- `src/plan2print/house-model-workspace.js` — browser file import, canvas rendering, House Model controls and download integration.
- `src/plan2print/pdf-renderer.js` — lazy local first-page PDF-to-canvas-image adapter using Vite’s PDF.js worker asset.
- `public/plan2print-studio.html` — compact compatibility redirect to the built `plan2print.html` entry.
- `tests/plan2print-house-model-core.test.mjs` — unit tests for pure math/state/export functions.
- `tests/plan2print-house-model-workspace.test.mjs` — static interaction/import contract tests with faked browser APIs.
- `scripts/package-plan2print.mjs` — produces a Direct Upload folder/zip containing only the Plan2Print entry page and its required assets.
- `tests/plan2print-direct-upload.test.mjs` — verifies Direct Upload package paths and no Plandroid route/dependency.

### Task 1: Define tested house-model geometry and trace state

**Files:**
- Create: `src/plan2print/house-model-core.js`
- Create: `tests/plan2print-house-model-core.test.mjs`

**Interfaces:**
- Produces: `calibrate(points, realMm) -> { pixelsPerMm } | { error }`, `createTraceState() -> TraceState`, `addTracePoint(state, point) -> TraceState`, `undoTrace(state) -> TraceState`, `finishTrace(state, close) -> TraceState`, `verifyScale(realMm, measuredMm, scale) -> { expectedMm, differenceMm, passed }`, `buildSvg(traces, pixelsPerMm, scale) -> string`, `buildAsciiStl(traces, pixelsPerMm, options) -> string`.
- Consumes: `{ x: number, y: number }` image-coordinate points and `Trace = { points: Point[], closed: boolean }`.

- [ ] **Step 1: Write failing core tests**

```js
assert.deepEqual(calibrate([{x: 0, y: 0}, {x: 200, y: 0}], 100), { pixelsPerMm: 2 });
assert.equal(calibrate([{x: 0, y: 0}, {x: 1, y: 0}], 0).error, 'Enter a positive real distance.');
assert.equal(verifyScale(2500, 25.2, 100).passed, true);
assert.equal(verifyScale(2500, 25.3, 100).passed, false);
```

Include state tests for unfinished-point undo, completed-trace undo, finish/close selection clearing, and export tests for a 1000 mm × 800 mm room at 1:100.

- [ ] **Step 2: Run core tests to verify failure**

Run: `node --test tests/plan2print-house-model-core.test.mjs`

Expected: FAIL because `house-model-core.js` does not exist.

- [ ] **Step 3: Implement pure core interfaces in `src/plan2print/house-model-core.js`**

Use immutable plain-object state. Reject calibration spans below one pixel and traces with fewer than two points (three for a closed trace). Convert each image point with `millimetres = pixels / pixelsPerMm`, then divide by `scale` before SVG/STL output. Build only valid finite triangles and emit `solid plan2print-house` ASCII STL.

- [ ] **Step 4: Run core tests to verify pass**

Run: `node --test tests/plan2print-house-model-core.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit core geometry**

```bash
git add src/plan2print/house-model-core.js tests/plan2print-house-model-core.test.mjs
git commit -m "feat: add Plan2Print house model geometry"
```

### Task 2: Implement resilient local plan import and canvas workspace

**Files:**
- Create: `src/plan2print/pdf-renderer.js`
- Create: `src/plan2print/house-model-workspace.js`
- Create: `tests/plan2print-house-model-workspace.test.mjs`

**Interfaces:**
- Consumes: Task 1 exports and `mountHouseModelWorkspace({ host: HTMLElement, downloads: (name, blob) => void }) -> { destroy(): void }`.
- Produces: an interactive workspace with `loadPlan(file) -> Promise<void>` exposed only to its event handlers.

- [ ] **Step 1: Write failing import and workspace contract tests**

```js
assert.equal(classifyPlanFile({ name: 'plan.JPEG', type: 'image/jpeg' }), 'image');
assert.equal(classifyPlanFile({ name: 'plan.pdf', type: 'application/pdf' }), 'pdf');
assert.equal(classifyPlanFile({ name: 'plan.dwg', type: 'application/acad' }), 'unsupported');
```

Add mocked rejection tests proving an image/PDF read error preserves the pre-existing plan and traces.

- [ ] **Step 2: Run workspace tests to verify failure**

Run: `node --test tests/plan2print-house-model-workspace.test.mjs`

Expected: FAIL because the workspace module does not exist.

- [ ] **Step 3: Implement `pdf-renderer.js` and `mountHouseModelWorkspace`**

Render PDF page 1 into an offscreen canvas via a lazily loaded local PDF.js module. For images, use `createImageBitmap` or an `Image` object URL. Render the source plan then traces over it in a high-DPI canvas. Include import control with `accept="application/pdf,image/png,image/jpeg"` and `capture="environment"`; reset; calibration entry; trace/finish/close/undo; scale verification; SVG and STL controls. Keep the prior plan intact if parsing fails and show the stated inline error.

- [ ] **Step 4: Run workspace tests to verify pass**

Run: `node --test tests/plan2print-house-model-workspace.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit workspace**

```bash
git add src/plan2print/pdf-renderer.js src/plan2print/house-model-workspace.js tests/plan2print-house-model-workspace.test.mjs
git commit -m "feat: add calibrated house-plan workspace"
```

### Task 3: Integrate the workspace without removing custom-print tools

**Files:**
- Create: `plan2print.html`
- Create: `src/plan2print/main.js`
- Modify: `public/plan2print-studio.html`
- Modify: `vite.config.ts`
- Modify: `tests/plan2print-house-model-core.test.mjs`

**Interfaces:**
- Consumes: `mountHouseModelWorkspace` from Task 2.
- Produces: House Model tab host and an unchanged usable Custom Design, Storage & Hooks and Image/Lithophane experience.

- [ ] **Step 1: Add failing integration assertions**

```js
assert.match(plan2printHtml, /id="house-model"/);
assert.match(mainModule, /mountHouseModelWorkspace/);
assert.doesNotMatch(plan2printHtml + mainModule, /Back to calibrated plans|Plandroid/i);
```

Add an assertion that all three 3D defaults and the 0.25 mm verification tolerance are visible/configured by the workspace.

- [ ] **Step 2: Run the target tests to verify failure**

Run: `node --test tests/plan2print-house-model-core.test.mjs tests/plan2print-house-model-workspace.test.mjs`

Expected: FAIL because no dedicated Studio entry mounts the new workspace yet.

- [ ] **Step 3: Add the dedicated Vite Studio entry and compact compatibility redirect**

Configure Vite multi-page input for `index.html` and `plan2print.html`. Preserve the existing STL generators for Custom Design, Storage & Hooks and Image/Lithophane in `src/plan2print/main.js`. Add the House Model tab and mount its workspace on selection. Make `public/plan2print-studio.html` a small relative redirect to `./plan2print.html`; use mobile-safe canvas sizing, accessible labels, disabled export buttons until prerequisites are met, and no Plandroid navigation.

- [ ] **Step 4: Run target tests to verify pass**

Run: `node --test tests/plan2print-house-model-core.test.mjs tests/plan2print-house-model-workspace.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Studio integration**

```bash
git add plan2print.html src/plan2print/main.js public/plan2print-studio.html vite.config.ts tests/plan2print-house-model-core.test.mjs
git commit -m "feat: integrate House Model in Plan2Print Studio"
```

### Task 4: Package and verify the standalone Direct Upload deployment

**Files:**
- Create: `scripts/package-plan2print.mjs`
- Create: `tests/plan2print-direct-upload.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the Vite `dist/plan2print.html` entry, Vite asset directory, and `public/plan2print-studio.html` redirect.
- Produces: `npm run package:plan2print` that writes a self-contained upload directory with `index.html`, `plan2print.html`, `plan2print-studio.html`, and only the Vite assets required by the Plan2Print entry.

- [ ] **Step 1: Write failing Direct Upload package tests**

```js
assert.ok(packageFiles.includes('index.html'));
assert.ok(packageFiles.includes('plan2print.html'));
assert.ok(packageFiles.includes('plan2print-studio.html'));
assert.match(indexHtml, /plan2print-studio\.html/);
assert.ok(studioBytes < 250000);
```

Assert a `plan2print` package contains no `src/App.tsx` or Plandroid route and only relative asset references.

- [ ] **Step 2: Run package tests to verify failure**

Run: `node --test tests/plan2print-direct-upload.test.mjs`

Expected: FAIL because the packager script and compact page do not yet meet the contract.

- [ ] **Step 3: Implement the packager and npm script**

First run Vite’s production build, then copy the Plan2Print HTML and only its referenced asset files into `dist-plan2print/`; copy the compact compatibility redirect; generate a root `index.html` redirect to `./plan2print-studio.html`. Remove/recreate only that exact generated directory at package start. Add `"package:plan2print": "vite build && node scripts/package-plan2print.mjs"`.

- [ ] **Step 4: Run package, build and all tests**

Run: `npm run package:plan2print && node --test tests/*.test.mjs && npm run build`

Expected: package exists, all tests PASS, and Vite build exits 0 without an oversized standalone page error.

- [ ] **Step 5: Commit the release tooling**

```bash
git add scripts/package-plan2print.mjs tests/plan2print-direct-upload.test.mjs package.json
git commit -m "build: package Plan2Print for Cloudflare Pages"
```

### Task 5: Manual release validation and Cloudflare handover

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `dist-plan2print/` produced by Task 4.
- Produces: documented manual validation and one-step Direct Upload release instructions.

- [ ] **Step 1: Add a release checklist to `README.md`**

Document these manual checks: import a PNG/JPEG, calibration clears its two selected points, trace/finish/close/undo flows, 1:100 verification at 0.25 mm tolerance, SVG opens, STL slices, and Custom Design still downloads an STL.

- [ ] **Step 2: Run final verification commands**

Run: `npm run package:plan2print && node --test tests/*.test.mjs && npm run build && git status --short`

Expected: tests and build PASS; only generated `dist-plan2print/` may be untracked if it is intentionally ignored.

- [ ] **Step 3: Commit release documentation**

```bash
git add README.md .gitignore
git commit -m "docs: add Plan2Print release checklist"
```

- [ ] **Step 4: Upload the generated folder to the existing `plan2print` Pages Direct Upload project**

Use the Cloudflare dashboard’s Direct Upload flow. Verify `https://plan2print.pages.dev/plan2print-studio` opens the standalone Studio and not PlanDroid.
