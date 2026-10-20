# Repair continuation — 20 October 2026

Continues `d89f7a6` on `audit/plans-web-repair-20261020`, PR #13. Fetched current main
before changes; main remains `a794d8f`. Cloudflare's read API reconfirmed production is
deployment `09cfaca3-989a-4c73-98ae-5a59b8927160` at that commit. No production action taken.

## Repairs

- Lazy-load DrawingWorkspace after opening a level. The projects chunk shrank from
  about 336 KB to 19.65 KB; drawing code remains available to offline precaching.
- Self-host the existing Geist font (29.4 KB Latin variable font), removing the
  render-blocking Google Fonts stylesheet and external font requests.
- Remove development-only shadcn CLI and LHCI wrapper dependency chains. Preserve
  shadcn 4.22.1's exact CSS utilities locally, with its MIT notice; existing React
  components and application libraries are unchanged. Run Lighthouse 13.5 directly
  with a small script. No advisory suppression, forced vulnerable overrides or weaker thresholds.
- Performance runs on a separate CI runner, using Playwright's installed Chromium.
  Retain three serial mobile reports and gate the median performance run at 80,
  accessibility at 90, best practices at 90. Build publication requires this job too.
- Add CAD regression coverage without changing drawing geometry. The merge fixture uses
  a deliberately stale stored endpoint and checks the live result against the actual
  port position. An initial proposed geometry change was removed: existing live tie
  resolution already preserves that connection, and baking could double eccentric offsets.

- Address PR review findings: unreadable originals cannot be replaced by drafts or generate
  new drafts, and navigation can leave that protected page. Saves share one in-flight
  promise and persist superseding edits before navigation. Legacy null/empty/corrupt
  strings and orphan file metadata restore without changing stored drawing bytes;
  missing referenced image bytes still reject the transaction.

## Executed local evidence

- Production build passed. Icon checks: 96 references, 74 entries, fallback passed.
- Browser suite: **14 passed, 54.3 seconds**. Includes existing save/quota/corrupt drawing,
  mobile, PDF import, ZIP round trip/atomic rejection, axe and offline tests.
- Added CAD assertions: live merge point, branch tie remapping and shoe fitting,
  eccentric reducer shift/length, 90-degree and radius bends, 2400 mm stock tally,
  clear label location, network grouping, A3/A4 plan windows, R12 DXF units/text.
  Geometry, legacy ZIP and controlled save-delay fixtures use source; other interaction/save tests use dist.
- Added same-origin rollback drill against downloaded immutable production assets.
  Save a disposable damper and PNG, install current worker, swap server to old assets
  plus retirement overlay, verify update waits with drawing open, close/reopen, verify
  registration retired, compare projects/pages/files and drawing/image bytes exactly,
  open/save the drawing in the baseline app. Passed. Evidence attached to browser results.
- Desktop/mobile screenshots visually inspected. Axe projects/workspace: zero violations.
- Full npm audit: **zero findings**, including development dependencies; raw report in
  `dependency-audit.json`. Node 24.21 locally; CI uses Node 22 (minimum now 22.19).
- Lighthouse 13.5 before the final save-only review fixes: **93, 94, 94** performance; **100** accessibility and best practices
  in every run. Median run: FCP 2284 ms, LCP 2606 ms, TBT 101 ms, CLS 0, SEO 82.
  Measured 2026-10-20 03:29 UTC. Thresholds unchanged; Lighthouse and Chromium changed,
  so this is not a controlled numerical comparison with the old Lighthouse 12 results.

The controlled save-delay regression first exposed a test-module identity mistake, then a
real race between waiting navigation and superseding saves. The final shared promise
serializes the entire save sequence; its targeted regression passed with both edits saved.

Early parallel local runs were stopped after a font import error and contention with an
unnecessary baseline dependency installation. Corrected the font import, used actual
immutable deployed assets instead of rebuilding baseline, and ran the passing checks
serially. Stopped/incomplete runs are not counted as passes.

## Remaining release blockers

- Hosted CI and fresh Cloudflare preview results for the pushed repair commit must pass.
- Representative HVAC drawing and printed PDF layout still require human review. Geometry
  and DXF assertions do not certify all BOM, angled part, sizing or print workflows.
- Local rollback proves browser/storage compatibility with the baseline artifact plus
  retirement overlay. An actual disposable hosted deployment rollback/retirement rollout
  remains unexecuted. Restoring the old deployment alone does not provide that overlay.
- Production merge/deployment remains prohibited until all release gates pass. Keep PR draft.

IndexedDB database name, version, tables, field names and backup format are unchanged.
All fixtures use disposable browser contexts and separate origins; no customer data was read.
