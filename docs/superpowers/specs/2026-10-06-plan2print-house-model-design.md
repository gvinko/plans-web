# Plan2Print House Model Design

## Purpose

Turn the existing Plan2Print Studio House Model tab from instructions into a usable local-first plan-to-print workspace. A user must be able to import a house plan, calibrate it from a known dimension, trace walls, verify 1:100 scale, and export both a flat printable plan and a simple 3D house shell.

## User outcome

The House Model tab is self-contained. It contains no link to Plandroid and does not depend on HVAC tools. The user can work with a PDF first page, PNG, JPG, or camera photo and retain the work in the browser until they export it.

## Scope

### Import and workspace

- Accept PDF, PNG, JPG/JPEG and image capture from the device.
- Render the first PDF page locally.
- Display the plan beneath an interactive tracing canvas.
- Provide reset-plan and undo-last-point actions.

### Calibration

- Calibration mode collects exactly two points on the displayed plan.
- The user enters the real-world distance in millimetres.
- Store pixels-per-millimetre and show calibration status.
- Clear any active point selection immediately after calibration succeeds.
- Disable scale-dependent export until calibration is valid.

### Manual wall tracing

- Wall tracing is point-to-point: each tap/click adds a vertex; Finish Trace completes an open path and Close Room closes a room perimeter.
- Each completed trace is stored as its own polyline/polygon in image coordinates.
- Undo removes the current unfinished point before it removes a completed trace.
- Clear active selection after a trace finishes so the user can start the next wall cleanly.
- Do not provide automatic wall detection in this release; the imported plan remains the visual guide.

### 1:100 verification and flat export

- Show a verification tool where the user selects or enters one known wall length in millimetres.
- At 1:100, display the expected print length in millimetres (`real length / 100`) and pass/fail against a user-entered measured print length with a 0.25 mm tolerance.
- Export the completed trace as SVG at 1:100, suitable for printing or further editing.

### 3D shell export

- Generate ASCII STL locally from the closed room/wall traces.
- Default model settings: wall height 25 mm, wall thickness 1.2 mm, base thickness 1.2 mm.
- The 3D model uses the calibrated real-world plan geometry divided by the selected print scale (default 1:100).
- Export consists of a base slab plus vertical wall segments. It does not infer doors, windows, roofs, room names or levels.
- If there are no closed traces, show a clear message rather than creating an empty STL.

## Architecture

Implement a dedicated `HouseModelWorkspace` using a native HTML canvas overlay and small pure geometry/export utilities. It will be used by the standalone `public/plan2print-studio.html` direct-upload site. Keep all plan files and trace data in browser memory for this first release; no account, server, or cloud database is introduced.

The existing Vite application contains calibration and tracing logic, but Plan2Print will receive a small purpose-built subset with no Fabric, HVAC catalogue, project database, or Plandroid navigation dependency.

## Deployment and build constraints

- The deployed `plan2print` Pages project is a direct-upload project and serves the compact static studio file.
- Keep the standalone Studio payload below the service-worker precache limit.
- Replace the oversized `public/plan2print-studio.html`; its embedded third-party bundles exceed the PWA precache limit and break the Vite build.
- Retain `public/plan2print-studio.html` as a compact compatibility entry point, but build the Studio itself as a dedicated Vite page with only the assets it needs.

## Error handling

- Reject unsupported or unreadable plan files with an inline error.
- Report invalid calibration lengths, too-short calibration point spans, unfinished traces, and non-closed outlines without losing the imported plan.
- Keep the model controls visible but disable each export until its prerequisites are met.

## Tests

- Unit-test calibration math, 1:100 conversion and tolerance results.
- Unit-test trace state transitions: start, undo, finish, close and automatic selection clearing.
- Unit-test SVG and STL geometry generation with a rectangular room.
- Test that unsupported file types and uncalibrated exports report an actionable state.
- Build the Vite application after the oversized public Studio file is replaced and verify the compact Plan2Print direct-upload package contains `index.html`, `plan2print.html` and `plan2print-studio.html`.
