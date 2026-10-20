# Icon audit

`src/lib/icons.js` explicitly imports 74 Lucide exports. `ApperIcon` preserves PascalCase and kebab
names and renders CircleHelp for unknown/missing names; decorative SVGs are hidden from assistive
technology. No missing currently referenced Lucide export was reproduced with the resolved package.
The previous implementation silently rendered nothing for unsupported names and imported the whole namespace.

`npm run test:icons` executed successfully: 96 literal, conditional and CAD tool references validated;
74 registry entries; unknown/absent-name fallback assertions passed. Tool-array shape is asserted so
restructuring it cannot silently skip validation. Runtime-computed names still need explicit coverage
when new configuration sources are added. `scripts/generate-icons.mjs` can seed imports after intentional changes;
review its output and run validation. Never regenerate just to hide a failure.

HVAC plan symbols in HvacSymbol and SVG drawing geometry were not replaced by generic icons.
Button titles provide accessible names where no explicit aria-label exists. Projects, mobile Backup,
Save and parts search have explicit labels. Coarse-pointer controls have 44px minimum targets.
