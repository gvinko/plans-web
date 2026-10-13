# Plans to Print — Progress

## Current stage
Stage 1 — repository audit, navigation and data-loss prevention. Working branch: `rebuild/stage-1`, based on `plans-to-print-rebuild`, NOT main.

## Completed and verification
- Verified GitHub repository `gvinko/plans-web` via connected GitHub repository search; default branch is `main`.
- Inspected root of main, AGENTS.md and main package.json, and src directory on rebuild branch.
- Found existing draft rebuild PR #6, integration PR #9, validation PR #10; preserve their work and do not merge blindly.
- Confirmed main package.json still identifies `plandroid-web`, so main is not the standalone release baseline.
- Created this dedicated stage branch from `plans-to-print-rebuild` without modifying main or existing projects.
- No runtime, console, automated test, browser, deployment or physical-printer test has been executed yet. No functionality is certified.

## Audit: findings / risks
- The default branch and standalone rebuild branch have diverged. The standalone rebuild is the appropriate starting point; existing PRs may contain later fixes not yet integrated.
- Existing PR #6 describes guarded autosave, Dexie persistence, STL export, plan/photo import, and geometry validation, but its own acceptance criteria say deployed browser save/reopen and deletion need re-testing. Treat these as unverified, not passed.
- PR #9 describes join geometry and PR #10 a release gate; neither should be assumed integrated into this stage branch.
- Legacy branding persists on main. Check all routes, controls, PWA manifest and build identities on the rebuild branch.
- Audit pending: actual console errors, navigation routes, IndexedDB migrations, empty-save protection, mobile layout and exports. No unsupported claim that any particular control is broken.

## In progress — exact next steps
1. Inspect rebuild branch `src/App.tsx`, `src/db/*`, `src/store/*`, project save/autosave logic and current branch package.json.
2. Add regression tests proving a populated project cannot be overwritten by an empty transient canvas; verify migration and recovery without deleting old records.
3. Run lint, build and available tests, fix failures, then verify on the Cloudflare preview.
4. Commit implementation to this branch and update this file with actual test evidence.

## Known bugs
- Rebuild PR #6 records unresolved browser acceptance around saved-project reopening and deletion; reproduce before claiming fixed.

## Blocked / needs user
- No account authorization requested yet.
- **Needs hardware test:** actual P1S and AMS printing, filament feeding and Bambu Studio device behaviour.

## Preview URL
Not verified. Do not assume `plan2print.pages.dev`, the prior Vercel URL or an automatic stage preview is current.

## Next priorities
Stage 2 real manifold-3d CAD solids and watertight STL; Stage 3 P1S/AMS and 3MF; then floor plans, generators, inventory and image tools. Preserve standalone product boundary.
