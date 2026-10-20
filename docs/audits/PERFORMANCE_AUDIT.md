# Performance audit

Continuation: Lighthouse 13.5 direct runner replaces vulnerable LHCI. Local serial mobile runs
scored **93/94/94**, accessibility and best practices **100** throughout; unchanged 80/90/90 gates
passed. Editor loading is deferred and Geist is self-hosted. CI runs performance separately.
Hosted CI at `1a874c7` also passed: mobile performance 93/91/92 (median 92), accessibility and
best practices 100. See [current evidence](REPAIR_CONTINUATION.md) for metrics and tool-version caveats.
The remaining paragraphs record earlier runs, not the current runner configuration.

Lighthouse CI is reproducible with `npm run build` then `npm run audit:lighthouse`.
Gate: performance >=80, accessibility >=90, best practices >=90. One mobile simulated run per invocation;
results are machine-sensitive, not real-user field metrics. Reports live in `.lighthouseci`.

Before deferring PDF/ZIP imports, measured performance varied 80 then 74, accessibility 100,
best practices 100, SEO 82. The 74 run failed its gate; that failure is retained here rather than
reported as passing. The 80 run measured FCP 3429ms, LCP 3626ms, TBT 181ms, CLS 0.

PDF reader now loads only when opening a PDF. ZIP code loads only for backup/restore.
Measured build output changed from approximately 702.7KB entry + 664.5KB projects to
606.3KB entry + 336.0KB projects, plus deferred PDF 329.3KB and ZIP 95.9KB (uncompressed).
CSS is 123.6KB; PDF worker 1375.8KB. Vite still warns about an entry chunk over 500KB.
After deferring both readers, the next measured Lighthouse run scored performance 78,
accessibility 100, best practices 100, SEO 82. The performance gate still failed; it was not lowered.
Final measured run at 2026-10-20 02:09:56 UTC reproduced 78/100/100/82: FCP 3510ms,
LCP 4297ms, TBT 27ms, CLS 0, speed index 3664ms. Deferred loading reduced startup JS,
but the performance release gate remains open.
GitHub Actions for application commit `3636ad4` passed all 10 functional tests (32.5s), then
Lighthouse performance scored **52** and failed the same 80 gate. This hosted result is not
replaced by the higher local score. See PR #13's Build Ductplanner artifacts for its full report.
Offline precaching downloads these assets after opening online; offline first visit is unsupported.
No claim of a production-source baseline comparison: the source baseline was not rebuilt separately.
