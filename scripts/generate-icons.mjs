import fs from 'node:fs';
import * as lucide from 'lucide-react';
const walk = d => fs.readdirSync(d, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const names = new Set(['CircleHelp']);
for (const p of walk('src')) {
 if (!/\.(jsx|js)$/.test(p) || p.endsWith('/icons.js')) continue;
 const s = fs.readFileSync(p,'utf8');
 for (const m of s.matchAll(/['"]([A-Z][A-Za-z0-9]+)['"]/g)) if (lucide[m[1]]) names.add(m[1]);
}
const sorted = [...names].sort();
fs.writeFileSync('src/lib/icons.js', `// Explicit imports keep the icon bundle deterministic and tree-shakeable.\nimport { ${sorted.join(', ')} } from 'lucide-react';\n\nexport const ICONS = Object.freeze({ ${sorted.join(', ')} });\nexport const resolveIcon = name => ICONS[name] || CircleHelp;\n`);
console.log(`Registered ${sorted.length} icons`);
