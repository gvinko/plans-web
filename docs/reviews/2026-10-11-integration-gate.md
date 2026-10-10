# Plans to Print — integration gate (2026-10-11)

Standalone product only. Do not merge WorkBrain, PlanDroid or HVAC functionality.

## Verified branch state
- Base: `plans-to-print-rebuild`, commit `13b27bb611f07e1001c7c508992678ee0dadc119`.
- `plans-to-print-joins` diverges: 1 ahead, 26 behind; merge base `af984a314e26d534da90f3b7a0b7226a50f3d48a`.
- `plans-to-print-safe-build` diverges: 4 ahead, 4 behind.
- Do not fast-forward or overwrite the rebuild branch with either divergent branch.
- `vite.config.ts` exists on rebuild; `vite.config.js`, `joinGeometry.ts`, and `.github/workflows/quality.yml` were not found there.
- PR #9 describes tested joins, but its code has not been verified on the current rebuild head.

## Required implementation and release gates
1. Rebase/cherry-pick join work onto a fresh branch from rebuild; resolve conflicts with current save/recovery and STL state. Preserve existing features.
2. Verify exactly one Vite configuration and correct Plans to Print PWA metadata. Keep automatic SW activation disabled during unsaved edits.
3. Run `npm ci`, `npm run lint`, `npm run test:geometry`, `npm run test:zip`, `npm run build`. Add regression tests for join watertightness, mating tolerance, transform invalidation and recovery.
4. In a real browser, test create/save/reload/reopen/delete, CAD controls, PDF/image calibration, STL import/export, lithophane preview, join generation and ZIP contents. Check Android and desktop.
5. Verify the Cloudflare Pages preview serves the actual Plans to Print build, not a redirect or legacy PlanDroid shell. Confirm cache updates do not lose work.
6. Merge only after required checks and manual release smoke pass. Unsupported arbitrary CSG/multi-contour cutting must remain clearly unavailable.

No implementation or deployment is claimed by this audit document.
