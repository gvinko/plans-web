# Release checklist

Run from the repair branch; never use customer browser data for QA.

- [x] Fetch/pull main; confirm production deployment commit matches the source baseline.
- [x] Keep database/schema/backup format compatible; no user storage reset.
- [x] Commit lockfile; execute clean npm ci and production build.
- [x] Validate explicit icons and fallback.
- [x] Execute disposable mobile Save, autosave/reload, quota failure/retry, empty save, corrupt drawing,
  PDF loading, ZIP preservation/atomic rejection, axe and offline reload browser checks.
- [x] Runtime dependency audit: zero vulnerabilities.
- [x] Full dependency audit locally: zero findings (continuation).
- [x] Local Lighthouse performance >=80, accessibility >=90, best practices >=90 (94/100/100).
- [ ] Hosted PR build/tests and CodeQL pass; retain artifacts.
- [x] Cloudflare preview build and disposable checks pass at application commit `3636ad4`:
  https://aeb40e50.plans-web.pages.dev (9 passed, local-only ZIP harness skipped there).
- [ ] Human review of remaining CAD workflows: ports, ties, bends, transitions, stock lengths,
  labels, BOM, DXF, scale and PDF print layout on representative disposable drawings.
- [ ] Verify rollback on a disposable deployment, including service worker lifecycle and saved records.
- [ ] Confirm no unresolved blockers, then merge/deploy production and verify deployment commit.

Cloudflare is connected to GitHub main for production and all other branches for previews. Pushing the
repair branch can create a preview automatically; do not change Cloudflare's production branch.
Preview storage is isolated by origin and is not a cloud copy of production drawings.

Continuation: local same-origin baseline-artifact rollback, drawing/file byte comparison and worker
retirement passed; actual hosted deployment rollback remains open. Current CAD and validation evidence:
[REPAIR_CONTINUATION.md](audits/REPAIR_CONTINUATION.md). Local passes do not close hosted release gates.
