# Ductplanner independent audit — 7 November 2026

## Scope and safety

This audit used the `test/playwright-browser-audit-20261107` branch only. It did not deploy, merge, alter production data, or use customer projects. Browser testing used fresh isolated browser storage and synthetic customer data.

## Verified execution

| Check | Result | Evidence |
| --- | --- | --- |
| Node engineering tests | PASS — 32/32 | `npm test` and Actions browser-audit run 17 |
| Production build | PASS | `npm run build` and Actions build run 101 |
| Chromium browser audit including accessibility gate | PASS — 4/4 | Actions run 19, artifact `playwright-audit-results` |
| Isolated manual browser smoke | PASS | Created/reopened a synthetic project with FCU, condenser, diffuser and return grille |
| Gitleaks | PASS | Security run 2 |
| Semgrep community JavaScript rules | PASS | Security run 2 |
| OSV dependency scan | FINDINGS | See security section |

The browser audit captures full-page screenshots and retains trace/video/test output on failure. It fails on console exceptions and local HTTP failures. The axe-core check passed with no critical WCAG 2.0/2.1 AA violation on the dashboard in Actions run 19.

## Confirmed data-protection behaviour

The project code and tests implement browser-local IndexedDB storage, backup ZIP generation, and additive restore handling. Existing restoration tests cover same-ID conflict handling, newer-versus-older backup precedence, duplicate restore idempotence, and new-ID collision avoidance. This is valuable protection, but browser storage remains device-and-origin specific; an independently stored backup is required before relying on a drawing for work.

## Engineering checks

Existing automated unit coverage passed for airflow propagation/allocation, geometry and snapping angles, heat-load direction/window/insulation behaviour, PDF text extraction, backup restore, and materials/BOM reconciliation. The test suite does **not** yet constitute validation against an Australian HVAC design standard, manufacturer selection data, or a signed-off external calculation set. Heat-load factors, duct velocity limits, friction-loss assumptions, equipment selection and final materials must remain professionally reviewed per job.

## Security findings

OSV identified two findings in the lockfile, both reached only through the development-time `shadcn` CLI:

| ID | Package | Runtime exposure | Disposition |
| --- | --- | --- | --- |
| CVE-2026-118764 / GHSA-g3hv-75wg-m249 | `minimatch@10.2.6` | Not shipped in the browser bundle | Upstream `shadcn` currently resolves this version. Record and monitor; do not force an unreviewed override. |
| CVE-2026-93753 / GHSA-gcqx-w48m-w2h4 | `deepmerge@4.3.1` | Not shipped in the browser bundle | `deepmerge` has no newer published release at audit time; upstream `shadcn` dependency. Record and monitor. |

No secret leak was reported by Gitleaks and no Semgrep community-rule finding was reported. These checks do not replace review of browser-local project data or backups.

## Plandroid comparison

| Capability | Ductplanner evidence | Plandroid documented capability | Assessment |
| --- | --- | --- | --- |
| Local projects, multiple levels, reopen | Project dashboard, IndexedDB, tested restore | Customer/database and multi-level designs | Implemented locally; no shared database |
| Plan import and scale | PDF/image code paths, calibrated canvas | Image/PDF import and direct scale | Present; multi-page and invalid-file automation remain unverified |
| Interactive components/ducting | Drawing workspace, equipment and ducts, snapping tests | Catalog drag/drop, flexible and rigid components, snap-to | Core path present; catalog breadth and rigid-duct rules are not equivalent |
| Heat loads and airflow | Unit tests for heat loads and airflow | Area and material/weather loads; airflow solving | Partial; independent engineering benchmark absent |
| Automatic layout/sizing | `autoLayout` module | Automated layout and duct sizing | Present in code; browser acceptance case still required |
| BOM/takeoff | BOM reconciliation tests, WorkBrain takeoff module | Catalog costing, labour and Simpro/ServiceM8 uploads | Partial; no verified supplier catalog/costing or production integration |
| Outputs | PDF, DXF modules | PDF/report templates and 2D/3D DXF | Partial; export acceptance and output geometry have not been independently verified |
| Backup/restore | ZIP and additive restore tests | Native file save/load | Strong local recovery design; still needs separate backup media |

Plandroid comparison is based on its public documentation, not proprietary implementation.

## Defect register

| Priority | Finding | Reproduction / evidence | Status |
| --- | --- | --- | --- |
| P2 | Prior Playwright workflow could not reliably install a deterministic dependency tree | The branch lacked `package-lock.json`; CI used a transient test dependency install | Fixed on this branch with committed lockfile and `npm ci` |
| P3 | Vite warns that `__dirname` will be unsupported by its future native config loader | `npm run build` warning at `vite.config.js:24` | Logged; build currently succeeds |
| P3 | Main JavaScript output is 1.5 MB uncompressed (424 KB gzip) | `npm run build` bundle report | Logged; profile and split before scaling usage |
| P3 | Two OSV findings in a development-only transitive tool chain | Security run 2 SARIF | Monitor upstream; no unsupported forced override applied |

No P0 data-loss defect or P1 incorrect engineering result has been confirmed in this audit. That is not proof of production readiness: critical workflow coverage, output verification, benchmark designs and domain sign-off are still incomplete.

## Release assessment

**Not yet ready to be the sole authority for real HVAC design or quoting.** It is suitable for continued controlled development and synthetic/internal design trials with frequent independent backup. Before customer production use, add deterministic benchmark projects with independently checked results, acceptance tests for PDF/DXF/backup corruption and interrupted saves, validation of supplier/equipment data, and an explicit operational backup/restore drill.
