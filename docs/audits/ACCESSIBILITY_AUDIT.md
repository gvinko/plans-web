# Accessibility audit

Executed axe-core WCAG 2 A/AA and 2.1 AA checks on the projects screen and empty drawing workspace
in disposable Chromium contexts. Both passed with zero violations after fixing Backup's white-on-amber
contrast (previously 3.19:1). Save/status visibility is also exercised at 390 × 844.

Status uses `role=status` with polite announcements. Decorative icons are hidden. Button titles are
used as accessible names; mobile Projects/Backup/Save and parts search are explicitly labelled.
Coarse pointers receive minimum 44 × 44px button targets. Mobile header height is constant regardless
of selection, with its sticky toolbar positioned below it.

Lighthouse projects-screen accessibility scored 100 in measured runs. This is not a full accessibility
certification: selected-part editors, every modal, dark theme, actual touch devices and screen-reader
operation need further coverage. SVG CAD manipulation still depends substantially on pointer use.
