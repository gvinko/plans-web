// Indoor ducted unit specifications, keyed by indoor model code.
// c / h = rated cooling / heating kW · ls = high-fan airflow L/s
// esp = [min, max] external static Pa · dims = net H x W x D mm (W = length on plan, D = depth)
// check = a figure needs confirming against the data book (see note)
// Sources: Fujitsu Ducted Range brochure AU (Oct 2023) and Fujitsu product pages;
// Daikin Ducted brochure PCDUAU0126 (2026); Mitsubishi Electric PEAD/PEA brochures;
// ActronAir Aires R-32 catalogue 9590-0027-01.

const FJ = 'Fujitsu Ducted Range AU brochure (Oct 2023)';
const FJP = 'Fujitsu product page (generalairstage.com.au)';
const DK = 'Daikin Ducted brochure 2026 (PCDUAU0126)';
const ME = 'Mitsubishi Electric PEAD brochure';
const MEA = 'Mitsubishi Electric PEA brochure';
const AC = 'ActronAir Aires R-32 catalogue 9590-0027-01';

const fj = (c, h, ls, esp, dims, kg, extra = {}) => ({ c, h, ls, esp, dims, kg, src: FJ, ...extra });
const HS1 = [400, 1050, 500];
const HS2 = [425, 1250, 490];
const HS3 = [360, 1400, 850];
const MS1 = [240, 1000, 700];
const MS2 = [240, 1400, 700];

export const UNIT_SPECS = {
  // Fujitsu high static R32
  ARTH24KHTA: fj(7.1, 8.0, 500, [60, 210], HS1, 38),
  ARTH30KHTA: fj(8.5, 10.0, 695, [60, 210], HS1, 39),
  ARTH36KHTA: fj(10.0, 11.2, 695, [60, 210], HS1, 39),
  ARTH45KHTA: fj(12.5, 14.0, 903, [60, 260], HS2, 53),
  ARTH54KHTA: fj(14.0, 15.5, 903, [60, 260], HS2, 53, { check: true, note: 'Airflow: brochure says 986 L/s, Fujitsu spec page says 903 L/s. Using the lower figure.' }),
  ARTH60KHTA: fj(15.5, 18.0, 986, [60, 260], HS2, 53),
  'ARTH30KHTA-HP': fj(8.5, 10.0, 695, [60, 210], HS1, 39),
  'ARTH36KHTA-HP': fj(10.0, 12.5, 695, [60, 210], HS1, 39),
  'ARTH45KHTA-HP': fj(12.5, 15.0, 903, [60, 260], HS2, 53),
  'ARTH54KHTA-HP': fj(14.0, 16.5, 986, [60, 260], HS2, 53),
  ARTH60KHTB: fj(16.0, 18.0, 1139, [60, 250], HS3, 69),
  'ARTH36KHTA-3PH': fj(10.0, 11.2, 695, [60, 210], HS1, 39),
  'ARTH45KHTA-3PH': fj(12.5, 14.0, 903, [60, 260], HS2, 53),
  'ARTH54KHTA-3PH': fj(14.0, 15.5, 986, [60, 260], HS2, 53),
  'ARTH60KHTA-3PH': fj(15.5, 18.0, 986, [60, 260], HS2, 53),
  'ARTH65KHTA-3PH': fj(18.0, 20.0, 1139, [60, 200], HS3, 69, { src: FJP }),
  'ARTH72KHTA-3PH': fj(20.0, 22.4, 1194, [60, 200], HS3, 69, { src: FJP }),
  'ARTH90KHTA-3PH': fj(22.4, 25.0, 1400, [60, 200], HS3, 79, { src: FJP }),
  // Fujitsu mid static slimline R32
  ARTH18KMTAP: fj(5.0, 6.0, 300, [50, 150], MS1, 31),
  ARTH24KMTAP: fj(7.1, 8.0, 416, [50, 150], MS1, 31),
  ARTH30KMTAP: fj(8.5, 10.0, 541, [50, 150], MS2, 42),
  ARTH36KMTAP: fj(10.0, 11.2, 575, [50, 150], MS2, 42),
  ARTH45KMTAP: fj(12.5, 14.0, 600, [50, 150], MS2, 42),
  ARTH54KMTAP: fj(13.0, 15.0, 600, [50, 150], MS2, 42),
  'ARTH24KMTAP-HP': fj(7.1, 8.0, 416, [50, 150], MS1, 31),
  'ARTH30KMTAP-HP': fj(8.5, 10.0, 541, [50, 150], MS2, 42),
  // Fujitsu bulkhead R32 (static pressure not published as a range)
  ARTH09KSLAP: fj(2.5, 3.2, 167, null, [198, 700, 450], 15.5),
  ARTH12KSLAP: fj(3.5, 4.0, 181, null, [198, 700, 450], 15.5),
  ARTH18KSLAP: fj(5.0, 6.0, 261, null, [198, 900, 450], 18.5),
  ARTH09KLLAP: fj(2.5, 3.2, 167, null, [198, 700, 620], 17),
  ARTH12KLLAP: fj(3.5, 4.0, 181, null, [198, 700, 620], 17),
  ARTH18KLLAP: fj(5.0, 6.0, 261, null, [198, 900, 620], 20),
  // Fujitsu R410A
  ARTG65LHTA: fj(18.0, 20.0, 1139, [60, 200], HS3, 69),
  ARTG72LATU: fj(20.3, 22.6, 1195, [50, 250], [450, 1587, 700], 100, { check: true, note: 'Brochure lists this unit as ARTC72LATU.' }),
  ARTG90LATU: fj(25.0, 28.0, 1347, [50, 250], [550, 1587, 700], 110, { check: true, note: 'Brochure lists this unit as ARTC90LATU.' }),

  // Daikin (capacity, airflow max and weight from the brochure; cabinet sizes still to add)
  ...Object.fromEntries([
    ['FDYAN50A', 5.0, 6.0, 370, 37], ['FDYAN60A', 6.0, 7.0, 400, 37], ['FDYAN71A', 7.1, 7.5, 566, 40], ['FDYAN85A', 8.5, 10.0, 600, 40],
    ['FDYAN100A', 10.0, 12.5, 800, 45], ['FDYAN125A', 12.5, 15.0, 840, 55], ['FDYAN140A', 14.0, 16.5, 1000, 55], ['FDYAN160A', 15.5, 18.0, 1120, 56],
    ['FDYA71A9', 7.1, 7.5, 566, 40], ['FDYA85A9', 8.5, 10.0, 600, 41], ['FDYA100A9', 10.0, 12.5, 800, 46], ['FDYA125A9', 12.5, 15.0, 840, 56],
    ['FDYA140A9', 14.0, 16.5, 1000, 60], ['FDYA160A9', 16.0, 18.0, 1120, 60], ['FDYA180A', 18.0, 20.0, 1200, 70], ['FDYA200A', 20.0, 22.4, 1300, 77],
    ['FBA50BA', 5.0, 6.0, 300, 37], ['FBA60BA', 6.0, 7.1, 300, 37], ['FBA71B', 7.1, 8.0, 383, 37], ['FBA85B', 8.5, 10.0, 533, 47],
    ['FBA100B', 10.0, 12.0, 533, 47], ['FBA125B', 12.5, 15.0, 600, 47], ['FBA140B', 14.0, 16.5, 600, 47],
    ['FDYBA25A', 2.5, 3.5, 150, null], ['FDYBA35A', 3.5, 4.0, 195, null], ['FDYBA50A', 5.0, 6.0, 240, null], ['FDYBA60A', 6.0, 7.0, 325, null], ['FDYBA71A', 7.1, 8.0, 325, null],
  ].map(([code, c, h, ls, kg]) => [code, { c, h, ls, kg, esp: /^FBA/.test(code) ? [null, 150] : null, dims: null, src: DK, check: true, note: 'Cabinet size not in the brochure — add from the Daikin data book.' }])),

  // Mitsubishi Electric PEAD (selectable ESP 35/50/70/100/125 Pa)
  'PEAD-M50JAAD': { c: 5.0, h: 6.0, ls: 283, esp: [35, 125], dims: [250, 900, 732], kg: 26, src: ME },
  'PEAD-M60JAAD': { c: 6.0, h: 7.0, ls: 350, esp: [35, 125], dims: [250, 1100, 732], kg: 29, src: ME },
  'PEAD-M71JAAD': { c: 7.1, h: 8.0, ls: 417, esp: [35, 125], dims: [250, 1100, 732], kg: 30, src: ME },
  'PEAD-M100JAAD': { c: 10.0, h: 11.2, ls: 567, esp: [35, 125], dims: [250, 1400, 732], kg: 39, src: ME, check: true, note: 'Width 1400 assumed from the shared size table.' },
  'PEAD-M125JAAD': { c: 12.5, h: 14.0, ls: 700, esp: [35, 125], dims: [250, 1400, 732], kg: 40, src: ME, check: true, note: 'Width 1400 assumed from the shared size table.' },
  'PEAD-M140JAAD': { c: 14.0, h: 16.0, ls: 767, esp: [35, 125], dims: [250, 1600, 732], kg: 44, src: ME, check: true, note: 'Width 1600 assumed from the shared size table.' },
  'PEA-M100GAA': { c: 10.0, h: 11.2, ls: null, esp: [50, 150], dims: [400, 1400, 634], kg: 63, src: MEA, check: true, note: 'Airflow not clearly stated per model.' },
  'PEA-M125GAA': { c: 12.5, h: 14.0, ls: null, esp: [50, 150], dims: [400, 1400, 634], kg: 63, src: MEA, check: true, note: 'Airflow not clearly stated per model.' },
  'PEA-M140GAA': { c: 14.0, h: 16.0, ls: null, esp: [50, 150], dims: [400, 1400, 634], kg: 63, src: MEA, check: true, note: 'Airflow not clearly stated per model.' },

  // ActronAir Aires indoor (nominal airflow; ESP from fan curves only)
  EVA10AS: { c: 10.0, h: 10.5, ls: 500, esp: null, dims: [410, 850, 595], kg: 36, src: AC },
  EVA13AS: { c: 13.0, h: 15.0, ls: 650, esp: null, dims: [412, 1090, 615], kg: 44, src: AC },
  EVA15AS: { c: 15.2, h: 16.7, ls: 770, esp: null, dims: [412, 1290, 615], kg: 53, src: AC },
  EVA17AS: { c: 17.0, h: 19.1, ls: 890, esp: null, dims: [435, 1420, 680], kg: 61, src: AC },
  EVA20AS: { c: 19.8, h: 22.0, ls: 1050, esp: null, dims: [485, 1470, 695], kg: 72, src: AC },
  EVA23AS: { c: 22.6, h: 24.5, ls: 1200, esp: null, dims: [485, 1570, 695], kg: 81, src: AC },
};

// Find the spec for an indoor code, ignoring Daikin/Fujitsu supply suffixes (-C2V, -VC2Y, -2V4Z24 …).
export function unitSpec(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  if (UNIT_SPECS[c]) return { code: c, ...UNIT_SPECS[c] };
  const keys = Object.keys(UNIT_SPECS).sort((a, b) => b.length - a.length);
  const k = keys.find((key) => c.startsWith(key) && /^(-|$)/.test(c.slice(key.length)));
  return k ? { code: k, ...UNIT_SPECS[k] } : null;
}

// Plain-English spec lines for the side panel and PDF.
export function specLines(s) {
  if (!s) return [];
  const out = [`${s.c} kW cooling / ${s.h} kW heating`];
  if (s.ls) out.push(`${s.ls} L/s high fan`);
  if (s.esp) out.push(s.esp[0] == null ? `ESP up to ${s.esp[1]} Pa` : `ESP ${s.esp[0]}–${s.esp[1]} Pa`);
  if (s.dims) out.push(`${s.dims[0]} H × ${s.dims[1]} W × ${s.dims[2]} D mm`);
  if (s.kg) out.push(`${s.kg} kg`);
  return out;
}
