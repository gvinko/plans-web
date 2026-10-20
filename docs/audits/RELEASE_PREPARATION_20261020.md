# Release preparation from 3f52542

PR: https://github.com/gvinko/plans-web/pull/13

Fetched main (`a794d8f`) and the PR head (`3f52542`) before work. Main is an ancestor
of this branch. PR #13 is draft. Its old description incorrectly called `091a696`
the head and cited acceptance checks for `1a874c7`, before equipment documents existed.
This continuation adds fixtures, assertions, a hosted rehearsal harness and evidence;
it changes no application code, storage schema, saved fields or backup format.

## Fresh checks

- `npm ci --ignore-scripts --no-fund`: passed, 320 packages installed, zero audit findings.
- `npm run build`: passed; existing warning about a chunk over 500 KB remains.
- `npm test`: **19 passed, 70.7 seconds**, zero skips/failures/flaky tests.
  Icon validation: 97 references, 74 registry entries, fallback verified.
- Lighthouse 13.5, three serial local mobile runs: **93 / 93 / 87** performance;
  accessibility and best practices **100** every run. Median 93 passes unchanged 80/90/90 gates.
- Existing hosted CI at application commit `3f52542` was verified green:
  [Build 39378577633](https://github.com/gvinko/plans-web/actions/runs/39378577633),
  [Source security 39378577616](https://github.com/gvinko/plans-web/actions/runs/39378577616).
  These predate this continuation's new assertions; fresh CI is required at the pushed head.
- Immutable hosted preview https://f6bc80c0.plans-web.pages.dev (`3f52542`):
  **13 passed, 6 skipped, 55.0 seconds**. All four real export/PDF fixtures ran there.
  Skips are the local source CAD, equipment ZIP, legacy ZIP, deployment-swap rollback,
  controlled-save and source ZIP fixtures; all six passed in the local 19-test run.

## Disposable CAD and export evidence

`tests/fixtures/hvac.js` seeds a synthetic project in a fresh Playwright context.
It contains a VCD with a deliberately stale stored duct endpoint, a 90-degree supply
run, side branch/shoe, eccentric reducer, capped ends, radius return bend, diffuser,
45-degree fan, airflow label and a 5200 mm reference wall. No customer drawing was used.

`tests/release-output.spec.js` exercises the production build's actual export buttons:

- DXF: R12 `AC1009`; the main centreline starts at the live east port
  `(1150, -1000)` mm, not the stale stored point. The reference wall runs from
  `(1000, -5600)` to `(6200, -5600)` mm. No `NaN` coordinates.
- BOM CSV: one branch take-off, one 400 mm eccentric transition, five 300 x 200 TDF
  joint sets, two 200 x 150 caps and seven purchased metres of 300 x 200 duct.
  Its 6550 mm centreline has stock pieces 2 x 2400 + 1500 + 250 mm.
- Actual Chromium PDF output, through Export PDF / Make PDF, at 1:50:
  A3 design and shop each have two pages; A4 design has three pages because the
  equipment schedule continues. PDF.js checks page dimensions, non-empty pages,
  title/scale, fan schedule, equipment schedule and stock notes.
- The 5200 mm reference measures 104 mm both in the print DOM and independently
  through the vector transformation matrices in the generated PDF. Browser PDF
  output uses the application's CSS page size, backgrounds and 100% scale.
- Shop output includes piece counts and transition size text; design output omits
  piece counts. Existing source geometry assertions cover live merge/tie remapping,
  fittings, eccentric offsets, bend radii, stock tally and network grouping.
- `tests/equipment-docs.spec.js` verifies exact pairing (rejects a wrong outdoor or
  uncurated pair), official-link metadata, uploaded PDF bytes and ZIP round trip.
  This verifies the curated lookup; it does not independently certify a manufacturer datasheet.

PDF pages were rasterized using PyMuPDF and visually inspected. Design/shop distinction,
fan schedule, transition, return bend, caps and the continuing A4 schedule are present.
The legend truncates the long VCD name; the main size label is crowded at the branch.
These are recorded review points, not a claim of flawless shop-drawing acceptance.
Physical printer behaviour, CAD application import and professional HVAC approval are untested.

Artifacts are in `test-results/`: three actual PDFs, design screenshot, DXF/CSV and
PDF/text/measurement attachments in `results.json`. CI uploads this directory.
Generate page PNGs from the PDFs for further visual review; they are not substitute PDFs.

## Hosted rollback rehearsal

Only the separate, newly created Pages project `plans-web-disposable-qa-20261020`
was mutated (project ID `393bc95a-7655-447d-8447-c8fa6be2477c`). It has no Git source,
custom domain or customer records. The real `plans-web` project was read only.

- Baseline QA deployment: `4acf3483-b59c-41f9-b246-3ac6755e80cb`.
- Candidate QA deployment: `0fbe1905-6cf0-46d3-bdf7-51af8d0fb7f7`.
- Same test origin: `https://plans-web-disposable-qa-20261020.pages.dev`.
- Test-only Pages workers proxy the immutable candidate `f6bc80c0` (`3f52542`)
  and baseline `09cfaca3` (`a794d8f`) assets. The baseline proxy serves the retirement
  script at `/offline-sw.js` with JavaScript MIME and `Cache-Control: no-cache`.
- Cloudflare's actual deployment rollback API switched the QA project's canonical
  deployment from candidate to baseline. No rollback request targeted `plans-web`.
- Candidate saved the synthetic drawing and PNG, installed its worker and reopened
  the populated drawing offline. Back online, rollback produced a waiting retirement
  worker; the active drawing remained open with byte-identical records.
- After closing that tab naturally, a new tab observed the worker unregister.
  Projects, pages, drawing JSON and file bytes matched exactly. The baseline app
  reopened and saved the drawing, verified by a changed ModifiedOn and preserved sketch.
- Raw synthetic before/after evidence: [hosted-rollback-evidence.json](hosted-rollback-evidence.json).
  Rehearsal harness: `scripts/rehearse-hosted-rollback.mjs` (hardcoded disposable origin).
- After the passing rehearsal, the disposable project was deleted through the API
  after verifying its exact project ID, sole disposable domain and absent Git source.
  The QA URLs above are historical evidence, not an ongoing deployment.

Two preliminary harness attempts did not count as passes: one checked routing before
edge propagation; the other reached byte-preservation/retirement but waited for a
`role=status` selector absent from the old app. The passing run polls served-version
headers and verifies baseline save through IndexedDB. Local test iterations also
corrected selectors and an incorrect assumption that every full stock length prints
on the plan; full stock lengths are verified in the BOM/schedule instead.

This proves a hosted same-origin rollback with the retirement overlay. It does **not**
prove that restoring the original production deployment alone provides that overlay,
or validate an independently uploaded static rollback package. The production rollback
package and overlay delivery method still require approval and verification.

To repeat the hosted harness, first recreate the separate project with production branch
`disposable-qa` and no Git connection. Deploy two test-only `_worker.js` modules with
an empty asset manifest: each forwards path/query with `fetch()` to its immutable
upstream, preserves response MIME and sets `Cache-Control: no-cache`. Add
`X-QA-Version: candidate-3f52542` to candidate responses. The baseline adds
`X-QA-Version: baseline-retirement` and overrides `/offline-sw.js` with the activation
handler `self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));`.
Deploy baseline first, candidate second, then run `node scripts/rehearse-hosted-rollback.mjs`.
After it reports READY, use the Cloudflare rollback API **only for the separate project**,
then create `.tmp/hosted-swapped`. The harness polls routing propagation and writes
`.tmp/hosted-rollback-evidence.json`. It does not itself change hosted deployments.

## Acceptance still open

- No human CAD/BOM/PDF signoff was supplied or invented. Owner review is required,
  including crowded labels, legend truncation, actual CAD import and printer settings.
- Existing PR review finding remains: project PDFs are written before Save details;
  Cancel/Remove/duplicate picks can leave unreferenced blobs, and deduplication ignores
  the pending form. This continuation does not delete any such data. Resolve and test
  document lifecycle before release, including failed saves and shared references.
- The real production rollback overlay packaging remains unverified as explained above.
- Fresh hosted CI/security/performance status must be checked at the pushed head;
  old green results at `1a874c7` are not current-head acceptance.

Leave PR #13 draft. No merge, production deployment, main push, customer storage access
or human approval has occurred.

Production was rechecked after the hosted drill: canonical deployment still
`09cfaca3-989a-4c73-98ae-5a59b8927160`, commit
`a794d8f33f15972d4785860ab03805d56faf2c53`, production branch `main`.
