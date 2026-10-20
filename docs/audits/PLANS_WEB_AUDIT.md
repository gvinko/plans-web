# Plans Web repair audit — 20 October 2026

Current continuation evidence and blockers: [REPAIR_CONTINUATION.md](REPAIR_CONTINUATION.md).
The report below records the earlier `d89f7a6` state; its dependency/performance blockers
are superseded locally by the continuation, pending hosted verification.

Branch: `audit/plans-web-repair-20261020`. Baseline: `a794d8f33f15972d4785860ab03805d56faf2c53`.
Fetched and fast-forward pulled GitHub main before editing. Cloudflare's canonical deployment
`09cfaca3-989a-4c73-98ae-5a59b8927160` reports exactly that commit, successfully deployed
19 October. Production returned HTTP 200 on 20 October. No production merge or deployment performed.

## Changes

- Explicit Lucide registry, visible fallback, validation, accessible button names and touch targets.
- Mobile Save and status remain visible in a fixed two-row mobile header. Desktop remains compact.
- Concurrent save guard; newer changes remain dirty and are retried; failed saves block Back/level switching.
- Unreadable drawings cannot be saved over. Empty replacements require explicit Save confirmation.
- Failure messages distinguish a retained draft from unavailable recovery storage. Page hiding writes a synchronous drawing draft before attempting IndexedDB save.
- Removed the partial-save fallback that reported success while dropping plan/photo metadata.
- Blocked preference storage no longer crashes app startup; this has a disposable browser regression test.
- ZIP export uses a consistent read transaction. Restore validates format, IDs, drawing shape, file references and missing files before its write transaction. Existing records are merged, never deleted. Matching IDs still overwrite: back up before restoring.
- Separate versioned offline app shell, manifest, non-destructive old worker retirement, no automatic tab reload. PDF and ZIP libraries load on demand.
- Lockfile, browser/axe tests, Lighthouse CI, dependency security gates, CodeQL workflow, read-only CI except the isolated build publication job.

## Data safety

Dexie remains `ductplanner`, version 1, with the same tables and saved field names.
Backup remains `backup.json`, `app: Ductplanner`, format 1, `files/<key>`.
Every executed browser test uses a new disposable Playwright context. No personal browser profile,
customer project or production IndexedDB was opened. Browser storage was never cleared.
Projects stay local to their browser and origin. Preview has separate storage. There is no cloud sync.

## Evidence and release decision

Final source build passed. `npm test` passed all 10 Chromium tests in 41.4 seconds, including
tap-by-tap multi-bend duct creation as one saved run, PDF import and legacy ZIP format compatibility.
Desktop and mobile screenshots were visually inspected. Icon validation passed 96 references.
Final Lighthouse measurement: performance 78, accessibility 100, best practices 100, SEO 82;
the 80 performance gate failed. Full dependency gate also failed (13 high, 4 moderate development findings).

See [icon audit](ICON_AUDIT.md), [performance audit](PERFORMANCE_AUDIT.md),
[accessibility audit](ACCESSIBILITY_AUDIT.md), [security audit](SECURITY_AUDIT.md),
[release gates](../RELEASE_CHECKLIST.md), and [rollback](../ROLLBACK_PROCEDURE.md).
Raw dependency findings are in `dependency-audit.json`; browser traces and Lighthouse reports are
generated locally and uploaded by CI, not checked in.

The initial install/build attempts failed while dependencies were incomplete; a subsequent clean
`npm ci --ignore-scripts --no-fund` succeeded. Early browser tests exposed mobile status clipping,
Backup contrast and offline cache matching against `Vary: Origin`; all were repaired and retested.
The first test run also had an ambiguous project button selector; the selector now excludes Delete.
Final-lockfile clean installation also succeeded (749 packages, 17 development advisories). Its first
attempt hit a Windows native-module file lock; stopping the task's local preview resolved it.
The first post-install browser rerun had 9 passes and a PDF-render wait exceeding the test's
5-second default while still rendering. That assertion now has a bounded 30-second wait; no sleep,
retry masking or relaxed functional assertion was added.

Production release is blocked by unresolved development dependency advisories, pending hosted CI
and preview validation, and an unexecuted production rollback drill. Do not interpret a successful
build or a zero-runtime-dependency audit as approval to merge.

## Hosted verification

Draft PR: https://github.com/gvinko/plans-web/pull/13. Initial application commit `9eb3482` deployed
successfully to https://2a3491a6.plans-web.pages.dev. Its hosted CodeQL analysis passed; dependency
security failed as expected. CI browser tests had 9 passes and one drawing-tool test startup race
(keypress sent before workspace readiness). The test now waits for Loaded saved drawing and selects
the tool explicitly before drawing and finishing with Escape.

First preview browser run: 8 passed, 1 failed, 1 skipped (local-source ZIP harness). Actual Cloudflare
offline navigation failed: `/index.html` redirects to `/`, so a cached redirected response could not
serve offline navigation. Worker generation now precaches canonical `/` instead. Preview document
and worker returned HTTP 200 with no-cache, correct JS MIME, nosniff and frame-denial headers.
Retests are required after this repair; initial preview failure is not counted as a pass.

Retest of application commit `3636ad4ead476d47a41defc133debc1961e4112d`:

- Clean production build passed; local suite: **10 passed, 42.6s**.
- Cloudflare preview: https://aeb40e50.plans-web.pages.dev, deployment `aeb40e50-0495-4f92-8d07-26efbf974c9d`, successful.
- Hosted preview suite: **9 passed, 1 intentionally skipped, 40.2s**. The skipped source-module ZIP
  harness is local-only and passed in the local suite. Offline reload now passes on Cloudflare.
- Production rechecked through Cloudflare: still deployment `09cfaca3`, main commit `a794d8f`.
- GitHub Actions at `3636ad4`: all **10 browser tests passed, 32.5s**; CodeQL passed. The combined
  test job then failed its Lighthouse performance assertion: **52 against 80**. Dependency security
  failed separately. Build publication was skipped; no gate was bypassed.
- Subsequent audit documentation commits do not change application assets. This is the immutable
  preview and exact application commit tested, not a claim that future branch commits were tested.

Remaining release blockers: full dependency security, Lighthouse performance (78 local, 52 CI, gate 80),
manual representative CAD/export review and rollback rehearsal.
