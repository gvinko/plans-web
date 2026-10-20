# Release checklist

Run from the repair branch; never use customer browser data for QA.

Current continuation from `3f52542`: [release preparation evidence](audits/RELEASE_PREPARATION_20261020.md).
Earlier CI/performance results below are historical. Actual DXF/BOM and A3/A4 design +
A3 shop PDFs now have disposable automated coverage and agent visual inspection.
Human acceptance is still missing; the project-document upload lifecycle finding is open.

- [x] Fetch/pull main; confirm production deployment commit matches the source baseline.
- [x] Keep database/schema/backup format compatible; no user storage reset.
- [x] Commit lockfile; execute clean npm ci and production build.
- [x] Validate explicit icons and fallback.
- [x] Execute disposable mobile Save, autosave/reload, quota failure/retry, empty save, corrupt drawing,
  PDF loading, ZIP preservation/atomic rejection, axe and offline reload browser checks.
- [x] Runtime dependency audit: zero vulnerabilities.
- [x] Full dependency audit locally: zero findings (continuation).
- [x] Local Lighthouse performance >=80, accessibility >=90, best practices >=90 (94/100/100).
- [x] Hosted PR build, 14 tests, performance (92/100/100), full security and CodeQL pass at `1a874c7`; artifacts retained.
- [x] Cloudflare preview build and disposable checks pass at application commit `1a874c7`:
  https://23a7a0b5.plans-web.pages.dev (9 passed, 5 source/local-only fixtures skipped there and passed in CI).
- [ ] Human review of remaining CAD workflows: ports, ties, bends, transitions, stock lengths,
  labels, BOM, DXF, scale and PDF print layout on representative disposable drawings.
- [x] Hosted rollback API rehearsal on a separate disposable project, including worker lifecycle and saved bytes (proxy deployments; see current evidence).
- [ ] Verify the actual production rollback package delivers the retirement overlay; a plain restore of the old deployment does not.
- [ ] Confirm no unresolved blockers, then merge/deploy production and verify deployment commit.

Cloudflare is connected to GitHub main for production and all other branches for previews. Pushing the
repair branch can create a preview automatically; do not change Cloudflare's production branch.
Preview storage is isolated by origin and is not a cloud copy of production drawings.

Earlier continuation: local same-origin baseline-artifact rollback, drawing/file byte comparison and worker
retirement passed. Current hosted rehearsal and its packaging limitation are recorded above. Earlier evidence:
[REPAIR_CONTINUATION.md](audits/REPAIR_CONTINUATION.md). Hosted automated gates pass for `1a874c7`;
human CAD/print review and production rollback packaging remain open.
