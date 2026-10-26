// Spec & plan text: search, "things to check" and a cross-check against the parts list.
// Pure functions — no React, no PDF library — so they can be tested on their own.
// A "source" is { id, kind: 'spec' | 'plan', name, pages: string[] } (one string per PDF page).

// pdf.js text items → page text with line breaks where the text moves to a new line.
export function pageTextFromItems(items) {
  let out = '';
  let lastY = null;
  for (const it of items || []) {
    const str = it.str ?? '';
    const y = Array.isArray(it.transform) ? it.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { if (!out.endsWith('\n')) out += '\n'; } // one break per line (hasEOL may have added it)
    else if (out && !out.endsWith(' ') && !out.endsWith('\n') && str && !str.startsWith(' ')) out += ' ';
    out += str;
    if (it.hasEOL) out += '\n';
    if (y !== null) lastY = y;
  }
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Little or no text on most pages means a scanned PDF (needs OCR to search).
export function looksScanned(pages) {
  if (!pages?.length) return false;
  const thin = pages.filter((t) => (t || '').replace(/\s/g, '').length < 40).length;
  return thin / pages.length > 0.6;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "R1.5", "fire damper", 'lined' → a regex. Spaces match any run of spaces / line breaks.
export function queryRegex(q) {
  const t = String(q || '').trim();
  if (!t) return null;
  return new RegExp(t.split(/\s+/).map(esc).join('[\\s\\-]+'), 'gi');
}

// The sentence (or line) around a match, trimmed to a readable length.
export function snippet(text, index, length, max = 220) {
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  let start = Math.max(before.lastIndexOf('. ') + 2, before.lastIndexOf('\n') + 1, index - max / 2, 0);
  if (start > 0 && /\S/.test(text[start - 1] || '')) { const sp = text.indexOf(' ', start); if (sp > 0 && sp < index) start = sp + 1; } // don't start mid-word
  const endRel = after.search(/(\.\s|\n\n)/);
  const end = Math.min(index + length + (endRel >= 0 ? endRel + 1 : after.length), index + length + max / 2);
  const s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return { text: s, pre: start > 0, post: end < text.length, at: index - start };
}

// Clause number nearest above a match, e.g. "4.3.2" — specs are read by clause.
export function clauseAt(text, index) {
  const eol = text.indexOf('\n', index);
  const head = text.slice(0, eol < 0 ? text.length : eol); // include the match's own line (it may be the heading)
  const lines = head.split('\n').reverse();
  for (const ln of lines.slice(0, 40)) {
    const m = ln.match(/^\s*((?:\d+\.){1,4}\d+|[A-Z]\d{1,3}(?:\.\d+)*)\s+\S/);
    if (m) return m[1];
  }
  return '';
}

/** Search every source. Returns [{ sourceId, kind, name, page (1-based), clause, snippet }] in document order. */
export function searchSources(sources, q, limit = 300) {
  const re = queryRegex(q);
  if (!re) return [];
  const hits = [];
  for (const src of sources) {
    (src.pages || []).forEach((text, i) => {
      if (!text) return;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) && hits.length < limit) {
        hits.push({ sourceId: src.id, kind: src.kind, name: src.name, page: i + 1, clause: clauseAt(text, m.index), match: m[0], snippet: snippet(text, m.index, m[0].length) });
        if (m[0].length === 0) re.lastIndex += 1;
      }
    });
  }
  return hits;
}

// What an HVAC estimator wants flagged in a spec. `bom` = words that show it's on the parts list.
export const WATCH = [
  { id: 'lined', group: 'Ductwork', label: 'Internally lined / acoustic duct', re: /internal(?:ly)?[\s-]+lin(?:ed|ing)|acoustic(?:ally)?[\s-]+lin(?:ed|ing)|duct[\s-]+lining|perforated[\s-]+lin/gi },
  { id: 'insul', group: 'Ductwork', label: 'Insulation / R-value', re: /\bR\s?-?\s?\d(?:\.\d)?\b|insulat(?:ion|ed)|lagging|vapour[\s-]+barrier/gi, bom: /insul|lag|R\d/i },
  { id: 'class', group: 'Ductwork', label: 'Duct pressure class / sealing / leakage', re: /pressure[\s-]+class|seal(?:ing)?[\s-]+class|leakage[\s-]+(?:test|class)|AS\s?4254/gi },
  { id: 'material', group: 'Ductwork', label: 'Duct material (galv / stainless / Colorbond)', re: /stainless[\s-]+steel|colorbond|aluminium[\s-]+duct|\bZ\s?275\b|galvanised/gi },
  { id: 'flex', group: 'Ductwork', label: 'Flexible duct limits', re: /flexible[\s-]+duct|flex(?:ible)?[\s-]+(?:length|max|maximum)|max(?:imum)?\.?[\s-]+\d+\s?m(?:m|etres?)?[\s-]+(?:of[\s-]+)?flex/gi },
  { id: 'fd', group: 'Fire & smoke', label: 'Fire dampers', re: /fire[\s-]+damper|AS\s?1682|fire[\s-]+rated|fire[\s-]+wall|fire[\s-]+compartment/gi, bom: /fire\s*damper|\bFD\b/i },
  { id: 'smoke', group: 'Fire & smoke', label: 'Smoke control / smoke dampers', re: /smoke[\s-]+(?:damper|control|spill|exhaust|detector)|AS\s?1668\.1|stair[\s-]+pressur/gi, bom: /smoke/i },
  { id: 'vcd', group: 'Dampers & balancing', label: 'Volume / balancing dampers', re: /volume[\s-]+control[\s-]+damper|balancing[\s-]+damper|\bVCDs?\b|opposed[\s-]+blade/gi, bom: /\bVCD\b|volume\s*(control\s*)?damper|balancing\s*damper/i },
  { id: 'balance', group: 'Dampers & balancing', label: 'Air balancing / commissioning', re: /commission(?:ing|ed)|air[\s-]+balanc|balancing[\s-]+report|test(?:ing)?[\s-]+and[\s-]+balanc|\bTAB\b|witness(?:ed)?[\s-]+test/gi },
  { id: 'access', group: 'Fittings', label: 'Access panels / doors', re: /access[\s-]+(?:panel|door|hatch)s?/gi, bom: /access\s*(panel|door|hatch)/i },
  { id: 'blank', group: 'Fittings', label: 'Blank off / blanking plates', re: /blank(?:ing)?[\s-]+(?:off[\s-]+)?plates?|blanked[\s-]+off/gi, bom: /blank/i },
  { id: 'flexconn', group: 'Fittings', label: 'Flexible connections (canvas)', re: /flexible[\s-]+connect|canvas[\s-]+connect|anti[\s-]+vibration/gi, bom: /flexible\s*(canvas\s*)?connection|canvas/i },
  { id: 'atten', group: 'Fittings', label: 'Attenuators / silencers / acoustic', re: /attenuator|silencer|sound[\s-]+level|\bNR\s?\d{2}\b|\bdB\(?A?\)?|acoustic[\s-]+(?:report|consultant|requirement)/gi, bom: /attenuat|silencer/i },
  { id: 'louvre', group: 'Fittings', label: 'Louvres / bird mesh / weather', re: /louvres?|bird[\s-]+(?:mesh|wire|proof)|weather[\s-]*proof/gi, bom: /louvre/i },
  { id: 'filter', group: 'Equipment', label: 'Filters (grade / MERV / G4 / F7)', re: /\bG[3-4]\b|\bF[5-9]\b|\bMERV\s?\d+|\bHEPA\b|filter[\s-]+(?:grade|class|media)/gi, bom: /filter/i },
  { id: 'brand', group: 'Equipment', label: 'Specified brands / no substitutes', re: /approved[\s-]+equivalent|or[\s-]+equal|no[\s-]+substitut|nominated[\s-]+(?:supplier|brand)|\b(?:Daikin|Mitsubishi|Fujitsu|Actron(?:Air)?|Temperzone|Carrier|Trane|Fantech|Holyoake|Ruskin|Bradflo|Airtrol|Halton|Panasonic|Samsung|LG|Toshiba|Rinnai|Brivis|Braemar)\b/gi },
  { id: 'bms', group: 'Controls', label: 'BMS / controls / integration', re: /\bBMS\b|BACnet|modbus|building[\s-]+management|controls?[\s-]+contractor|interface[\s-]+with/gi },
  { id: 'elec', group: 'Electrical', label: 'Electrical by whom / isolators', re: /isolat(?:or|ing)[\s-]+switch|electrical[\s-]+contractor|power[\s-]+by[\s-]+others|\bRCBO\b|switchboard/gi },
  { id: 'scope', group: 'Scope & money', label: '“By others” / provisional sums / allowances', re: /by[\s-]+others|provisional[\s-]+sum|prime[\s-]+cost|\bPC[\s-]+sum|contractor[\s-]+(?:to|shall)[\s-]+allow|allow[\s-]+for|not[\s-]+in[\s-]+contract|\bNIC\b|excluded/gi },
  { id: 'docs', group: 'Scope & money', label: 'Shop drawings / O&M manuals / as-builts', re: /shop[\s-]+drawings?|workshop[\s-]+drawings?|O\s?&\s?M|operation[\s-]+and[\s-]+maintenance|as[\s-]+(?:built|installed)[\s-]+drawings?|submittal/gi },
  { id: 'warranty', group: 'Scope & money', label: 'Warranty / defects / maintenance period', re: /warrant(?:y|ies)|defects?[\s-]+liability|maintenance[\s-]+period|\d+[\s-]+(?:month|year)s?[\s-]+(?:maintenance|warranty)/gi },
  { id: 'standards', group: 'Compliance', label: 'Standards & codes called up', re: /\bAS(?:\/NZS)?\s?\d{3,5}(?:\.\d+)*|\bNCC\b|\bBCA\b|section[\s-]+J\b/gi },
  { id: 'access_site', group: 'Site', label: 'Site access / hours / cranes / heights', re: /working[\s-]+hours|after[\s-]+hours|\bcrane\b|scissor[\s-]+lift|\bEWP\b|working[\s-]+at[\s-]+heights?|roof[\s-]+access|out[\s-]+of[\s-]+hours/gi },
];

/** Scan sources for each watch item (plus the user's own words). Returns [{ id, group, label, count, hits:[...] }] with count > 0. */
export function scanWatch(sources, extraWords = [], perItem = 40) {
  const rules = [
    ...WATCH,
    ...extraWords.map((w) => String(w).trim()).filter(Boolean).map((w) => ({ id: `my:${w.toLowerCase()}`, group: 'My words', label: w, re: queryRegex(w) })),
  ];
  const out = [];
  for (const rule of rules) {
    const hits = [];
    let count = 0;
    for (const src of sources) {
      (src.pages || []).forEach((text, i) => {
        if (!text) return;
        const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
        let m;
        while ((m = re.exec(text))) {
          count += 1;
          if (hits.length < perItem) hits.push({ sourceId: src.id, kind: src.kind, name: src.name, page: i + 1, clause: clauseAt(text, m.index), match: m[0], snippet: snippet(text, m.index, m[0].length) });
          if (m[0].length === 0) re.lastIndex += 1;
        }
      });
    }
    if (count) out.push({ id: rule.id, group: rule.group, label: rule.label, count, hits, bom: rule.bom || null });
  }
  return out;
}

/**
 * Spec items that have a parts-list equivalent, checked against what's on the list.
 * bomRows: [{ name, qty }]. Returns [{ id, label, mentions, onList: [{name, qty}], missing: boolean, hit }].
 */
export function crossCheck(watchResults, bomRows) {
  return watchResults
    .filter((w) => w.bom && w.hits.some((h) => h.kind === 'spec' || h.kind === 'plan'))
    .map((w) => {
      const onList = bomRows.filter((r) => w.bom.test(r.name));
      return { id: w.id, label: w.label, mentions: w.count, onList, missing: onList.length === 0, hit: w.hits[0] };
    })
    .sort((a, b) => Number(b.missing) - Number(a.missing) || b.mentions - a.mentions);
}
