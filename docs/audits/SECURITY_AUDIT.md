# Security audit

Continuation: full npm audit now reports **zero vulnerabilities**, including development tools.
Removed vulnerable generator/LHCI dependency chains while preserving component CSS and Lighthouse
score gates. Raw `dependency-audit.json` is updated. See [current evidence](REPAIR_CONTINUATION.md).
Hosted full dependency-security and CodeQL both passed at application commit `1a874c7`.
The dependency findings below are historical.

`npm ci --ignore-scripts --no-fund` succeeded and a lockfile is committed. Node 22 is used in CI;
local verification used Node 24.21.0 / npm 11.19.0. Dependency scripts are disabled during CI installation.

Executed `npm audit --omit=dev --audit-level=high`: zero runtime vulnerabilities.
Full `npm audit`: initially 24 findings (18 high, 4 moderate, 2 low); compatible `basic-ftp`
6.2.3 and `tmp` 0.2.7 overrides reduced this to 17 (13 high, 4 moderate).
See `dependency-audit.json` for advisory URLs, affected versions and dependency paths.
Remaining direct affected development tools are shadcn and @lhci/cli. Their chains include braces,
extract-zip, sprintf-js and uuid; npm's proposed top-level fixes are breaking downgrades.
No forced downgrade or untested major dependency replacement was applied. These findings block release.

CI has read-only contents by default. Build publishing alone receives contents:write, after tests
and dependency gates. Pull requests never execute publication. CodeQL gets security-events:write
only in its analysis job. Hosted CodeQL analysis for repair application commit `3636ad4` completed successfully;
the hosted dependency-security job failed on the documented advisories. These are distinct gates.

Restore rejects malformed or incomplete backups before writing; writes are atomic and do not delete
existing records. Same IDs overwrite by established design. Treat imported ZIPs as untrusted; file-size/
decompression budgets and very large backup stress tests are not implemented in this repair.

New headers deny framing, prevent MIME sniffing and restrict referrer information. A strict CSP was
not added without testing PDF blob workers and existing inline SVG/style requirements. No new backend,
paid service, credentials or remote data synchronization was introduced. PDF's existing CDN fallback remains.
Offline shell caches only listed static same-origin assets, never project content. Old worker retirement
does not delete caches/IndexedDB or force a tab reload. Old shell caches are retained for safe rollback;
automatic cache pruning is intentionally absent and disk usage should be monitored.
