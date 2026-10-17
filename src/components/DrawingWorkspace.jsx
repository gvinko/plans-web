import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ApperIcon from '@/components/ApperIcon';
import HvacSymbol from '@/components/HvacSymbol';
import { ECHO_LOGO } from '@/assets/echoLogo';
import { IndoorUnitPlan, OutdoorUnitPlan, FanSectionPlan, CoilSectionPlan } from '@/components/UnitSymbol';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { sdk } from '@/services/sdk';
import { DUCTED_MODELS } from '@/data/ductedModels';
import { SPLIT_MODELS } from '@/data/splitModels';
import { PAIR_COILS, UNIT_COIL } from '@/data/pipeSizing';
import AutoLayoutDialog from '@/components/AutoLayoutDialog';
import { CLIMATES, DEFAULT_CLIMATE, ROOM_TYPES, ORIENTS, SHADING, CEILINGS, calcRoomLoad } from '@/lib/heatLoad';
import { buildLayout } from '@/lib/autoLayout';
import { createDxf } from '@/lib/dxf';

const COLORBOND = ['Basalt', 'Blue Ocean', 'Classic Cream', 'Cottage Green', 'Cove', 'Deep Ocean', 'Dune', 'Evening Haze', 'Galvanised', 'Gully', 'Headland', 'Ironstone', 'Jasper', 'Mangrove', 'Manor Red', 'Monument', 'Night Sky', 'Pale Eucalypt', 'Paperbark', 'Shale Grey', 'Surfmist', 'Terrain', 'Wallaby', 'Windspray', 'Woodland'];
const isService = (conn) => !!conn && (conn.type === 'pipe' || conn.type === 'drain' || conn.type === 'power');

// ---- Design-check rules of thumb (edit to suit) ----
const LPS_PER_KW = 50; // typical ducted unit airflow per kW cooling
const NECK_VELOCITY = 2.5; // m/s used to rate an outlet / branch by its size
const RA_FACE_VELOCITY = 2.5; // m/s over a return grille's free area
const RA_FREE_AREA = 0.75; // free area fraction of a return grille
const ductLps = (mm) => Math.round((Math.PI * (mm / 1000) ** 2) / 4 * NECK_VELOCITY * 1000);
// Electrical: breaker -> cable, and the allowance added to a drawn run.
const BREAKERS = ['16A 1Ph', '20A 1Ph', '25A 1Ph', '32A 1Ph', '40A 1Ph', '16A 3Ph', '20A 3Ph', '25A 3Ph', '32A 3Ph'];
function cableFor(breaker) {
  const amps = parseInt(breaker, 10) || 20;
  const three = /3Ph/.test(breaker);
  const mm = amps <= 20 ? '2.5' : amps <= 25 ? '4' : amps <= 32 ? '6' : '10';
  return `${mm}mm² ${three ? '4C+E' : '2C+E'} TPS`;
}
const CABLE_ALLOW = 1.2; // +20% for rises, drops and routing
const CABLE_TAILS = 3; // metres for terminations at each end
const approxCable = (m) => Math.ceil(m * CABLE_ALLOW + CABLE_TAILS);
const coilShort = (idx) => (idx == null ? 'Pipe' : PAIR_COILS[idx].split(' - ')[0].replace(/''/g, '"').replace(/ /g, ''));

// pdf.js reads PDFs in a background worker. Hosts don't always serve the worker's
// .mjs file with a JavaScript type, and an open tab can point at a file from an
// older deploy. So fetch the worker ourselves and hand pdf.js a blob URL with the
// right type, falling back to the public CDN copy of the same pdf.js version.
let pdfWorkerReady = null;
function ensurePdfWorker() {
  if (!pdfWorkerReady) {
    pdfWorkerReady = (async () => {
      const sources = [pdfWorkerUrl, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`];
      for (const src of sources) {
        try {
          const res = await fetch(src, { cache: 'no-cache' });
          const text = res.ok ? await res.text() : '';
          if (!text || /^\s*<(!doctype|html)/i.test(text)) continue; // missing file served as the app page
          pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          return;
        } catch { /* try the next source */ }
      }
      pdfWorkerReady = null;
      throw new Error('The PDF reader could not load — refresh the page (Ctrl + Shift + R) and try again');
    })();
  }
  return pdfWorkerReady;
}

// ---- Catalogue: names and sizes mirror the Echo DOMESTIC costing sheet ----

const RA_GRILLES = ['600 x 400', '750 x 400', '750 x 550', '900 x 400', '900 x 500', '900 x 550', 'Half Tile', 'Full Tile'];
const RA_BOXES = [
  '600 x 400 - 1 x 14"', '600 x 400 - 1 x 16"',
  '750 x 400 - 1 x 14"', '750 x 400 - 1 x 16"',
  '750 x 550 - 1 x 14"', '750 x 550 - 1 x 16"', '750 x 550 - 2 x 14"', '750 x 550 - 2 x 16"',
  '900 x 400 - 1 x 14"', '900 x 400 - 1 x 16"', '900 x 400 - 2 x 14"', '900 x 400 - 2 x 16"',
  '900 x 500 - 1 x 14"', '900 x 500 - 1 x 16"', '900 x 500 - 2 x 14"', '900 x 500 - 2 x 16"',
  '900 x 550 - 1 x 14"', '900 x 550 - 2 x 16"',
  'Half Tile Box - 1 x 14"', 'Half Tile Box - 1 x 16"',
  'Full Tile Box - 2 x 14"', 'Full Tile Box - 2 x 16"', 'Full Tile Box - 2 x 18"',
];
// Sizes read inlet / straight-through / branch(es), in inches. Costing-sheet sizes first,
// then every other combination so any fitting can be drawn.
const BTO_SHEET = ['16 / 14 / 14', '16 / 14 / 10', '14 / 14 / 12', '14 / 14 / 10', '14 / 12 / 12', '14 / 12 / 10', '14 / 10 / 10', '12 / 10 / 10', '12 / 10 / 08', '10 / 08 / 08'];
const DBTO_SHEET = ['14 / 10 / 10 / 10', '16 / 10 / 10 / 10'];
const pad2 = (n) => String(n).padStart(2, '0');
const BTO_ALL = [18, 16, 14, 12, 10].flatMap((i) => {
  const out = [];
  for (let a = i; a >= 8; a -= 2) for (let b = a; b >= 6; b -= 2) out.push(`${pad2(i)} / ${pad2(a)} / ${pad2(b)}`);
  return out;
});
const DBTO_ALL = [18, 16, 14, 12].flatMap((i) => {
  const out = [];
  for (let a = i - 2; a >= 8; a -= 2) for (let b = a; b >= 8; b -= 2) for (let c = b; c >= 8; c -= 2) out.push(`${pad2(i)} / ${pad2(a)} / ${pad2(b)} / ${pad2(c)}`);
  return out;
});
const BTO_SIZES = [...BTO_SHEET, ...BTO_ALL.filter((s) => !BTO_SHEET.includes(s))];
const DBTO_SIZES = [...DBTO_SHEET, ...DBTO_ALL.filter((s) => !DBTO_SHEET.includes(s))];
const ZONE_SIZES = ['10" (250mm)', '12" (300mm)', '14" (350mm)', '16" (400mm)'];
const ZONE_NAMES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8'];
const ZONE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];
const zoneColor = (z) => { const i = ZONE_NAMES.indexOf(z); return i >= 0 ? ZONE_COLORS[i] : null; };
const CHOOSE_MODEL = 'Choose a model';

// Outdoor unit body presets (approximate plan footprints; editable per unit)
const OUTDOOR_BODIES = [
  { label: 'Compact single fan (approx. 800 x 300)', w: 800, d: 300, fans: 1 },
  { label: 'Standard single fan (approx. 940 x 340)', w: 940, d: 340, fans: 1 },
  { label: 'Large single fan (approx. 1000 x 380)', w: 1000, d: 380, fans: 1 },
  { label: 'Wide twin fan (approx. 1300 x 400)', w: 1300, d: 400, fans: 2 },
];

// Approximate indoor footprints by series; the user can type the exact spec size.
function indoorPreset(model) {
  const m = model || '';
  if (/bulkhead|SEZ-|FDYBA|K[SL]LAP/i.test(m)) return { w: 900, d: 450, series: 'Bulkhead' };
  if (/slim|FBA|KMTAP|PEAD|low profile/i.test(m)) return { w: 1100, d: 700, series: 'Slimline' };
  if (/underfloor|FDYU/i.test(m)) return { w: 1200, d: 900, series: 'Underfloor' };
  return { w: 1400, d: 750, series: 'Standard ducted' };
}

const mmShort = (v) => { const m = String(v).match(/\((\d+)mm\)/); return m ? `${m[1]}Ø` : v; };
const compact = (v) => String(v).replace(/ /g, '');
const kwShort = (v) => { const m = String(v).match(/(\d+(?:\.\d+)?)\s?kW/i); return m ? `${m[1]}kW` : ''; };

// Pull model codes out of a costing-sheet unit name, e.g.
// 'Daikin FDYAN71A-C2V 7.1kW Standard Single Phase' -> indoor FDYAN71A-C2V
// 'Actron Aires CRS10AS / EVA10AS - 10.0kW (1Ph)'  -> outdoor CRS10AS, indoor EVA10AS
const CODE_RE = /^[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*$/;
function modelCodes(model) {
  if (!model || model === 'Choose a model') return { indoor: '', outdoor: '' };
  const codes = String(model).replace(/\(.*?\)/g, ' ').split(/[\s/]+/).filter((t) => CODE_RE.test(t));
  if (/\s\/\s/.test(model) && codes.length >= 2) return { indoor: codes[1], outdoor: codes[0] };
  return { indoor: codes[0] || '', outdoor: '' };
}
const indoorShort = (v) => [modelCodes(v).indoor, kwShort(v)].filter(Boolean).join(' · ');

// ActronAir two-piece fan coils (install guides 9590-0015-08/-09): coil & fan
// section footprints W x D in mm; pipe = PAIR_COILS index (null = not in the list:
// 3/8 x 7/8 or 1/2 x 1 — pick the coil on the run).
const ACTRON_2PC = [
  { model: 'EAA140S / EFV140S (CRV140S)', coil: [1252, 342], fan: [1072, 362], pipe: 4 },
  { model: 'EAA160S / EFV160S (CRV160S / CRV160T)', coil: [1252, 342], fan: [1072, 362], pipe: 4 },
  { model: 'EAA180S / EFV180S (CRV180S / CRV180T)', coil: [1360, 342], fan: [1072, 362], pipe: null },
  { model: 'EAA210S / EFV210S (CRV210T)', coil: [1410, 342], fan: [1269, 412], pipe: null },
  { model: 'EAA240S / EFV240S (CRV240T)', coil: [1410, 342], fan: [1269, 412], pipe: null },
];
const actronPair = (model) => {
  const p = ACTRON_2PC.find((m) => m.model === model);
  if (!p) return null;
  const [coilCode, rest] = p.model.split(' / ');
  return { ...p, coilCode, fanCode: rest.split(' ')[0], outdoor: (rest.match(/\((.*)\)/) || [])[1] || '' };
};
const SECTION_TYPES = new Set(['fansection', 'coilsection']);
// Picking one of these as the FCU model swaps the FCU for a fan + coil section pair.
const ACTRON_2PC_PREFIX = 'ActronAir 2-Piece ';
const ACTRON_2PC_GROUP = { group: 'ActronAir 2-Piece Fan Coil (fan + coil sections)', models: ACTRON_2PC.map((m) => `${ACTRON_2PC_PREFIX}${m.model}`) };
const actronKw = (p) => (Number((p?.coilCode || '').match(/\d+/)?.[0]) || 0) / 10;
const sectionKw = (item) => actronKw(actronPair(item.spec?.model));
const DUCT_PLATES = ['PLDP-2/400 — 2 x 16" (400mm)', 'PLDS-2/400 — 2 x 16" (400mm)', 'PLDT-2/450 — 2 x 18" (450mm)', 'Duct plate — 2 x 12" (300mm)', 'Duct plate — 2 x 14" (350mm)', 'Duct plate — 3 x 12" (300mm)', 'Duct plate — 3 x 14" (350mm)', 'Duct plate — 4 x 10" (250mm)'];

// R/A filter box outlets: round spigots, or a rectangular neck (slip joint) sized in mm.
const RFB_OUTLETS = ['Rect neck (slip joint)', '1 x 350Ø spigot', '1 x 450Ø spigot', '2 x 350Ø spigots', '2 x 400Ø spigots', '3 x 300Ø spigots', '4 x 250Ø spigots'];
function rfbOutlet(item) {
  const v = item.spec?.outlet || RFB_OUTLETS[0];
  const m = v.match(/^(\d) x (\d+)Ø/);
  return m ? { n: Number(m[1]), dia: Number(m[2]), rect: false, label: v } : { n: 1, dia: null, rect: true, label: `${item.rfbNeck || 'size TBC'} rect neck (slip joint)` };
}

const CATALOG = [
  {
    group: 'Equipment',
    items: [
      { type: 'indoor', label: 'FCU (Indoor Unit)', tag: 'FCU', role: 'unit', specs: [{ key: 'model', label: 'Model', sheet: 'Ducted Unit', groups: [...DUCTED_MODELS, ACTRON_2PC_GROUP], placeholder: CHOOSE_MODEL, short: indoorShort }] },
      { type: 'outdoor', label: 'Condenser (Outdoor Unit)', tag: 'CU', role: 'none', noDuct: 'Condensers connect by refrigerant pipe, not duct.', specs: [{ key: 'body', label: 'Unit size', options: OUTDOOR_BODIES.map((b) => b.label), noTakeoff: true }] },
      { type: 'splitindoor', label: 'Split System', tag: 'SS', role: 'none', noDuct: 'Split systems connect by refrigerant pipe, not duct.', specs: [{ key: 'model', label: 'Model', sheet: 'Split Unit', groups: SPLIT_MODELS, placeholder: CHOOSE_MODEL, short: indoorShort }] },
      { type: 'fansection', label: 'Actron 2-Piece — Fan Section', tag: 'FAN', role: 'section', specs: [{ key: 'model', label: 'System', options: ACTRON_2PC.map((m) => m.model), short: (v) => actronPair(v)?.fanCode || '' }] },
      { type: 'coilsection', label: 'Actron 2-Piece — Coil Section', tag: 'COIL', role: 'section', specs: [{ key: 'model', label: 'System', options: ACTRON_2PC.map((m) => m.model), short: (v) => actronPair(v)?.coilCode || '' }] },
      { type: 'saplenum', label: 'S/A Plenum', tag: 'SAP', role: 'supplyFit', specs: [{ key: 'size', label: 'Size', sheet: 'S/A Plenum', options: ['1 x 14" (350mm)', '2 x 14" (350mm)', '3 x 14" (350mm)', '1 x 16" (400mm)', '2 x 16" (400mm)', '3 x 16" (400mm)', '3 x 12" (300mm)', '2 x 18" (450mm)', '3 x 18" (450mm)'], short: (v) => v.split(' (')[0].replace(/ /g, '') }] },
      { type: 'ductplate', label: 'Duct Plate (spigot plate)', tag: 'PLT', role: 'supplyFit', specs: [{ key: 'size', label: 'Plate', sheet: 'Duct Plate', options: DUCT_PLATES, short: (v) => (v.startsWith('Duct plate') ? v.split(' — ')[1].split(' (')[0].replace(/ /g, '') : v.split(' — ')[0]) }] },
      { type: 'raplenum', label: 'R/A Plenum', tag: 'RAP', role: 'returnFit', specs: [{ key: 'size', label: 'Size', sheet: 'R/A Plenum', options: ['2 x 14"', '2 x 16"', '2 x 18"'], short: compact }] },
    ],
  },
  {
    group: 'Supply outlets',
    items: [
      { type: 'supply', label: 'Ceiling Diffuser', tag: 'SD', role: 'supplyTerm', specs: [{ key: 'neck', label: 'Neck size', options: ['250mm', '200mm', '300mm', '350mm', '150mm'], noTakeoff: true, short: (v) => `${v.replace('mm', '')}Ø` }, { key: 'variant', label: 'Type', options: ['Metal Diffusers + Neck', 'Polytech Round', 'Multi Diffusers + Neck'] }] },
      { type: 'wallgrille', label: 'Wall Grille', tag: 'WG', role: 'supplyTerm', specs: [{ key: 'size', label: 'Size', sheet: 'Wall Grille', options: ['350x150mm'], short: (v) => v.replace('mm', '') }] },
      { type: 'floorgrille', label: 'Floor Grille & Boot', tag: 'FG', role: 'supplyTerm', specs: [{ key: 'size', label: 'Size', sheet: 'Pressed metal floor grille & Boot', options: ['300x150mm'], short: (v) => v.replace('mm', '') }] },
    ],
  },
  {
    group: 'Return air',
    items: [
      {
        type: 'return', label: 'R/A Grille', tag: 'RA', role: 'returnTerm',
        specs: [
          { key: 'size', label: 'Grille', sheet: 'R/A Grille', options: RA_GRILLES, short: compact },
          { key: 'box', label: 'R/A Box', sheet: 'R/A Box', options: ['None', ...RA_BOXES], dependsOn: 'size' },
        ],
      },
      {
        type: 'rafilterbox', label: 'R/A Filter Box', tag: 'RFB', role: 'returnFit',
        specs: [
          { key: 'face', label: 'Filter face', sheet: 'R/A Filter Box', options: ['1190x590mm', '890x590mm', '590x590mm', '1190x890mm', '1190x1190mm'], short: (v) => v.replace('mm', '') },
          { key: 'filter', label: 'Filter', sheet: 'Filter media', options: ['G4 pleated', 'F7 pleated', 'F7 bag', 'Washable panel'] },
          { key: 'outlet', label: 'Outlet', options: RFB_OUTLETS, noTakeoff: true },
        ],
      },
    ],
  },
  {
    group: 'Fittings',
    items: [
      { type: 'bto', label: 'BTO', tag: 'BTO', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'BTO', options: BTO_SIZES, short: compact }] },
      { type: 'dbto', label: 'DBTO', tag: 'DBTO', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'DBTO', options: DBTO_SIZES, short: compact }] },
      { type: 'reducer', label: 'Reducer', tag: 'RED', role: 'fit', sheet: 'Reducers' },
      { type: 'cushion', label: 'Cushion Box', tag: 'CB', role: 'fit', sheet: 'Cushion Box' },
      { type: 'flexconn', label: 'Flexible Canvas Connection', tag: 'FC', role: 'fit', specs: [{ key: 'kind', label: 'Type', sheet: 'Flexible Connection', options: ['Neoprene / canvas 150mm', 'Neoprene / canvas 100mm'] }] },
      { type: 'transition', label: 'Transition (sheet metal)', tag: 'TR', role: 'fit', specs: [{ key: 'kind', label: 'Shape', options: ['Concentric', 'Eccentric (flat one side)'], noTakeoff: true }] },
    ],
  },
  {
    group: 'Zoning & controls',
    items: [
      {
        type: 'zone', label: 'Zone Motor', tag: 'ZM', role: 'fit',
        specs: [
          { key: 'size', label: 'Size', sheet: 'Zone Motor', options: ZONE_SIZES, short: mmShort },
          { key: 'cable', label: 'Zone Cable', sheet: 'Zone Cable', options: ['12m', '20m', 'None'] },
          { key: 'zone', label: 'Zone', options: ['None', ...ZONE_NAMES], noTakeoff: true },
        ],
      },
      {
        type: 'controller', label: 'Zone Pad / Switch Plate', tag: 'ZC', role: 'none', noDuct: 'Controllers are wired, not ducted.',
        specs: [{
          key: 'model', label: 'Type',
          options: ['Multi zone Pad (24v) - 4 Zone', 'Multi zone Pad (24v) - 8 Zone', 'Switch plate (240v) - 1 gang', 'Switch plate (240v) - 2 gang', 'Switch plate (240v) - 3 gang', 'Switch plate (240v) - 4 gang', 'Switch plate (240v) - 5 gang', 'Switch plate (240v) - 6 gang', 'Wall Controller (see Controllers tab)'],
          short: (v) => (v.match(/(\d+ (Zone|gang))/) || [])[1] || 'Wall',
        }],
      },
      { type: 'sensor', label: 'Wall Sensor', tag: 'TS', role: 'none', noDuct: 'Wall sensors are wired, not ducted.', specs: [{ key: 'kind', label: 'Type', sheet: 'Sensor', options: ['Wired wall sensor', 'Wireless wall sensor'] }, { key: 'zone', label: 'Zone', options: [...ZONE_NAMES, 'Common'], noTakeoff: true, short: (v) => v.replace('Zone ', 'Z') }] },
      { type: 'zonearea', label: 'Zone Area (colour a room)', tag: 'ZA', role: 'none', noDuct: 'Zone areas only colour a room.', specs: [{ key: 'zone', label: 'Zone', options: ZONE_NAMES, noTakeoff: true }] },
    ],
  },
  {
    group: 'Drains & electrical',
    items: [
      { type: 'condpump', label: 'Condensate Pump', tag: 'CP', role: 'none', noDuct: 'Pumps connect to condensate drains, not duct.', specs: [{ key: 'model', label: 'Pump', sheet: 'Condensate Pump', options: ['Aqua Blue with 6mm Tube', 'Aspen 1L Res with 10mm Tube', 'Aspen 2L Res with 10mm Tube'] }] },
      { type: 'drainpoint', label: 'Drain Point', tag: 'DP', role: 'none', noDuct: 'Drain points take condensate drains, not duct.', specs: [{ key: 'kind', label: 'Discharges to', options: ['Tundish', 'Stormwater downpipe', 'Garden / gully', 'Sewer (via trap)'], noTakeoff: true, short: (v) => v.split(' ')[0] }] },
      { type: 'isolator', label: 'Isolator', tag: 'ISO', role: 'none', noDuct: 'Isolators are wired, not ducted.', sheet: 'Isolator' },
      { type: 'switchboard', label: 'Switchboard', tag: 'SB', role: 'none', noDuct: 'Run power cable from the switchboard (dark red dots).', specs: [{ key: 'kind', label: 'Board', options: ['Existing switchboard', 'Sub-board'], noTakeoff: true, short: (v) => (v.startsWith('Sub') ? 'Sub' : '') }] },
    ],
  },
  {
    group: 'Commercial ventilation',
    items: [
      {
        type: 'exhfan', label: 'Inline Exhaust Fan', tag: 'EF', role: 'fit',
        specs: [
          { key: 'model', label: 'Fan', sheet: 'Exhaust Fan', options: ['Fantech ECO-200 (or similar)', 'Fantech ECO-150 (or similar)', 'Fantech ECO-250 (or similar)', 'Fantech TD-mixed flow 200', 'Fantech TD-mixed flow 250', 'Fantech TD-mixed flow 315', 'Ceiling-mount exhaust fan (ducted)', 'Fan as per schedule'], short: (v) => (v.match(/(ECO-\d+|TD.*?\d+)/) || [])[1]?.replace('TD-mixed flow ', 'TD') || '' },
          { key: 'duty', label: 'Duty', options: ['50 L/s @ 100Pa', '100 L/s @ 100Pa', '140 L/s @ 100Pa', '200 L/s @ 150Pa', '300 L/s @ 150Pa', '500 L/s @ 200Pa', 'As per schedule'], noTakeoff: true, short: (v) => v.split(' @')[0].replace(' ', '') },
        ],
      },
      { type: 'roofcowl', label: 'Roof Cowl / Roof Fan', tag: 'RC', role: 'anyTerm', specs: [{ key: 'kind', label: 'Type', sheet: 'Roof Discharge', options: ['Roof cowl (gravity)', 'Roof-mounted exhaust fan', 'Wall-mounted exhaust fan'] }, { key: 'size', label: 'Size', options: ['150mm', '200mm', '250mm', '300mm', '400mm'], short: (v) => `${v.replace('mm', '')}Ø` }] },
      { type: 'jetfan', label: 'Car Park Jet Fan', tag: 'JF', role: 'none', noDuct: 'Jet fans are free-standing — no duct.', specs: [{ key: 'model', label: 'Fan', sheet: 'Jet Fan', options: ['Jet fan 315mm', 'Jet fan 355mm', 'Jet fan 400mm', 'As per schedule'] }] },
      { type: 'eggcrate', label: 'Egg Crate Exhaust Grille', tag: 'EG', role: 'exhaustTerm', specs: [{ key: 'size', label: 'Size', sheet: 'Egg Crate Grille', options: ['150x150mm', '200x200mm', '250x250mm', '300x300mm', '450x450mm', '600x600mm'], short: (v) => v.replace('mm', '') }] },
      { type: 'sqdiff', label: '4-Way Square Diffuser', tag: 'SQ', role: 'supplyTerm', specs: [{ key: 'size', label: 'Size', sheet: 'Square Diffuser', options: ['300x300mm', '450x450mm', '600x600mm (full tile)'], short: (v) => v.split('mm')[0] }, { key: 'neck', label: 'Neck', options: ['150mm', '200mm', '250mm', '300mm'], short: (v) => `${v.replace('mm', '')}Ø` }] },
      { type: 'linearslot', label: 'Linear Slot Diffuser', tag: 'LS', role: 'supplyTerm', specs: [{ key: 'size', label: 'Size', sheet: 'Linear Slot Diffuser', options: ['1-slot x 1200mm', '2-slot x 1200mm', '3-slot x 1200mm', '2-slot x 1800mm', '2-slot x 2400mm'], short: (v) => v.replace('-slot x ', 'S/').replace('mm', '') }] },
      { type: 'louvre', label: 'Weatherproof Louvre c/w Mesh', tag: 'WL', role: 'anyTerm', specs: [{ key: 'size', label: 'Size', sheet: 'Weatherproof Louvre', options: ['300x300mm', '450x300mm', '450x450mm', '600x300mm', '600x600mm', '900x600mm'], short: (v) => v.replace('mm', '') }, { key: 'mesh', label: 'Mesh', options: ['Bird mesh', 'Insect mesh', 'Bird + insect mesh'], noTakeoff: true }] },
      { type: 'transfer', label: 'Transfer Grille', tag: 'TG', role: 'none', noDuct: 'Transfer grilles pass air between rooms — no duct.', specs: [{ key: 'size', label: 'Size', sheet: 'Transfer Grille', options: ['300x150mm', '450x150mm', '600x200mm', '600x300mm'], short: (v) => v.replace('mm', '') }] },
      { type: 'doorgrille', label: 'Door Grille / Undercut', tag: 'DG', role: 'none', noDuct: 'Door grilles let make-up air through the door — no duct.', specs: [{ key: 'size', label: 'Size', sheet: 'Door Grille', options: ['450x150mm', '600x200mm', '600x300mm', '20mm door undercut'], short: (v) => (v.includes('undercut') ? 'U/C' : v.replace('mm', '')) }] },
      { type: 'makeup', label: 'Make-up Air (marker)', tag: 'MUA', role: 'none', noDuct: 'The make-up air arrow only marks where air comes in.', specs: [{ key: 'via', label: 'Via', options: ['Door grille', 'Door undercut', 'Window / louvre', 'Transfer grille', 'Open doorway'], noTakeoff: true }] },
      { type: 'spigot', label: 'Duct Spigot (take-off)', tag: 'SP', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'Spigot', options: ['150mm', '200mm', '250mm', '300mm', '350mm', '400mm'], short: (v) => `${v.replace('mm', '')}Ø` }, { key: 'kind', label: 'Type', sheet: 'Spigot type', options: ['Flat spigot c/w VCD', 'Flat spigot', 'Bellmouth spigot', 'Scoop / hi-efficiency spigot'] }] },
      { type: 'accesspanel', label: 'Ceiling Access Panel', tag: 'AP', role: 'none', noDuct: 'Access panels sit in the ceiling — no duct.', specs: [{ key: 'size', label: 'Size', sheet: 'Access Panel', options: ['450x450mm hinged', '600x600mm hinged', '300x300mm hinged', '600x600mm lift-out tile'], short: (v) => v.split('mm')[0] }] },
    ],
  },
  {
    group: 'Dampers & attenuation',
    items: [
      { type: 'vcd', label: 'Volume Control Damper (VCD)', tag: 'VCD', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'VCD', options: ['150mm round', '200mm round', '250mm round', '300mm round', '200x200mm', '300x200mm', '300x300mm', '400x300mm'], short: (v) => v.replace('mm round', 'Ø').replace('mm', '') }] },
      { type: 'firedamper', label: 'Fire Damper', tag: 'FD', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'Fire Damper', options: ['200x200mm', '300x200mm', '300x300mm', '400x300mm', '450x450mm', '600x400mm', '200mm round', '250mm round'], short: (v) => v.replace('mm round', 'Ø').replace('mm', '') }, { key: 'rating', label: 'Rating', options: ['-/120/- (2hr)', '-/90/-', '-/60/-', '-/240/- (4hr)'], noTakeoff: true }] },
      { type: 'motdamper', label: 'Motorised Damper', tag: 'MD', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'Motorised Damper', options: ['200mm round', '250mm round', '300x200mm', '300x300mm', '400x300mm', '600x400mm'], short: (v) => v.replace('mm round', 'Ø').replace('mm', '') }, { key: 'action', label: 'Action', options: ['24V open/close', '24V modulating', '240V open/close'], noTakeoff: true }] },
      { type: 'backdraft', label: 'Backdraft Damper', tag: 'BDD', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'Backdraft Damper', options: ['150mm round', '200mm round', '250mm round', '300x300mm', '450x450mm'], short: (v) => v.replace('mm round', 'Ø').replace('mm', '') }] },
      { type: 'attenuator', label: 'Attenuator', tag: 'ATT', role: 'fit', specs: [{ key: 'size', label: 'Size', sheet: 'Attenuator', options: ['200mm round x 900', '250mm round x 900', '300x300 x 900', '450x300 x 1200', '600x400 x 1200'], short: (v) => v.split(' x ')[0].replace('mm round', 'Ø') }] },
    ],
  },
];
// Parts no longer offered, kept so older drawings still open and list them.
const RETIRED = [
  { type: 'transformer', label: 'Zone Transformer', tag: 'TX', role: 'none', noDuct: 'The zone transformer is wired, not ducted.', sheet: 'Zone Transformer' },
];
const PALETTE = [...CATALOG.flatMap((g) => g.items), ...RETIRED];

// Sheet metal duct: rectangular W x H or round, sized by hand.
const isSheet = (conn) => conn?.material === 'sheet';
const isRect = (conn) => isSheet(conn) && conn.shape !== 'round';
const eqDia = (w, h) => Math.round((1.3 * (w * h) ** 0.625) / (w + h) ** 0.25);
function ductRatingMm(conn) {
  if (!conn) return null;
  if (isRect(conn)) return eqDia(Number(conn.w) || 300, Number(conn.h) || 150);
  return conn.size || null;
}
function sheetLabel(conn) {
  return isRect(conn) ? `${Number(conn.w) || 300} x ${Number(conn.h) || 150} mm` : `${conn.size || 250}mm round`;
}

// Default plan footprints in mm (W x D, unrotated)
const TYPE_MM = {
  indoor: [1400, 750], outdoor: [940, 340], saplenum: [700, 350], raplenum: [700, 350],
  supply: [400, 400], wallgrille: [350, 150], floorgrille: [300, 150], return: [600, 400],
  bto: [400, 400], dbto: [450, 450], reducer: [350, 250], cushion: [500, 500],
  zone: [350, 300], controller: [120, 120], transformer: [150, 100], sensor: [90, 90], zonearea: [4000, 3000], condpump: [250, 150], drainpoint: [160, 160], isolator: [120, 120], switchboard: [600, 200],
  exhfan: [450, 300], roofcowl: [400, 400], jetfan: [1200, 450], eggcrate: [300, 300], sqdiff: [600, 600], linearslot: [1200, 150],
  louvre: [450, 450], transfer: [450, 150], doorgrille: [450, 150], makeup: [400, 600], accesspanel: [450, 450],
  spigot: [300, 120], flexconn: [150, 400], rafilterbox: [1190, 590], vcd: [300, 250], firedamper: [350, 300], motdamper: [400, 300], backdraft: [300, 250], attenuator: [900, 350],
};
const STRETCH = new Set(['flexconn', 'rafilterbox', 'return', 'wallgrille', 'floorgrille', 'saplenum', 'raplenum', 'ductplate', 'reducer', 'splitindoor', 'eggcrate', 'sqdiff', 'linearslot', 'louvre', 'transfer', 'doorgrille', 'accesspanel', 'exhfan', 'jetfan', 'vcd', 'firedamper', 'motdamper', 'backdraft', 'attenuator']);
// Commercial parts whose plan footprint follows the W x H picked in their Size spec.
// Grilles and louvres set in a wall: on plan they are a thin strip along the wall face.
const WALL_TYPES = new Set(['wallgrille', 'louvre', 'transfer', 'doorgrille']);
const WALL_DEPTH = { wallgrille: 60, louvre: 100, transfer: 50, doorgrille: 40 };
const SIZE_FROM_SPEC = new Set(['eggcrate', 'sqdiff', 'louvre', 'transfer', 'doorgrille', 'accesspanel', 'vcd', 'firedamper', 'motdamper', 'backdraft', 'attenuator']);

// ---- Plan background helpers ----
const PLAN_MAX_EDGE = 2000;

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.82);
  });
}

function drawScaled(source, w, h) {
  const scale = Math.min(1, PLAN_MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image format can’t be read — try a JPG or PNG')); };
    img.src = url;
  });
}

async function imageFileToJpeg(file) {
  const img = await loadImageElement(file);
  return canvasToJpeg(drawScaled(img, img.naturalWidth, img.naturalHeight));
}

async function pdfFileToJpeg(file) {
  await ensurePdfWorker();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pdfPage = await pdf.getPage(1);
  const base = pdfPage.getViewport({ scale: 1 });
  const scale = Math.min(3, PLAN_MAX_EDGE / Math.max(base.width, base.height));
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  return { blob: await canvasToJpeg(canvas), pages: pdf.numPages };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

// ---- Drawing space ----
const WORLD_W = 1400;
const WORLD_H = 1000;
const DEFAULT_PPM = 40; // world units per metre until a scale is set
const MIN_PX = 22; // smallest on-plan size so tiny parts stay tappable (before the plan scale is set)
// Once the scale is set parts draw at their real size; this floor only keeps them visible.
const PLAN_MIN = { px: MIN_PX };
const SNAP = 2;
const JOIN_SCREEN_PX = 18; // how close two ports must be (on screen) to snap-join
const MIN_Z = 0.1;
const MAX_Z = 6;

const DIR_ORDER = ['n', 'e', 's', 'w'];
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const SIDE_PORTS = [
  { id: 'n', fx: 0.5, fy: 0, dir: 'n' },
  { id: 'e', fx: 1, fy: 0.5, dir: 'e' },
  { id: 's', fx: 0.5, fy: 1, dir: 's' },
  { id: 'w', fx: 0, fy: 0.5, dir: 'w' },
];

function spigotCount(text, fallback = 1) {
  const m = String(text || '').match(/(\d)\s*x\s*\d+"/);
  return m ? Number(m[1]) : fallback;
}

function spread(n, fy, dir, air, prefix) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, fx: (i + 0.5) / n, fy, dir, air }));
}

// Connection points in the part's own (unrotated) frame: fx/fy are fractions of
// its width/depth, dir is the way a duct leaves. They rotate with the part.
function portDefs(item) {
  switch (item.type) {
    case 'indoor':
      return [
        { id: 'ra', fx: 0.5, fy: 0, dir: 'n', air: 'return' },
        { id: 'sa', fx: 0.5, fy: 1, dir: 's', air: 'supply' },
        { id: 'ref', fx: 0, fy: 0.38, dir: 'w', service: 'pipe' },
        { id: 'drain', fx: 1, fy: 0.8, dir: 'e', service: 'drain' },
      ];
    case 'saplenum':
    case 'ductplate':
      return [{ id: 'in', fx: 0.5, fy: 0, dir: 'n', joinOnly: true }, ...spread(spigotCount(item.spec?.size, 2), 1, 's', 'supply', 'sa')];
    case 'fansection':
      return [
        { id: 'ra', fx: 0.5, fy: 0, dir: 'n', air: 'return' },
        { id: 'out', fx: 0.5, fy: 1, dir: 's', air: 'supply' },
      ];
    case 'coilsection':
      return [
        { id: 'in', fx: 0.5, fy: 0, dir: 'n', air: 'supply' },
        { id: 'sa', fx: 0.5, fy: 1, dir: 's', air: 'supply' },
        { id: 'ref', fx: 0, fy: 0.38, dir: 'w', service: 'pipe' },
        { id: 'drain', fx: 1, fy: 0.7, dir: 'e', service: 'drain' },
      ];
    case 'rafilterbox': {
      const o = rfbOutlet(item);
      return o.rect ? [{ id: 'out', fx: 0.5, fy: 1, dir: 's', air: 'return' }] : spread(o.n, 1, 's', 'return', 'ra');
    }
    case 'raplenum':
      return [...spread(spigotCount(item.spec?.size, 2), 0, 'n', 'return', 'ra'), { id: 'out', fx: 0.5, fy: 1, dir: 's', joinOnly: true }];
    case 'return': {
      const box = item.spec?.box;
      return spread(box && box !== 'None' ? spigotCount(box, 1) : 1, 0, 'n', 'return', 'ra');
    }
    case 'wallgrille':
    case 'floorgrille':
      return [{ id: 'boot', fx: 0.5, fy: 0, dir: 'n', air: 'supply' }];
    case 'bto':
      return [{ id: 'w', fx: 0, fy: 0.5, dir: 'w' }, { id: 'e', fx: 1, fy: 0.5, dir: 'e' }, { id: 's', fx: 0.5, fy: 1, dir: 's' }];
    case 'zone':
    case 'reducer':
    case 'flexconn':
    case 'transition':
    case 'exhfan':
    case 'vcd':
    case 'firedamper':
    case 'motdamper':
    case 'backdraft':
    case 'attenuator':
      return [{ id: 'w', fx: 0, fy: 0.5, dir: 'w' }, { id: 'e', fx: 1, fy: 0.5, dir: 'e' }];
    case 'eggcrate':
      return [{ id: 'neck', fx: 0.5, fy: 0, dir: 'n', air: 'exhaust' }];
    case 'spigot':
      return [{ id: 'out', fx: 0.5, fy: 1, dir: 's' }];
    case 'sqdiff':
    case 'linearslot':
      return [{ id: 'neck', fx: 0.5, fy: 0, dir: 'n', air: 'supply' }];
    case 'louvre':
    case 'roofcowl':
      return [{ id: 'neck', fx: 0.5, fy: 0, dir: 'n' }];
    case 'outdoor':
      return [{ id: 'ref', fx: 1, fy: 0.45, dir: 'e', service: 'pipe' }, { id: 'pwr', fx: 1, fy: 0.8, dir: 'e', service: 'power' }];
    case 'isolator':
      return [{ id: 'in', fx: 0, fy: 0.5, dir: 'w', service: 'power' }, { id: 'out', fx: 1, fy: 0.5, dir: 'e', service: 'power' }];
    case 'switchboard':
      return [{ id: 'n', fx: 0.5, fy: 0, dir: 'n', service: 'power' }, { id: 'e', fx: 1, fy: 0.5, dir: 'e', service: 'power' }, { id: 's', fx: 0.5, fy: 1, dir: 's', service: 'power' }, { id: 'w', fx: 0, fy: 0.5, dir: 'w', service: 'power' }];
    case 'splitindoor':
      return [{ id: 'ref', fx: 0, fy: 0.4, dir: 'w', service: 'pipe' }, { id: 'drain', fx: 0, fy: 0.85, dir: 'w', service: 'drain' }];
    case 'condpump':
      return [{ id: 'in', fx: 0, fy: 0.5, dir: 'w', service: 'drain' }, { id: 'out', fx: 1, fy: 0.5, dir: 'e', service: 'drain' }];
    case 'drainpoint':
      return SIDE_PORTS.map((p) => ({ ...p, service: 'drain' }));
    case 'controller':
    case 'transformer':
    case 'sensor':
    case 'zonearea':
    case 'jetfan':
    case 'transfer':
    case 'doorgrille':
    case 'makeup':
    case 'accesspanel':
      return [];
    default:
      return SIDE_PORTS;
  }
}

const DUCT_TYPES = [
  { type: 'supply', label: 'Supply Duct', color: '#16a34a', edge: '#166534', width: 7, defaultSize: 250 },
  { type: 'return', label: 'Return Duct', color: '#dc2626', edge: '#991b1b', width: 9, defaultSize: 450 },
  { type: 'flex', label: 'Flex Duct', color: '#a3a3a3', edge: '#6b7280', width: 6, defaultSize: 250 },
  { type: 'exhaust', label: 'Exhaust Duct', color: '#9333ea', edge: '#6b21a8', width: 7, defaultSize: 200 },
  { type: 'oa', label: 'Outside Air Duct', color: '#0891b2', edge: '#155e75', width: 7, defaultSize: 200 },
];
const DUCT_PREFIX = { return: 'RA ', exhaust: 'EA ', oa: 'OA ' };
const SM_FILL = { supply: '#dcfce7', return: '#fee2e2', exhaust: '#f3e8ff', oa: '#cffafe' };
const SIZES = [
  { mm: 200, label: '8" (200mm)' },
  { mm: 250, label: '10" (250mm)' },
  { mm: 300, label: '12" (300mm)' },
  { mm: 350, label: '14" (350mm)' },
  { mm: 400, label: '16" (400mm)' },
  { mm: 450, label: '18" (450mm)' },
];
const FLEX_LENGTH_M = 6;

// Each duct size gets its own colour so runs are easy to tell apart on the plan.
const SIZE_COLORS = { 150: '#14b8a6', 200: '#0ea5e9', 250: '#22c55e', 300: '#eab308', 350: '#f97316', 400: '#a855f7', 450: '#ec4899', 500: '#64748b', 600: '#78716c' };
const sizeColor = (mm) => SIZE_COLORS[mm] || '#94a3b8';
const CASING = { supply: '#1e293b', return: '#991b1b', flex: '#475569', exhaust: '#6b21a8', oa: '#155e75' };

// Printed on the PDF title block and pick slip.
const COMPANY = {
  name: 'Echo Air Conditioning Pty. Ltd.',
  line: '4/63 Smeaton Grange Road, Smeaton Grange NSW 2567 · (02) 9792 1200',
};

const SHORTCUTS = [
  ['D', 'Draw sheet metal / spiral / duct board run (snaps to 45° / 90°, joins and branches)'],
  ['X', 'Transition on the open end of the selected run'],
  ['E', 'End cap on the selected run (toggle)'],
  ['C', 'Canvas connections on the selected fan (toggle)'],
  ['G', 'New ducts: flex ↔ sheet metal'],
  ['V', 'Select / move (same as Esc)'],
  ['K', 'Set the scale'],
  ['O', 'Open a plan (PDF or image)'],
  ['H', 'Hide / show side panels (bigger drawing)'],
  ['Ctrl + P', 'Export PDF'],
  ['Ctrl + Shift + E', 'Export DXF (for CAD)'],
  ['Double-click a run', 'Add a bend point · double-click a point to remove it'],
  ['Ctrl + drag a run', 'Disconnect it from what it is joined to'],
  ['Ctrl + S', 'Save drawing'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y', 'Redo (or Ctrl + Shift + Z)'],
  ['Ctrl + C / V', 'Copy / paste the selected part'],
  ['Ctrl + D', 'Duplicate the selected part'],
  ['Arrow keys', 'Nudge the selected part (hold Shift for bigger steps)'],
  ['R', 'Rotate the selected part 90°'],
  ['Delete', 'Delete the selected part or duct'],
  ['1 / 2 / 3', 'Draw supply / return / flex duct'],
  ['4 / 5', 'Draw exhaust / outside air duct'],
  ['L', 'Show or hide labels'],
  ['+ / -', 'Zoom in / out'],
  ['0', 'Fit the whole plan'],
  ['F', 'Zoom to the selected part'],
  ['Esc', 'Cancel what you’re doing'],
  ['W / B / T', 'Sketch a wall / room box / text label'],
  ['A', 'Callout — text box with an arrow'],
  ['M / N', 'Tape measure / drop a site note pin'],
  ['P', 'Pen mode on / off'],
  ['?', 'Show this list'],
];
// Part colours on the plan: supply green, return red, fittings blue, equipment black.
const ROLE_TONE = { supplyTerm: 'text-green-700', supplyFit: 'text-green-700', returnTerm: 'text-red-700', returnFit: 'text-red-700', fit: 'text-blue-700', unit: 'text-slate-900', none: 'text-slate-900', exhaustTerm: 'text-purple-700', anyTerm: 'text-cyan-700' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap = (v) => Math.round(v / SNAP) * SNAP;
const fmtM = (m) => (m < 10 ? m.toFixed(1) : String(Math.round(m)));
const portKey = (itemId, portId) => `${itemId}:${portId}`;

function getDuct(type) {
  return DUCT_TYPES.find((entry) => entry.type === type) || DUCT_TYPES[0];
}

function getTool(type) {
  return PALETTE.find((entry) => entry.type === type) || PALETTE[0];
}

function sizeLabel(mm) {
  return SIZES.find((s) => s.mm === mm)?.label || `${mm}mm`;
}

function fieldDefault(field) {
  if (field.dependsOn) return 'None';
  if (field.groups) return field.placeholder;
  return field.options[0];
}

function getSpec(item, field) {
  return item.spec?.[field.key] ?? fieldDefault(field);
}

function specOptions(tool, field, item) {
  if (field.dependsOn !== 'size' || tool.type !== 'return') return field.options;
  const grille = getSpec(item, tool.specs.find((f) => f.key === 'size'));
  return field.options.filter((o) => o === 'None' || o.startsWith(`${grille} -`) || o.startsWith(`${grille} Box`));
}

function defaultSpec(tool) {
  const spec = {};
  (tool.specs || []).forEach((f) => { spec[f.key] = fieldDefault(f); });
  return spec;
}

// Fans take a typed-in model number and supplier, shown on the plan and in the BOM.
const FAN_TYPES = new Set(['exhfan', 'roofcowl', 'jetfan']);
const FAN_SUPPLIERS = ['Fantech', 'Systemaire', 'Air Design', 'Fanmaster', 'Ventair', 'Westaflex', 'Holyoake'];
// Transition sizes are typed in: "600x300", or "300" / "300Ø" for round.
function parseDuctSize(text, fallback) {
  const t = String(text || '').trim();
  const rect = t.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (rect) return { w: Number(rect[1]), h: Number(rect[2]), round: false, label: `${rect[1]}x${rect[2]}` };
  const dia = t.match(/(\d+)/);
  if (dia) return { w: Number(dia[1]), h: Number(dia[1]), round: true, label: `${dia[1]}Ø` };
  return fallback;
}
function transDims(item) {
  const a = parseDuctSize(item.tIn, { w: 600, h: 300, round: false, label: '600x300' });
  const b = parseDuctSize(item.tOut, { w: 400, h: 300, round: false, label: '400x300' });
  return { a, b, inW: a.w, outW: b.w, len: Math.max(100, Number(item.tLen) || 300), ecc: String(item.spec?.kind || '').startsWith('Ecc') };
}

function fanLine(item, tool) {
  if (item.ductSize && item.onRun && item.type !== 'exhfan' && item.type !== 'spigot') {
    return `${tool.specs?.[0]?.sheet || tool.label} — ${item.ductSize} mm (to suit duct)`;
  }
  if (item.type === 'transition') {
    const t = transDims(item);
    return `Transition — ${t.a.label} → ${t.b.label} x ${t.len}mm long${t.ecc ? ' (eccentric)' : ''}`;
  }
  if (!FAN_TYPES.has(item.type) || !(item.fanModel || '').trim()) return null;
  const sup = (item.fanSupplier || '').trim();
  return `${tool.specs?.[0]?.sheet || tool.label} — ${item.fanModel.trim()}${sup ? ` (${sup})` : ''}`;
}

function shortSpec(item) {
  if (item.type === 'outdoor') return item.outdoorModel || (item.suits ? `to suit ${item.suits}` : '');
  if (FAN_TYPES.has(item.type) && (item.fanModel || '').trim()) return item.fanModel.trim();
  if (item.type === 'transition') { const t = transDims(item); return `${t.a.label}→${t.b.label}`; }
  if (item.ductSize && item.onRun) return item.ductSize;
  const tool = getTool(item.type);
  const field = (tool.specs || []).find((f) => f.short);
  if (!field) return '';
  const v = getSpec(item, field);
  return v === CHOOSE_MODEL ? '' : field.short(v);
}

function outdoorBody(item) {
  const label = item.spec?.body;
  return OUTDOOR_BODIES.find((b) => b.label === label) || OUTDOOR_BODIES[1];
}

// Plan footprint in mm, unrotated [W, D]
function footprintMm(item) {
  if (item.dims?.w && item.dims?.d) return [item.dims.w, item.dims.d];
  if (item.type === 'indoor') { const p = indoorPreset(item.spec?.model); return [p.w, p.d]; }
  if (item.type === 'splitindoor') {
    // Approximate head sizes by capacity; floor consoles are narrower and deeper.
    const model = item.spec?.model || '';
    const kw = parseFloat(kwShort(model)) || 0;
    if (/floor|MFZ|FVXM/i.test(model)) return [750, 250];
    if (kw <= 3.5) return [800, 260];
    if (kw <= 6) return [900, 280];
    return [1100, 300];
  }
  if (item.type === 'outdoor') { const b = outdoorBody(item); return [b.w, b.d]; }
  if (SECTION_TYPES.has(item.type)) {
    const p = actronPair(item.spec?.model) || ACTRON_2PC[0];
    return item.type === 'fansection' ? p.fan : p.coil;
  }
  if (item.type === 'ductplate') {
    const n = spigotCount(item.spec?.size, 2);
    const dia = inchesInText(item.spec?.size) || 400;
    return [Math.max(600, n * (dia + 100) + 80), 160];
  }
  if (item.type === 'saplenum' || item.type === 'raplenum') {
    // Width follows the spigots so each connector has room for its duct.
    const n = spigotCount(item.spec?.size, 2);
    const dia = inchesInText(item.spec?.size) || 350;
    return [Math.max(700, n * (dia + 160) + 100), 380];
  }
  if (item.type === 'return') {
    const size = item.spec?.size || RA_GRILLES[0];
    if (size === 'Half Tile') return [600, 600];
    if (size === 'Full Tile') return [1200, 600];
    const m = size.match(/(\d+)\s*x\s*(\d+)/);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  if (item.type === 'rafilterbox') {
    const m = String(item.spec?.face || '1190x590').match(/(\d+)\s*x\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : [1190, 590];
  }
  if (item.type === 'spigot') {
    const dia = Number(String(item.spec?.size || '250').match(/\d+/)?.[0]) || 250;
    return [dia + 50, 120];
  }
  if (WALL_TYPES.has(item.type)) {
    const m = String(item.spec?.size || '').match(/(\d+)\s*x\s*(\d+)/);
    return [m ? Number(m[1]) : (TYPE_MM[item.type] || [450])[0], WALL_DEPTH[item.type]];
  }
  if (item.type === 'transition') {
    const t = transDims(item);
    return [t.len, Math.max(t.inW, t.outW)];
  }
  if (item.type === 'linearslot') {
    const len = Number(String(item.spec?.size || '').match(/x (\d+)mm/)?.[1]) || 1200;
    const slots = Number(String(item.spec?.size || '').match(/^(\d)/)?.[1]) || 2;
    return [len, 60 + slots * 40];
  }
  if (SIZE_FROM_SPEC.has(item.type)) {
    const size = String(item.spec?.size || '');
    const rect = size.match(/(\d+)\s*x\s*(\d+)/);
    const round = size.match(/(\d+)mm round/);
    const [, d] = TYPE_MM[item.type] || [400, 400];
    if (item.type === 'attenuator') {
      const len = Number(size.match(/x (\d+)$/)?.[1]) || 900;
      return [len, rect ? Number(rect[2]) + 100 : (round ? Number(round[1]) + 100 : d)];
    }
    if (rect) return [Number(rect[1]), Number(rect[2])];
    if (round) return [Number(round[1]) + 100, Number(round[1]) + 50];
  }
  return TYPE_MM[item.type] || [400, 400];
}

// On-plan box: unrotated (uw, uh) and rotated (w, h) sizes in world units.
function itemBox(item, ppm) {
  const [wmm, dmm] = footprintMm(item);
  const uw = Math.max(PLAN_MIN.px, (wmm / 1000) * ppm);
  const uh = Math.max(PLAN_MIN.px, (dmm / 1000) * ppm);
  const turned = ((item.rot || 0) / 90) % 2 === 1;
  return { uw, uh, w: turned ? uh : uw, h: turned ? uw : uh };
}

// World position, outgoing direction and air side of one connection point.
function portInfo(item, portId, ppm) {
  const defs = portDefs(item);
  const def = defs.find((d) => d.id === portId) || defs.find((d) => d.dir === portId) || defs[0] || { id: portId, fx: 0.5, fy: 0.5, dir: 'n' };
  const b = itemBox(item, ppm);
  const lx = (def.fx - 0.5) * b.uw;
  const ly = (def.fy - 0.5) * b.uh;
  const r = (((item.rot || 0) % 360) + 360) % 360;
  const [x, y] = r === 90 ? [-ly, lx] : r === 180 ? [-lx, -ly] : r === 270 ? [ly, -lx] : [lx, ly];
  const dir = DIR_ORDER[(DIR_ORDER.indexOf(def.dir) + r / 90) % 4];
  return { x: item.cx + x, y: item.cy + y, dir, air: def.air || null, service: def.service || null, joinOnly: !!def.joinOnly, id: def.id };
}

function portPosition(item, portId, ppm) {
  const p = portInfo(item, portId, ppm);
  return { x: p.x, y: p.y };
}

// Spigot size (mm) at a connection point, taken from the part's selected size.
const INCH_MM = { 6: 150, 8: 200, 10: 250, 12: 300, 14: 350, 16: 400, 18: 450 };

function inchesInText(text) {
  const m = String(text || '').match(/x\s*(\d+)"/);
  return m ? INCH_MM[Number(m[1])] || null : null;
}

function portSizeMm(item, portId) {
  const spec = item.spec || {};
  switch (item.type) {
    case 'saplenum':
    case 'raplenum':
      return inchesInText(spec.size);
    case 'ductplate':
      return portId === 'in' ? null : inchesInText(spec.size);
    case 'fansection':
    case 'coilsection':
      return portId === 'out' || portId === 'in' ? 450 : null;
    case 'return':
      return spec.box && spec.box !== 'None' ? inchesInText(spec.box) : null;
    case 'bto':
    case 'dbto': {
      const parts = String(spec.size || (item.type === 'bto' ? BTO_SIZES[0] : DBTO_SIZES[0])).split('/').map((s) => INCH_MM[Number(s.trim())] || null);
      const order = item.type === 'bto' ? { w: 0, e: 1, s: 2 } : { w: 0, e: 1, s: 2, n: 3 };
      const i = order[portId];
      return i == null ? null : parts[i] ?? null;
    }
    case 'supply': {
      const m = String(spec.neck || '250mm').match(/(\d+)/);
      return m ? Number(m[1]) : null;
    }
    case 'spigot':
      return Number(String(spec.size || '250').match(/\d+/)?.[0]) || null;
    case 'rafilterbox':
      return rfbOutlet(item).dia;
    case 'transition': {
      const t = transDims(item);
      const end = portId === 'w' ? t.a : portId === 'e' ? t.b : null;
      return end?.round ? end.w : null;
    }
    case 'zone': {
      const m = String(spec.size || ZONE_SIZES[0]).match(/\((\d+)mm\)/);
      return m ? Number(m[1]) : null;
    }
    default:
      return null;
  }
}

function labelOffset(item, box) {
  return item.label || (item.type === 'zonearea' ? { dx: 0, dy: 0 } : { dx: 0, dy: box.h / 2 + 7 });
}

function sideOf(role) {
  if (role === 'supplyTerm' || role === 'supplyFit') return 'supply';
  if (role === 'returnTerm' || role === 'returnFit') return 'return';
  if (role === 'exhaustTerm') return 'exhaust';
  return null;
}
const AIR_NAME = { supply: 'supply', return: 'return', exhaust: 'exhaust', oa: 'outside air' };

function resolveDuct(type, a, b, pa = null, pb = null, isJoin = false) {
  if (!isJoin && (pa?.joinOnly || pb?.joinOnly)) return { error: 'That face bolts straight onto the unit — run ducts from the spigots.' };
  const ta = getTool(a.type);
  const tb = getTool(b.type);
  for (const t of [ta, tb]) if (t.role === 'none') return { error: t.noDuct };
  const isTerm = (r) => r === 'supplyTerm' || r === 'returnTerm' || r === 'exhaustTerm' || r === 'anyTerm';
  if (isTerm(ta.role) && isTerm(tb.role)) return { error: 'Outlets and grilles can’t be joined to each other — run from the FCU or a fitting.' };
  if (ta.role === 'unit' && tb.role === 'unit') return { error: 'Two indoor units can’t be joined.' };
  const sides = [sideOf(ta.role), sideOf(tb.role)].filter(Boolean);
  if (sides.includes('supply') && sides.includes('return')) return { error: 'That would join the supply side to the return side.' };
  const airs = [pa?.air, pb?.air].filter(Boolean);
  const all = [...sides, ...airs];
  if (all.includes('supply') && all.includes('return')) return { error: 'Those two connections are on opposite sides — one is supply air, the other return air.' };
  const kinds = [...new Set(all)];
  if (kinds.length > 1) return { error: `Those two connections are on different systems — ${kinds.map((k) => AIR_NAME[k] || k).join(' and ')} air.` };
  const need = all[0];
  if (need && type !== 'flex' && type !== need) {
    return { type: need, note: `Switched to ${AIR_NAME[need] || need} duct — that end is on the ${AIR_NAME[need] || need} side.` };
  }
  return { type };
}

function routePoints(a, pa, b, pb) {
  const STUB = 14;
  const [ax, ay] = DIRS[pa] || [0, 0];
  const [bx, by] = DIRS[pb] || [0, 0];
  const as = { x: a.x + ax * STUB, y: a.y + ay * STUB };
  const bs = { x: b.x + bx * STUB, y: b.y + by * STUB };
  let mids;
  if (pa === 'e' || pa === 'w') {
    const mx = (as.x + bs.x) / 2;
    mids = [{ x: mx, y: as.y }, { x: mx, y: bs.y }];
  } else {
    const my = (as.y + bs.y) / 2;
    mids = [{ x: as.x, y: my }, { x: bs.x, y: my }];
  }
  const pts = [a, as, ...mids, bs, b];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.5);
}

// Rebuild a user-routed run so every section stays square (horizontal or
// vertical) and meets both ports, even after the parts have been moved.
function orthoRoute(a, bends, b) {
  const pts = [a, ...bends.map((p) => ({ x: p.x, y: p.y })), b];
  const horiz = [];
  for (let i = 1; i < pts.length; i += 1) horiz.push(Math.abs(pts[i].y - pts[i - 1].y) <= Math.abs(pts[i].x - pts[i - 1].x));
  for (let i = 1; i < pts.length - 1; i += 1) {
    if (horiz[i - 1]) pts[i].y = pts[i - 1].y;
    else pts[i].x = pts[i - 1].x;
  }
  const n = pts.length;
  if (n > 2 && horiz[n - 3] !== horiz[n - 2]) {
    const last = pts[n - 2];
    if (horiz[n - 2]) last.y = b.y;
    else last.x = b.x;
  }
  return pts;
}

// Drop zero-length and in-line points so doubled-back sections don't count twice
// (pulling a run back shortens its length).
function simplifyRoute(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i];
    const last = out[out.length - 1];
    if (i < pts.length - 1 && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      const inLine = (Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5) || (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5);
      if (inLine) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

function longestSeg(pts) {
  let seg = { len: -1, x: pts[0].x, y: pts[0].y, ang: 0 };
  for (let i = 1; i < pts.length; i += 1) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len > seg.len) seg = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2, ang: (Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x) * 180) / Math.PI };
  }
  if (seg.ang > 90 || seg.ang < -90) seg.ang += 180;
  return seg;
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

// ---- Plan symbols drawn from real millimetre sizes ----
const NS = { vectorEffect: 'non-scaling-stroke' };

// A grille or louvre set in a wall, seen from above: a thin frame along the wall
// face with angled blades, and (for supply grilles) the throw arrow out the front.
function WallGrillePlan({ kind, w, d, className }) {
  const blades = [];
  const step = Math.max(25, w / 14);
  for (let x = step / 2; x < w; x += step) {
    if (kind === 'doorgrille') blades.push(<path key={x} d={`M${x - step * 0.35},0 L${x},${d} L${x + step * 0.35},0`} style={NS} />);
    else if (kind === 'transfer') blades.push(<path key={x} d={`M${x - step * 0.3},0 L${x + step * 0.3},${d / 2} L${x - step * 0.3},${d}`} style={NS} />);
    else blades.push(<line key={x} x1={x - d * 0.45} y1={0} x2={x + d * 0.45} y2={d} style={NS} />);
  }
  const head = Math.min(w * 0.08, 60);
  return (
    <svg viewBox={`0 0 ${w} ${d}`} width="100%" height="100%" preserveAspectRatio="none" overflow="visible" className={className}>
      <rect x={-6} y={-6} width={w + 12} height={d + 12} fill="none" stroke="#ffffff" strokeWidth={5} strokeOpacity={0.9} style={NS} />
      <rect x={0} y={0} width={w} height={d} fill="#ffffff" stroke="currentColor" strokeWidth={2} style={NS} />
      <g stroke="currentColor" strokeWidth={1} fill="none">{blades}</g>
      {kind === 'louvre' && <line x1={0} y1={d * 0.15} x2={w} y2={d * 0.15} stroke="currentColor" strokeWidth={1} strokeDasharray="3 2" style={NS} />}
      {kind === 'wallgrille' && (
        <path d={`M${w / 2},${d} L${w / 2},${d + head * 2.2} M${w / 2 - head * 0.6},${d + head * 1.6} L${w / 2},${d + head * 2.2} L${w / 2 + head * 0.6},${d + head * 1.6}`} fill="none" stroke="currentColor" strokeWidth={1.8} style={NS} />
      )}
    </svg>
  );
}

// Sheet metal transition (reducer) from its real inlet/outlet widths and length.
function TransitionPlan({ t, className }) {
  const L = t.len;
  const D = Math.max(t.inW, t.outW);
  const a0 = t.ecc ? 0 : (D - t.inW) / 2;
  const b0 = t.ecc ? 0 : (D - t.outW) / 2;
  const pts = `0,${a0} ${L},${b0} ${L},${b0 + t.outW} 0,${a0 + t.inW}`;
  return (
    <svg viewBox={`0 0 ${L} ${D}`} width="100%" height="100%" preserveAspectRatio="none" overflow="visible" className={className}>
      <polygon points={pts} fill="#eff6ff" stroke="currentColor" strokeWidth={2} strokeLinejoin="miter" style={NS} />
      <line x1={0} y1={a0 + t.inW / 2} x2={L} y2={b0 + t.outW / 2} stroke="currentColor" strokeWidth={0.8} strokeDasharray="4 3" style={NS} />
      {t.b.round && <line x1={L * 0.85} y1={b0} x2={L * 0.85} y2={b0 + t.outW} stroke="currentColor" strokeWidth={0.8} style={NS} />}
      {t.a.round && <line x1={L * 0.15} y1={a0} x2={L * 0.15} y2={a0 + t.inW} stroke="currentColor" strokeWidth={0.8} style={NS} />}
    </svg>
  );
}

// ---- Print sheet sizes (landscape), in mm ----
const PX_PER_MM = 96 / 25.4;
const PAPER = {
  A4: { w: 297, h: 210, plan: { w: 200, h: 150 } },
  A3: { w: 420, h: 297, plan: { w: 323, h: 236 } },
};
const PRINT_SCALES = [20, 25, 50, 100, 200];

// ---- Sheet metal network: snapping, joins and automatic fittings ----
// A run (sketch kind 'smduct') keeps its own points plus optional end links:
//   s.a (start) / s.b (end) = { kind: 'port', itemId, portId }   tied to a part's duct connection
//                           | { kind: 'run', id, end: 'start'|'end' } butted to another run's end
//                           | { kind: 'side', id, seg, t }       branch take-off off another run's side
// Linked ends follow whatever they are tied to, so runs stay joined when parts or runs move.
const SM_SNAP_PX = 16;
const SM_DEFAULT_SHEET = 2400; // mm between TDF joints (stock sheet length)
// Run material: 'sheet' (rectangular sheet metal, default) | 'spiral' (round, w = diameter) | 'board' (PolyPlan duct board).
const SM_MATS = { sheet: 'Sheet metal', spiral: 'Spiral (round)', board: 'Duct board (PolyPlan)' };
const smMat = (s) => (SM_MATS[s?.mat] ? s.mat : 'sheet');
const smDims = (s) => (smMat(s) === 'spiral' ? { w: Number(s.w) || 300, h: Number(s.w) || 300 } : { w: Number(s.w) || 300, h: Number(s.h) || 150 });
const smSizeText = (s) => (smMat(s) === 'spiral' ? `${smDims(s).w}Ø` : `${smDims(s).w} x ${smDims(s).h}`);
const smRunName = (s) => (smMat(s) === 'spiral' ? `Spiral duct — ${smDims(s).w}Ø` : smMat(s) === 'board' ? `Duct board (PolyPlan) — ${smDims(s).w} x ${smDims(s).h} mm` : `Sheet metal duct — ${smDims(s).w} x ${smDims(s).h} mm`);
const BOARD_MM = 25; // duct board wall thickness
const smLenOf = (pts) => pts.reduce((n, q, i) => (i ? n + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0);

function smLinkPoint(link, ctx, depth) {
  if (!link) return null;
  if (link.kind === 'port') {
    const it = ctx.items.find((i) => i.id === link.itemId);
    if (!it) return null;
    const q = portInfo(it, link.portId, ctx.ppm);
    return { x: q.x, y: q.y };
  }
  const t = ctx.sketch.find((x) => x.id === link.id && x.kind === 'smduct');
  if (!t?.pts?.length) return null;
  const pts = depth < 3 ? smPts(t, ctx, depth + 1) : t.pts;
  if (link.kind === 'run') return link.end === 'start' ? pts[0] : pts[pts.length - 1];
  if (link.kind === 'side') {
    const a = pts[link.seg];
    const b = pts[link.seg + 1];
    if (!a || !b) return null;
    return { x: a.x + (b.x - a.x) * link.t, y: a.y + (b.y - a.y) * link.t };
  }
  return null;
}

// A run's live points: tied ends follow the part or run they're joined to.
function smPts(s, ctx, depth = 0) {
  const pts = (s.pts || []).map((q) => ({ x: q.x, y: q.y }));
  if (pts.length < 2) return pts;
  const a = smLinkPoint(s.a, ctx, depth);
  const b = smLinkPoint(s.b, ctx, depth);
  if (a) pts[0] = a;
  if (b) pts[pts.length - 1] = b;
  if (s.trKind === 'flatL' || s.trKind === 'flatR') {
    const sa = smEccShift(s, 'a', ctx, depth);
    const sb = smEccShift(s, 'b', ctx, depth);
    const e = pts.length - 1;
    const move = (i, d) => { pts[i] = { x: pts[i].x + d.x, y: pts[i].y + d.y }; };
    // Shift the whole first (or last) straight so it stays parallel, unless its far end is tied down.
    if (sa.x || sa.y) { move(0, sa); if (e > 1 || !s.b) move(1, sa); }
    if (sb.x || sb.y) { move(e, sb); if (e > 1 || !s.a) move(e - 1, sb); }
  }
  return pts;
}

// Nearest thing a sheet metal end can join: a run end or a part's duct connection
// first, otherwise the side of a run (a branch take-off).
function smFindSnap(p, tol, ctx, excludeId = null) {
  let best = null;
  let bd = tol;
  const consider = (cand, d) => { if (d < bd) { bd = d; best = cand; } };
  ctx.sketch.forEach((s) => {
    if (s.kind !== 'smduct' || s.id === excludeId) return;
    const pts = smPts(s, ctx);
    if (pts.length < 2) return;
    const f = pts[0];
    const l = pts[pts.length - 1];
    // Only free ends can be joined or carried on; tied ends already belong to something.
    if (!s.a) consider({ kind: 'end', id: s.id, end: 'start', x: f.x, y: f.y }, Math.hypot(f.x - p.x, f.y - p.y));
    if (!s.b) consider({ kind: 'end', id: s.id, end: 'end', x: l.x, y: l.y }, Math.hypot(l.x - p.x, l.y - p.y));
  });
  ctx.items.forEach((it) => {
    if (getTool(it.type).role === 'none') return;
    portDefs(it).forEach((d) => {
      if (d.service || d.joinOnly) return;
      const q = portInfo(it, d.id, ctx.ppm);
      consider({ kind: 'port', itemId: it.id, portId: d.id, x: q.x, y: q.y }, Math.hypot(q.x - p.x, q.y - p.y));
    });
  });
  if (best) return best;
  ctx.sketch.forEach((s) => {
    if (s.kind !== 'smduct' || s.id === excludeId) return;
    const pts = smPts(s, ctx);
    const half = (smDims(s).w / 1000) * ctx.ppm / 2;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1) continue;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
      const len = Math.sqrt(l2);
      if (t * len < half || (1 - t) * len < half) continue; // keep clear of bends and ends
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      consider({ kind: 'side', id: s.id, seg: i, t, x, y }, Math.max(0, Math.hypot(x - p.x, y - p.y) - half));
    }
  });
  return best;
}

const smLinkFrom = (t) => (!t ? undefined
  : t.kind === 'end' ? { kind: 'run', id: t.id, end: t.end }
  : t.kind === 'port' ? { kind: 'port', itemId: t.itemId, portId: t.portId }
  : { kind: 'side', id: t.id, seg: t.seg, t: t.t });

// Freeze a run where it is drawn now and drop the ties at the chosen ends.
function smBake(s, ctx, ends = ['a', 'b']) {
  const pts = smPts(s, ctx);
  const out = { ...s, pts };
  ends.forEach((k) => { delete out[k]; });
  return { ...out, x1: pts[0].x, y1: pts[0].y, x2: pts[pts.length - 1].x, y2: pts[pts.length - 1].y };
}

// Untie every run joined to run `id` (used before deleting or Ctrl-dragging it away).
function smDetachOthers(sketch, id, ctx) {
  return sketch.map((s) => {
    if (s.kind !== 'smduct' || s.id === id) return s;
    const ends = ['a', 'b'].filter((k) => s[k] && s[k].kind !== 'port' && s[k].id === id);
    return ends.length ? smBake(s, ctx, ends) : s;
  });
}

// Parts that drop onto a sheet metal run: in-line ones sit in it, spigots sit on its side.
const SM_INLINE = new Set(['flexconn', 'exhfan', 'vcd', 'firedamper', 'motdamper', 'backdraft', 'attenuator']);
const SM_SIDE = new Set(['spigot']);
const SM_INLINE_LEN = { vcd: 250, firedamper: 300, motdamper: 300, backdraft: 250, attenuator: 900 }; // mm along the run

// A transition dropped near the open end of a run snaps onto it: inlet on the run end,
// pointing on along the run, inlet sized to the duct. Draw on from its outlet.
function smSeatTransition(item, ctx, reach, outSize) {
  let best = null;
  ctx.sketch.forEach((s) => {
    if (s.kind !== 'smduct') return;
    const P = smPts(s, ctx);
    if (P.length < 2) return;
    [['start', 0, 1, 'a'], ['end', P.length - 1, P.length - 2, 'b']].forEach(([end, i, j, key]) => {
      if (s[key]) return; // already tied to something
      const d = Math.hypot(item.cx - P[i].x, item.cy - P[i].y);
      const L0 = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) || 1;
      const u = { x: (P[i].x - P[j].x) / L0, y: (P[i].y - P[j].y) / L0 };
      if (Math.abs(u.x) > 0.01 && Math.abs(u.y) > 0.01) return; // parts turn in 90° steps
      if (d > reach * 4 || (best && d >= best.d)) return;
      const dd = smDims(s);
      const tIn = smMat(s) === 'spiral' ? String(dd.w) : `${dd.w}x${dd.h}`;
      const tOut = outSize && outSize !== tIn ? outSize : item.tOut || (smMat(s) === 'spiral' ? String(Math.max(100, dd.w - 50)) : `${Math.max(100, dd.w - 100)}x${dd.h}`);
      const len = Math.max(100, Number(item.tLen) || 300);
      const Lw = (len / 1000) * ctx.ppm;
      const rot = u.x > 0.5 ? 0 : u.y > 0.5 ? 90 : u.x < -0.5 ? 180 : 270;
      best = { d, cx: P[i].x + u.x * Lw / 2, cy: P[i].y + u.y * Lw / 2, rot, tIn, tOut, runId: s.id, key, end };
    });
  });
  return best;
}

// Where a part dropped near a run should sit, or null if it isn't close enough.
function smSeat(item, ctx, reach) {
  const inline = SM_INLINE.has(item.type);
  if (!inline && !SM_SIDE.has(item.type)) return null;
  let best = null;
  ctx.sketch.forEach((s) => {
    if (s.kind !== 'smduct') return;
    const P = smPts(s, ctx);
    const hw = (smDims(s).w / 1000) * ctx.ppm / 2;
    for (let i = 0; i < P.length - 1; i += 1) {
      const a = P[i];
      const b = P[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (L < 1) continue;
      const ux = dx / L;
      const uy = dy / L;
      if (Math.abs(ux) > 0.01 && Math.abs(uy) > 0.01) continue; // parts turn in 90° steps: straight runs only
      const t = clamp(((item.cx - a.x) * ux + (item.cy - a.y) * uy) / L, 0, 1);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const off = (item.cx - px) * -uy + (item.cy - py) * ux; // + = left of travel
      const dist = Math.abs(off) - hw;
      if (dist > reach || (best && dist >= best.dist)) continue;
      if (inline) {
        // Dampers take the duct's size; fans keep their own casing.
        const d = smDims(s);
        const along = item.type === 'flexconn' ? (String(item.spec?.kind || '').includes('100') ? 100 : 150) : SM_INLINE_LEN[item.type] || 300;
        const dims = item.type === 'exhfan' ? null : { w: along, d: d.w };
        const size = `${d.w}x${d.h}mm`;
        const sizeOpts = getTool(item.type).specs?.find((f) => f.key === 'size')?.options || [];
        best = { dist, cx: px, cy: py, rot: Math.abs(ux) > 0.5 ? 0 : 90, onRun: { id: s.id, seg: i, t }, dims, spec: sizeOpts.includes(size) ? { size } : null, ductSize: `${d.w}x${d.h}` };
      } else {
        const side = off >= 0 ? 1 : -1;
        const nx = -uy * side;
        const ny = ux * side;
        const depth = (footprintMm(item)[1] / 1000) * ctx.ppm;
        const rot = ny > 0.5 ? 0 : nx < -0.5 ? 90 : ny < -0.5 ? 180 : 270;
        best = { dist, cx: px + nx * (hw + depth / 2), cy: py + ny * (hw + depth / 2), rot, onRun: { id: s.id, seg: i, t, side } };
      }
    }
  });
  return best;
}

const smReverse = (s) => ({ ...s, pts: [...s.pts].reverse(), a: s.b, b: s.a });

// Join run X's end to run Y's end into one continuous run (same size), re-pointing
// anything that was tied to Y. Returns the new sketch array.
function smMerge(sketch, xId, xEnd, yId, yEnd, ctx) {
  let X = sketch.find((s) => s.id === xId);
  let Y = sketch.find((s) => s.id === yId);
  if (!X || !Y || X.id === Y.id) return sketch;
  const xRev = xEnd === 'start';
  const yRev = yEnd === 'end';
  X = xRev ? smReverse(X) : X;
  Y = yRev ? smReverse(Y) : Y;
  const nX = X.pts.length;
  const nY = Y.pts.length;
  const pts = [...X.pts, ...Y.pts.slice(1)];
  const merged = { ...X, pts, b: Y.b, x1: pts[0].x, y1: pts[0].y, x2: pts[pts.length - 1].x, y2: pts[pts.length - 1].y };
  if (!merged.b) delete merged.b;
  const remap = (link) => {
    if (!link || link.kind === 'port') return link;
    if (link.id === X.id) {
      if (link.kind === 'run') {
        const end = xRev ? (link.end === 'start' ? 'end' : 'start') : link.end;
        return end === 'end' ? null : { ...link, end: 'start' }; // X's joined end is now inside the run
      }
      return xRev ? { ...link, seg: nX - 2 - link.seg, t: 1 - link.t } : link;
    }
    if (link.id === Y.id) {
      if (link.kind === 'run') {
        const end = yRev ? (link.end === 'start' ? 'end' : 'start') : link.end;
        return end === 'start' ? null : { kind: 'run', id: X.id, end: 'end' };
      }
      const seg = yRev ? nY - 2 - link.seg : link.seg;
      return { kind: 'side', id: X.id, seg: nX - 1 + seg, t: yRev ? 1 - link.t : link.t };
    }
    return link;
  };
  return sketch
    .filter((s) => s.id !== Y.id)
    .map((s) => {
      if (s.id === X.id) return merged;
      if (s.kind !== 'smduct') return s;
      let next = s;
      ['a', 'b'].forEach((k) => {
        if (!s[k] || s[k].kind === 'port' || (s[k].id !== X.id && s[k].id !== Y.id)) return;
        const r = remap(s[k]);
        if (r === null) next = smBake(next, ctx, [k]);
        else next = { ...next, [k]: r };
      });
      return next;
    });
}

// Fittings a run needs where its ends are tied: transitions, branch take-offs, square-to-rounds.
function smEndFittings(s, ctx) {
  const out = [];
  const pts = smPts(s, ctx);
  if (pts.length < 2) return out;
  const me = smDims(s);
  [['a', 0, 1], ['b', pts.length - 1, pts.length - 2]].forEach(([k, i, j]) => {
    const link = s[k];
    if (!link) return;
    const at = pts[i];
    const len = Math.hypot(pts[j].x - at.x, pts[j].y - at.y) || 1;
    const u = { x: (pts[j].x - at.x) / len, y: (pts[j].y - at.y) / len }; // pointing into this run
    if (link.kind === 'port') {
      const it = ctx.items.find((x) => x.id === link.itemId);
      if (it?.type === 'transition') return; // the transition is the fitting
      const dia = it ? portSizeMm(it, link.portId) : null;
      if (dia) out.push({ type: 'sq2round', at, u, from: { w: dia, h: dia, round: true }, to: me, label: `Square-to-round — ${me.w} x ${me.h} to ${dia}Ø` });
      return;
    }
    const t = ctx.sketch.find((x) => x.id === link.id);
    if (!t) return;
    const other = smDims(t);
    if (link.kind === 'side') {
      out.push({ type: 'bto', at, u, from: other, to: me, label: `Branch take-off (shoe) — ${me.w} x ${me.h} off ${other.w} x ${other.h}` });
    } else {
      if (other.w !== me.w || other.h !== me.h) {
        const lenMm = smTransLenMm(other, me, s);
        const ecc = s.trKind === 'flatL' || s.trKind === 'flatR';
        out.push({ type: 'transition', at, u, from: other, to: me, lenMm, ecc, shift: smEccShift(s, k, ctx), label: `Transition — ${other.w} x ${other.h} to ${me.w} x ${me.h} x ${lenMm}mm long${ecc ? ' (flat one side)' : ''}` });
      }
      // Leaving a run end at an angle needs a bend as well.
      const tp = smPts(t, ctx);
      if (tp.length > 1) {
        const [p1, p0] = link.end === 'end' ? [tp[tp.length - 1], tp[tp.length - 2]] : [tp[0], tp[1]];
        const ol = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const dot = clamp(((p1.x - p0.x) / ol) * u.x + ((p1.y - p0.y) / ol) * u.y, -1, 1);
        const deg = (Math.acos(dot) * 180) / Math.PI;
        if (deg > 10) {
          const big = other.w * other.h >= me.w * me.h ? other : me;
          out.push({ type: 'bend', at, u, from: other, to: me, label: smBendLabel(s, deg, big.w, big.h) });
        }
      }
    }
  });
  return out;
}

// Runs and parts tied together into systems (one logical duct network each).
function smNetworks(ctx) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a, b) => { add(a); add(b); parent.set(find(a), find(b)); };
  ctx.sketch.forEach((s) => {
    if (s.kind !== 'smduct') return;
    add(`r:${s.id}`);
    ['a', 'b'].forEach((k) => {
      const l = s[k];
      if (!l) return;
      union(`r:${s.id}`, l.kind === 'port' ? `i:${l.itemId}` : `r:${l.id}`);
    });
  });
  ctx.items.forEach((it) => { if (it.onRun?.id) union(`r:${it.onRun.id}`, `i:${it.id}`); });
  const groups = new Map();
  parent.forEach((_, key) => {
    const r = find(key);
    if (!groups.has(r)) groups.set(r, { runIds: [], itemIds: [] });
    const g = groups.get(r);
    if (key.startsWith('r:')) g.runIds.push(key.slice(2));
    else g.itemIds.push(key.slice(2));
  });
  return [...groups.values()];
}

// Count the 45° and 90° bends along a drawn sheet metal run.
function smBends(s) {
  const out = { b45: 0, b90: 0 };
  const p = s.pts || [];
  for (let i = 1; i < p.length - 1; i += 1) {
    const a1 = Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x);
    const a2 = Math.atan2(p[i + 1].y - p[i].y, p[i + 1].x - p[i].x);
    let t = Math.abs(((a2 - a1) * 180) / Math.PI) % 360;
    if (t > 180) t = 360 - t;
    if (t < 10) continue;
    if (t < 67.5) out.b45 += 1;
    else out.b90 += 1;
  }
  return out;
}

// ---- Sheet metal geometry: bends, straight pieces, reducers ----
// s.bend: 'square' (mitred, default) | 'radius'; s.bendR: centre radius as a multiple of W (1 or 1.5);
// s.vanes: turning vanes per 90° bend (0 / 2 / 3). s.trKind: 'con' | 'flatL' | 'flatR' for a transition
// at a tied end; s.taper: 4 or 7 (1:4 / 1:7). s.ls / s.elev: annotation only.
const smIsRadius = (s) => s.bend === 'radius';
const smVaneCount = (s) => (s.vanes != null && s.vanes !== '' ? Number(s.vanes) : smIsRadius(s) ? 0 : 3);

// Centre-line path plus, per segment, the straight part left once bends take their share.
function smLayout(P, s, mm) {
  const W = Math.max(3, smDims(s).w * mm);
  const n = P.length;
  const lens = [];
  const us = [];
  for (let i = 0; i < n - 1; i += 1) {
    const L = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
    lens.push(L);
    us.push(L ? { x: (P[i + 1].x - P[i].x) / L, y: (P[i + 1].y - P[i].y) / L } : { x: 1, y: 0 });
  }
  const cut = new Array(n).fill(0);
  const bends = [];
  const k = Number(s.bendR) || 1;
  for (let i = 1; i < n - 1; i += 1) {
    if (lens[i - 1] < 1 || lens[i] < 1) continue;
    const u1 = us[i - 1];
    const u2 = us[i];
    const deg = (Math.acos(clamp(u1.x * u2.x + u1.y * u2.y, -1, 1)) * 180) / Math.PI;
    if (deg < 10) continue;
    const b = { i, v: P[i], u1, u2, deg, radius: false };
    if (smIsRadius(s) && deg < 170) {
      const tanH = Math.tan((deg * Math.PI) / 360);
      const tl = Math.min(k * W * tanH, lens[i - 1] / 2, lens[i] / 2);
      const R = tl / tanH;
      const cross = u1.x * u2.y - u1.y * u2.x;
      const nT = cross > 0 ? { x: -u1.y, y: u1.x } : { x: u1.y, y: -u1.x };
      const st = { x: P[i].x - u1.x * tl, y: P[i].y - u1.y * tl };
      const en = { x: P[i].x + u2.x * tl, y: P[i].y + u2.y * tl };
      Object.assign(b, { radius: true, R, tl, st, en, c: { x: st.x + nT.x * R, y: st.y + nT.y * R }, sweep: cross > 0 ? 1 : 0 });
      cut[i] = tl;
    }
    bends.push(b);
  }
  let d = n ? `M${P[0].x},${P[0].y}` : '';
  for (let i = 1; i < n - 1; i += 1) {
    const b = bends.find((x) => x.i === i);
    d += b?.radius ? ` L${b.st.x},${b.st.y} A${b.R},${b.R} 0 0 ${b.sweep} ${b.en.x},${b.en.y}` : ` L${P[i].x},${P[i].y}`;
  }
  if (n > 1) d += ` L${P[n - 1].x},${P[n - 1].y}`;
  const segs = lens.map((L, i) => ({ a: P[i], u: us[i], from: cut[i], to: L - cut[i + 1] }));
  return { d, bends, segs, W };
}

// Straight pieces cut from stock sheet lengths: each straight between bends starts fresh.
function smPieces(segs, mm, sheetLen) {
  const sheet = Number(sheetLen) || SM_DEFAULT_SHEET;
  const tally = new Map();
  let count = 0;
  segs.forEach((g) => {
    const len = (g.to - g.from) / mm;
    if (len < 20) return;
    const full = Math.floor(len / sheet + 1e-6);
    let rem = Math.round((len - full * sheet) / 5) * 5;
    if (rem < 20) rem = 0;
    if (full) tally.set(sheet, (tally.get(sheet) || 0) + full);
    if (rem) tally.set(rem, (tally.get(rem) || 0) + 1);
    count += full + (rem ? 1 : 0);
  });
  return { tally, count };
}
const smPiecesText = (tally) => [...tally.entries()].sort((x, y) => y[0] - x[0]).map(([len, q]) => `${q} x ${len}mm`).join(' + ');

function smBendLabel(s, deg, w, h) {
  const ninety = deg >= 67.5;
  const vanes = ninety && smVaneCount(s) > 0 ? ' c/w turning vanes' : '';
  const kind = smIsRadius(s) ? `radius bend (R ${(Number(s.bendR) || 1).toFixed(1)}W)` : 'square bend';
  return `Sheet metal ${ninety ? '90°' : '45°'} ${kind}${vanes} — ${w} x ${h} mm`;
}

// Eccentric (flat one side) reducer: shift this run's tied end sideways so one edge runs straight through.
function smEccShift(s, k, ctx, depth = 0) {
  const link = s[k];
  if (!link || link.kind !== 'run' || (s.trKind !== 'flatL' && s.trKind !== 'flatR')) return { x: 0, y: 0 };
  const t = ctx.sketch.find((x) => x.id === link.id && x.kind === 'smduct');
  if (!t?.pts?.length) return { x: 0, y: 0 };
  const tp = depth < 3 ? smPts(t, ctx, depth + 1) : t.pts;
  if (tp.length < 2) return { x: 0, y: 0 };
  const [p1, p0] = link.end === 'end' ? [tp[tp.length - 1], tp[tp.length - 2]] : [tp[0], tp[1]];
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const ud = { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L };
  const half = ((smDims(t).w - smDims(s).w) / 2 / 1000) * ctx.ppm;
  const side = s.trKind === 'flatL' ? 1 : -1;
  return { x: ud.y * half * side, y: -ud.x * half * side };
}

// Transition length from the taper: 1:4 or 1:7 on the side that moves most.
function smTransLenMm(from, to, s) {
  const ratio = Number(s.taper) || 4;
  const ecc = s.trKind === 'flatL' || s.trKind === 'flatR';
  const dW = Math.abs(from.w - to.w);
  const dH = Math.abs(from.h - to.h);
  return Math.max(150, Math.ceil((Math.max(ecc ? dW : dW / 2, dH / 2) * ratio) / 25) * 25);
}

// ---- Duct sizing from airflow (equal friction with a velocity cap) ----
// Friction via Altshul–Tsal on the equivalent round diameter (galvanised steel, air at 20°C).
const SM_SIZING = {
  standard: { label: 'Standard (1.0 Pa/m, max 6 m/s)', pa: 1.0, vmax: 6 },
  quiet: { label: 'Quiet (0.8 Pa/m, max 4 m/s)', pa: 0.8, vmax: 4 },
};
function smAirflow(lps, w, h) {
  const q = Number(lps) / 1000; // m³/s
  if (!(q > 0) || !(w > 0) || !(h > 0)) return null;
  const v = q / ((w / 1000) * (h / 1000));
  const d = eqDia(w, h) / 1000;
  const vr = q / ((Math.PI * d * d) / 4);
  const re = (vr * d) / 1.5e-5;
  const f = 0.11 * (0.00009 / d + 68 / re) ** 0.25;
  const fr = f >= 0.018 ? f : 0.85 * f + 0.0028;
  return { v, pa: (fr / d) * ((1.2 * vr * vr) / 2) };
}
// Smallest width (50 mm steps) at each depth that meets the sizing rule, aspect ratio ≤ 4:1.
function smSuggest(lps, mode = 'standard', depths = [200, 250, 300, 350, 400, 450, 500, 600]) {
  const rule = SM_SIZING[mode] || SM_SIZING.standard;
  if (!(Number(lps) > 0)) return [];
  return depths.map((h) => {
    for (let w = Math.max(100, Math.ceil(h / 2 / 50) * 50); w <= h * 4; w += 50) {
      const a = smAirflow(lps, w, h);
      if (a.pa <= rule.pa && a.v <= rule.vmax) return { w, h, ...a };
    }
    return null;
  }).filter(Boolean);
}

// Split run `id` at `dist` (world units along it) into two tied runs; the far part takes `dims`.
// Anything tied to or sitting on the far part moves to the new run. Returns null if dist is off the ends.
function smSplit(sketch, items, id, dist, dims, ctx, newId) {
  const run = sketch.find((x) => x.id === id);
  if (!run) return null;
  const P = smPts(run, ctx);
  let acc = 0;
  for (let i = 0; i < P.length - 1; i += 1) {
    const L = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
    if (dist > acc + 1 && dist < acc + L - 1) {
      const t = (dist - acc) / L;
      const q = { x: P[i].x + (P[i + 1].x - P[i].x) * t, y: P[i].y + (P[i + 1].y - P[i].y) * t };
      const first = { ...run, pts: [...P.slice(0, i + 1), q] };
      delete first.b;
      const second = { ...run, id: newId, pts: [q, ...P.slice(i + 1)], a: { kind: 'run', id, end: 'end' }, w: dims.w, h: dims.h, trKind: dims.trKind || 'con' };
      if (!run.b) delete second.b;
      const remap = (link) => {
        if (!link || link.id !== id) return link;
        if (link.kind === 'run') return link.end === 'end' ? { ...link, id: newId } : link;
        if (link.seg > i) return { ...link, id: newId, seg: link.seg - i };
        if (link.seg === i && link.t > t) return { ...link, id: newId, seg: 0, t: (link.t - t) / (1 - t) };
        if (link.seg === i) return { ...link, t: link.t / t };
        return link;
      };
      const nextSketch = sketch.flatMap((x) => {
        if (x.id === id) return [first, second];
        if (x.kind !== 'smduct') return [x];
        const a = x.a?.kind === 'port' ? x.a : remap(x.a);
        const b = x.b?.kind === 'port' ? x.b : remap(x.b);
        return [a === x.a && b === x.b ? x : { ...x, a, b }];
      });
      const nextItems = items.map((it) => {
        if (it.onRun?.id !== id) return it;
        const { kind, ...onRun } = remap({ kind: 'side', ...it.onRun }); // eslint-disable-line no-unused-vars
        return { ...it, onRun };
      });
      return { sketch: nextSketch, items: nextItems };
    }
    acc += L;
  }
  return null;
}

function roundedPath(pts, radius = 10) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const p = pts[i];
    const next = pts[i + 1];
    const l1 = Math.hypot(p.x - prev.x, p.y - prev.y);
    const l2 = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const s = { x: p.x - ((p.x - prev.x) / l1) * r, y: p.y - ((p.y - prev.y) / l1) * r };
    const e = { x: p.x + ((next.x - p.x) / l2) * r, y: p.y + ((next.y - p.y) / l2) * r };
    d += ` L${s.x},${s.y} Q${p.x},${p.y} ${e.x},${e.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x},${last.y}`;
}

function labelPoint(pts) {
  let best = { len: -1, x: pts[0].x, y: pts[0].y };
  for (let i = 1; i < pts.length; i += 1) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len > best.len) best = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
  }
  return best;
}

// Nearest centre (spiralling out) where a w x h box doesn't overlap any other box.
function findFreeCenter(cx, cy, w, h, boxes, gap) {
  const fits = (x, y) => !boxes.some((b) => Math.abs(x - b.cx) < (w + b.w) / 2 + gap && Math.abs(y - b.cy) < (h + b.h) / 2 + gap);
  const clampX = (v) => clamp(v, w / 2, WORLD_W - w / 2);
  const clampY = (v) => clamp(v, h / 2, WORLD_H - h / 2);
  const start = { x: clampX(cx), y: clampY(cy) };
  if (fits(start.x, start.y)) return start;
  const step = 6;
  for (let ring = 1; ring < 120; ring += 1) {
    let best = null;
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = clampX(start.x + dx * step);
        const y = clampY(start.y + dy * step);
        if (!fits(x, y)) continue;
        const dist = Math.hypot(x - start.x, y - start.y);
        if (!best || dist < best.dist) best = { x, y, dist };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return start;
}

function niceScaleBar(pxPerM, z) {
  const options = [0.25, 0.5, 1, 2, 5, 10, 20, 50];
  for (const m of options) {
    const px = m * pxPerM * z;
    if (px >= 60) return { m, px };
  }
  return { m: 50, px: 50 * pxPerM * z };
}

// Searchable list of parts: used by the desktop library panel (draggable)
// and the right-click 'Add part here' menu.
const statusOf = (x) => (x?.remove ? 'remove' : x?.existing ? 'existing' : 'new');
const STATUS_PATCH = { new: { existing: false, remove: false }, existing: { existing: true, remove: false }, remove: { existing: true, remove: true } };

function StatusPicker({ value, onChange, noun }) {
  const opts = [['new', 'New'], ['existing', 'Existing — stays'], ['remove', 'Existing — remove']];
  const tone = { new: 'border-primary bg-primary/10 text-primary', existing: 'border-slate-500 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100', remove: 'border-red-600 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' };
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{`${noun} status`}</span>
      <div className="grid grid-cols-3 gap-1">
        {opts.map(([id, label]) => (
          <button key={id} type="button" onClick={() => onChange(STATUS_PATCH[id])} className={`rounded-md border px-1.5 py-2 text-[11px] leading-tight font-medium ${value === id ? tone[id] : 'border-border text-muted-foreground'}`}>{label}</button>
        ))}
      </div>
      {value !== 'new' && <p className="text-[10px] text-muted-foreground">{value === 'remove' ? 'Shown crossed out in red. Listed as strip-out — not ordered.' : 'Shown dashed grey. Listed as existing — not ordered.'}</p>}
    </div>
  );
}

function ComponentList({ onPick, draggable = false, autoFocus = false, compact = false }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const groups = CATALOG
    .map((g) => ({ ...g, items: g.items.filter((t) => !query || `${t.label} ${t.tag} ${g.group}`.toLowerCase().includes(query)) }))
    .filter((g) => g.items.length);
  return (
    <div className="flex flex-col min-h-0">
      <div className="relative mb-2 shrink-0">
        <ApperIcon name="Search" size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && groups[0]?.items[0]) onPick(groups[0].items[0].type); }}
          placeholder="Search parts"
          className="h-8 pl-7 text-sm"
        />
      </div>
      <div className={`overflow-y-auto min-h-0 space-y-2 ${compact ? 'max-h-72' : ''}`}>
        {groups.map((g) => (
          <div key={g.group}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-0.5">{g.group}</div>
            {g.items.map((t) => (
              <button
                key={t.type}
                type="button"
                draggable={draggable}
                onDragStart={(event) => { event.dataTransfer.setData('text/x-hvac-part', t.type); event.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => onPick(t.type)}
                title={draggable ? `Drag onto the plan, or click to add ${t.label}` : `Add ${t.label} here`}
                className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <span className="size-7 shrink-0 flex items-center justify-center rounded border border-border bg-card">
                  <HvacSymbol type={t.type} size={20} />
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <p className="text-xs text-muted-foreground px-1">No parts match that search.</p>}
      </div>
    </div>
  );
}

// Older drawings stored the top-left corner of a 48px box; convert to centres.
function migrateItems(list) {
  return (list || []).map((item) => (item.cx != null ? item : { ...item, cx: (item.x ?? 0) + 24, cy: (item.y ?? 0) + 24 }));
}

export default function DrawingWorkspace({ page, project, onSave, onSaveProject, onBack, levels = [], onSwitchLevel, onAddLevel }) {
  const [items, setItems] = useState([]);
  const [connections, setConnections] = useState([]);
  const [joins, setJoins] = useState([]); // [{ id, a:{itemId,portId}, b:{itemId,portId} }]
  const [background, setBackground] = useState('');
  const [planFile, setPlanFile] = useState([]);
  const [planBusy, setPlanBusy] = useState(false);
  const [scale, setScale] = useState(null);
  const [scaleDraft, setScaleDraft] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  // Which phase of the job to show: everything, the site as it stands, or the finished proposal.
  const [phaseView, setPhaseView] = useState('all');
  const inView = (x) => {
    const s = statusOf(x);
    if (phaseView === 'existing') return s !== 'new';
    if (phaseView === 'proposed') return s !== 'remove';
    return true;
  };
  const [selectedId, setSelectedId] = useState(null);
  const [selectedConnId, setSelectedConnId] = useState(null);
  const [ductType, setDuctType] = useState('supply');
  const [ductMaterial, setDuctMaterial] = useState('flex');
  const [runMaterial, setRunMaterial] = useState('sheet'); // material for new SM-duct-tool runs
  const [sheetDims, setSheetDims] = useState({ w: 300, h: 150 });
  const [pendingPort, setPendingPort] = useState(null);
  const [status, setStatus] = useState('Loaded');
  const [view, setView] = useState({ x: 0, y: 0, z: 0.5 });
  const viewRef = useRef(view);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const lastSavedRef = useRef(null);
  const clipRef = useRef(null);
  const historyRef = useRef({ stack: [], index: -1 });
  // Heat load climate for this drawing, and the auto duct layout preview.
  const [climate, setClimate] = useState(DEFAULT_CLIMATE);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoPreview, setAutoPreview] = useState(null); // { options: [...], index }
  const restoringRef = useRef(false);
  const [wire, setWire] = useState(null); // live duct being dragged from a port
  const [showKeys, setShowKeys] = useState(false);
  // Panels always start shown; H / the toolbar button hides them for this visit only.
  const [compact, setCompact] = useState(false);
  useEffect(() => { try { localStorage.removeItem('dp-compact'); } catch { /* ignore */ } }, []);
  const [printMode, setPrintMode] = useState(null); // 'plan' | 'pick'
  const [printOpts, setPrintOpts] = useState({ paper: 'A3', scale: 'fit' });
  const [printDialog, setPrintDialog] = useState(false);
  const [printScaleUsed, setPrintScaleUsed] = useState(null);
  // Free sketch for jobs with no plan: walls, room boxes and text labels.
  const [sketch, setSketch] = useState([]);
  const [sketchTool, setSketchTool] = useState(null); // null | 'wall' | 'room' | 'text'
  const [sketchDraft, setSketchDraft] = useState(null);
  const [selectedSketchId, setSelectedSketchId] = useState(null);
  const [redForm, setRedForm] = useState({ at: '', w: '', h: '', kind: 'con' });
  useEffect(() => { if (selectedId || selectedConnId) setSelectedSketchId(null); }, [selectedId, selectedConnId]);
  const [jobOpen, setJobOpen] = useState(false);
  const [jobForm, setJobForm] = useState({});
  const [jobSaving, setJobSaving] = useState(false);
  const lastTapRef = useRef(null);
  const [isFull, setIsFull] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, world } right-click add menu
  const [rightTab, setRightTab] = useState('selection');
  const [planDragOver, setPlanDragOver] = useState(false);
  // Pen mode: the pen draws and moves parts; fingers only pan and zoom (palm-safe).
  const [penMode, setPenMode] = useState(() => { try { return localStorage.getItem('dp-pen') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('dp-pen', penMode ? '1' : '0'); } catch { /* private mode */ } }, [penMode]);
  const fingerOnly = (event) => penMode && event.pointerType === 'touch';
  // No-signal safety: unsaved work is kept on this device and synced when back online.
  const dirtyRef = useRef(false);
  const saveRef = useRef(null);
  const saveFailToastRef = useRef(false);
  const draftKey = `dp-draft-${page.Id}`;
  const online = true; // everything saves on this device; no signal needed
  // Site photos pinned to notes: stored in the page's Site Photos files field.
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const [levelBusy, setLevelBusy] = useState(false);

  // Undo history: snapshot the drawing shortly after each change settles.
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return undefined; }
    const t = setTimeout(() => {
      const snapshot = JSON.stringify({ items, connections, joins, sketch });
      const h = historyRef.current;
      if (h.stack[h.index] === snapshot) return;
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snapshot);
      if (h.stack.length > 80) h.stack.shift();
      h.index = h.stack.length - 1;
    }, 400);
    return () => clearTimeout(t);
  }, [items, connections, joins, sketch]);
  useEffect(() => { if (selectedId || selectedConnId) setRightTab('selection'); }, [selectedId, selectedConnId]);

  // Keep a copy of unsaved work on this device.
  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    const t = setTimeout(() => {
      if (!dirtyRef.current) return; // already saved
      try {
        localStorage.setItem(draftKey, JSON.stringify({ t: Date.now(), payload: JSON.stringify({ items, connections, joins, scale, showLabels, sketch, climate }) }));
      } catch { /* storage full or blocked */ }
    }, 800);
    return () => clearTimeout(t);
  }, [items, connections, joins, scale, showLabels, sketch, climate, draftKey]);

  // Saving is on this device now, so losing signal no longer matters.
  // Autosave: a couple of seconds after any change (drawing, plan, photos), save it.
  useEffect(() => {
    if (!dirtyRef.current || planBusy) return undefined;
    const t = setTimeout(() => { if (dirtyRef.current) saveRef.current?.({ auto: true }); }, 1500);
    return () => clearTimeout(t);
  }, [items, connections, joins, scale, showLabels, sketch, climate, planFile, photos, planBusy]);
  // Leaving the tab or closing the window: save straight away.
  useEffect(() => {
    const flush = () => { if (dirtyRef.current) saveRef.current?.({ auto: true }); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); };
  }, []);

  const ppm = scale?.pxPerM || DEFAULT_PPM;
  // A plan sheet should be a few metres to ~100 m across; outside that the reference was entered wrong.
  const scaleOff = !!scale && (WORLD_W / scale.pxPerM > 120 || WORLD_W / scale.pxPerM < 2);
  PLAN_MIN.px = scale ? 6 : MIN_PX;
  const smCtx = { sketch, items, ppm }; // for the sheet metal network helpers
  // Cooling load (kW) for a room from its heat-load inputs and this drawing's climate.
  const roomLoadKw = (areaM2, room = null) => calcRoomLoad(room?.hl, Math.abs(areaM2), climate, room?.name || room?.room || '').coolKw;

  useEffect(() => { viewRef.current = view; }, [view]);

  const fitView = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const z = Math.min(w / WORLD_W, h / WORLD_H);
    setView({ z, x: (w - WORLD_W * z) / 2, y: (h - WORLD_H * z) / 2 });
  }, []);

  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const z = clamp(v.z * factor, MIN_Z, MAX_Z);
      const wx = (cx - v.x) / v.z;
      const wy = (cy - v.y) / v.z;
      return { z, x: cx - wx * z, y: cy - wy * z };
    });
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFull(!!document.fullscreenElement);
      requestAnimationFrame(fitView);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fitView]);

  function toggleFull() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      rootRef.current?.requestFullscreen?.().catch(() => toast.error('Full screen isn’t available in this browser.'));
    }
  }

  // Centre and zoom in on the selected part
  function focusSelected() {
    const el = canvasRef.current;
    if (!el || !selected) return;
    const b = itemBox(selected, ppm);
    const z = clamp(Math.min(el.clientWidth, el.clientHeight) / (Math.max(b.w, b.h) * 5), MIN_Z, MAX_Z);
    setView({ z, x: el.clientWidth / 2 - selected.cx * z, y: el.clientHeight / 2 - selected.cy * z });
  }

  function zoomCentre(factor) {
    const el = canvasRef.current;
    if (!el) return;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  }

  useEffect(() => {
    const id = requestAnimationFrame(fitView);
    return () => cancelAnimationFrame(id);
  }, [page.Id, fitView]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      if (event.target.closest?.('[data-no-zoom]')) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    // Our own save echoes back through props — keep everything on screen as it is.
    if (page.drawingJson_c && page.drawingJson_c === lastSavedRef.current) return;
    historyRef.current = { stack: [], index: -1 };
    const stored = Array.isArray(page.planFile_c) ? page.planFile_c : [];
    setPlanFile(stored);
    setPhotos(Array.isArray(page.sitePhotos_c) ? page.sitePhotos_c : []);
    setPhotoUrls({});
    dirtyRef.current = false;
    let source = page.drawingJson_c || '[]';
    let restored = false;
    try {
      const draft = JSON.parse(localStorage.getItem(`dp-draft-${page.Id}`) || 'null');
      const mod = Date.parse(page.ModifiedOn || '');
      if (draft?.payload && draft.payload !== page.drawingJson_c && (Number.isNaN(mod) || draft.t > mod)) {
        source = draft.payload;
        restored = true;
      } else if (draft) {
        localStorage.removeItem(`dp-draft-${page.Id}`);
      }
    } catch { /* no local copy */ }
    try {
      const saved = JSON.parse(source);
      if (Array.isArray(saved)) {
        setItems(migrateItems(saved));
        setBackground(stored[0]?.url || '');
        setSketch([]);
        setConnections([]);
        setJoins([]);
        setScale(null);
        setClimate(DEFAULT_CLIMATE);
      } else {
        setItems(migrateItems(saved.items));
        setConnections(saved.connections ?? []);
        setJoins(saved.joins ?? []);
        setSketch(saved.sketch ?? []);
        setScale(saved.scale ?? null);
        setShowLabels(saved.showLabels ?? true);
        setClimate(saved.climate && CLIMATES[saved.climate] ? saved.climate : DEFAULT_CLIMATE);
        // planFile_c (a real Files field) is the source of truth; an old drawing's inline
        // base64 background is shown as a last resort but won't be re-saved as such.
        setBackground(stored[0]?.url || saved.background || '');
      }
      setSelectedId(null);
      setSelectedConnId(null);
      setPendingPort(null);
      setScaleDraft(null);
      if (restored) {
        dirtyRef.current = true;
        setStatus('Restored unsaved changes from last time · saving');
        toast.message('Unsaved changes restored', { description: 'Work from your last session was kept and has been saved.' });
      } else {
        setStatus('Loaded saved drawing');
      }
    } catch {
      setItems([]);
      setBackground(stored[0]?.url || '');
      setConnections([]);
      setJoins([]);
      setScale(null);
      setStatus('Drawing data could not be read');
    }
  }, [page.Id, page.drawingJson_c, page.planFile_c]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);
  const selectedConn = useMemo(() => connections.find((conn) => conn.id === selectedConnId), [connections, selectedConnId]);

  const tags = useMemo(() => {
    const counts = {};
    const map = {};
    items.forEach((item) => {
      counts[item.type] = (counts[item.type] || 0) + 1;
      map[item.id] = `${getTool(item.type).tag}${counts[item.type]}`;
    });
    return map;
  }, [items]);

  const joinedPorts = useMemo(() => {
    const set = new Set();
    joins.forEach((j) => { set.add(portKey(j.a.itemId, j.a.portId)); set.add(portKey(j.b.itemId, j.b.portId)); });
    return set;
  }, [joins]);
  // Every port with a duct or a bolted joint on it.
  const usedPorts = useMemo(() => {
    const set = new Set(joinedPorts);
    connections.forEach((c) => { set.add(portKey(c.from.itemId, c.from.portId)); set.add(portKey(c.to.itemId, c.to.portId)); });
    return set;
  }, [joinedPorts, connections]);

  function groupOf(id, joinList = joins) {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      joinList.forEach((j) => {
        const other = j.a.itemId === cur ? j.b.itemId : j.b.itemId === cur ? j.a.itemId : null;
        if (other && !seen.has(other)) { seen.add(other); queue.push(other); }
      });
    }
    return [...seen];
  }

  const runs = useMemo(() => connections.map((conn) => {
    const fromItem = items.find((item) => item.id === conn.from.itemId);
    const toItem = items.find((item) => item.id === conn.to.itemId);
    if (!fromItem || !toItem) return null;
    const a = portInfo(fromItem, conn.from.portId, ppm);
    const b = portInfo(toItem, conn.to.portId, ppm);
    const pts = simplifyRoute(conn.bends?.length ? orthoRoute(a, conn.bends, b) : routePoints(a, a.dir, b, b.dir));
    const metres = scale || sketch.length ? pathLength(pts) / ppm : null;
    const size = conn.size || getDuct(conn.type).defaultSize;
    const ends = [
      { tag: fromItem.id, mm: portSizeMm(fromItem, a.id) },
      { tag: toItem.id, mm: portSizeMm(toItem, b.id) },
    ].filter((e) => e.mm);
    const mismatch = isRect(conn) ? [] : ends.filter((e) => e.mm !== size);
    return { conn, a, b, pts, metres, ends, mismatch };
  }).filter(Boolean), [connections, items, scale, ppm, sketch.length]);

  const takeoff = useMemo(() => {
    const lines = new Map();
    const add = (name, qty = 1) => lines.set(name, (lines.get(name) || 0) + qty);
    items.forEach((item) => {
      const tool = getTool(item.type);
      if (!tool.specs?.length) { add(tool.sheet || tool.label); return; }
      const fan = fanLine(item, tool);
      if (fan) add(fan);
      tool.specs.forEach((field, i) => {
        if (field.noTakeoff || (fan && i === 0)) return;
        const v = getSpec(item, field);
        if (v === 'None' || v === CHOOSE_MODEL) return;
        add(field.sheet ? `${field.sheet} — ${v}` : v);
      });
    });
    const rows = [...lines.entries()].map(([name, qty]) => ({ name, qty: String(qty) }));
    const bySize = new Map();
    runs.forEach(({ conn, metres }) => {
      const size = conn.size || getDuct(conn.type).defaultSize;
      const cur = bySize.get(size) || { count: 0, metres: 0 };
      cur.count += 1;
      cur.metres += metres || 0;
      bySize.set(size, cur);
    });
    [...bySize.entries()].sort((a, b) => a[0] - b[0]).forEach(([size, { count, metres }]) => {
      if (scale) rows.push({ name: `Flex duct R1.0 — ${sizeLabel(size)} x 6m (${fmtM(metres)} m drawn)`, qty: String(Math.max(1, Math.ceil(metres / FLEX_LENGTH_M))) });
      else rows.push({ name: `Duct runs — ${sizeLabel(size)} (set scale for lengths)`, qty: String(count) });
    });
    return rows;
  }, [items, runs, scale]);

  // Equipment list / bill of materials, grouped like the parts library.
  const equipment = useMemo(() => {
    const groups = new Map();
    const add = (group, name, qty = 1, extra = {}) => {
      if (!groups.has(group)) groups.set(group, new Map());
      const g = groups.get(group);
      const cur = g.get(name) || { name, qty: 0, ...extra };
      cur.qty += qty;
      g.set(name, cur);
    };
    const groupOfType = (type) => CATALOG.find((g) => g.items.some((t) => t.type === type))?.group || 'Other';
    const keep = new Map();
    const strip = new Map();
    const site = (item, name, metres) => {
      const m = item.remove ? strip : keep;
      const cur = m.get(name) || { name, qty: 0, metres: 0 };
      cur.qty += 1;
      cur.metres += metres || 0;
      m.set(name, cur);
    };
    items.forEach((item) => {
      if (item.existing) {
        if (item.type === 'zonearea') return;
        const t = getTool(item.type);
        const model = item.type === 'indoor' || item.type === 'splitindoor' ? item.spec?.model : item.type === 'outdoor' ? item.outdoorModel : null;
        site(item, model && model !== CHOOSE_MODEL ? `${t.label} — ${model}` : t.label);
        return; // existing gear — no new material
      }
      const tool = getTool(item.type);
      const group = groupOfType(item.type);
      if (item.type === 'indoor') {
        const m = item.spec?.model;
        add(group, !m || m === CHOOSE_MODEL ? 'Ducted unit — model not chosen' : `Ducted Unit — ${m}`);
        return;
      }
      if (SECTION_TYPES.has(item.type)) {
        const p = actronPair(item.spec?.model);
        const fan = item.type === 'fansection';
        add(group, `ActronAir 2-Piece ${fan ? 'Fan Section' : 'Coil Section'} — ${p ? (fan ? p.fanCode : p.coilCode) : 'model not chosen'}`, 1, p ? { note: `System ${p.coilCode} / ${p.fanCode} — outdoor ${p.outdoor}` } : {});
        return;
      }
      if (item.type === 'outdoor') {
        add(group, `Outdoor unit — ${item.outdoorModel || (item.suits ? `to suit ${item.suits}` : 'model not set')}`);
        return;
      }
      if (item.type === 'supply') {
        add(group, `${item.spec?.variant || 'Metal Diffusers + Neck'} — ${item.spec?.neck || '250mm'} neck`);
        return;
      }
      if (item.type === 'rafilterbox') {
        const face = item.spec?.face || '1190x590mm';
        const filter = item.spec?.filter || 'G4 pleated';
        add(group, `R/A filter box — ${face} face c/w ${rfbOutlet(item).label}`);
        add(group, `Filter media — ${filter} — ${face}`);
        return;
      }
      if (!tool.specs?.length) { add(group, tool.sheet || tool.label); return; }
      const fan = fanLine(item, tool);
      if (fan) add(group, fan);
      tool.specs.forEach((field, i) => {
        if (field.noTakeoff || (fan && i === 0)) return;
        const v = getSpec(item, field);
        if (v === 'None' || v === CHOOSE_MODEL) return;
        add(group, field.sheet ? `${field.sheet} — ${v}` : v);
      });
    });
    const lengthsKnown = !!(scale || sketch.length);
    const bySize = new Map();
    const coils = new Map();
    const trunks = new Map();
    let drainM = 0;
    let drainRuns = 0;
    let topUpKg = 0;
    const sheet = new Map();
    const cables = new Map();
    const breakers = new Map();
    runs.forEach(({ conn, metres }) => {
      if (conn.existing) {
        const nm = conn.type === 'pipe' ? 'Refrigerant pipe run' : conn.type === 'drain' ? 'Condensate drain run' : conn.type === 'power' ? 'Power cable run' : `${getDuct(conn.type).label} — ${sizeLabel(conn.size || getDuct(conn.type).defaultSize)}`;
        site(conn, nm, metres);
        return;
      }
      if (conn.type === 'pipe') {
        const k = pipeCoil(conn).idx ?? -1;
        const c = coils.get(k) || { m: 0, n: 0 };
        c.m += metres || 0;
        c.n += 1;
        coils.set(k, c);
        if (conn.trunking && conn.trunking !== 'None') trunks.set(conn.trunking, (trunks.get(conn.trunking) || 0) + (Number(conn.trunkM) || metres || 0));
        if (conn.topUp && Number(conn.topUpKg) > 0) topUpKg += Number(conn.topUpKg);
        return;
      }
      if (conn.type === 'power') {
        const brk = conn.breaker || BREAKERS[1];
        const cable = conn.cable || cableFor(brk);
        const c = cables.get(cable) || { m: 0, n: 0, drawn: 0 };
        c.n += 1;
        c.drawn += metres || 0;
        c.m += metres != null ? approxCable(metres) : 0;
        cables.set(cable, c);
        if (!conn.noBreaker) breakers.set(brk, (breakers.get(brk) || 0) + 1);
        return;
      }
      if (conn.type === 'drain') {
        drainM += metres || 0;
        drainRuns += 1;
        return;
      }
      if (isSheet(conn)) {
        const nm = `Sheet metal duct — ${sheetLabel(conn)}`;
        const cur = sheet.get(nm) || { count: 0, metres: 0 };
        cur.count += 1;
        cur.metres += metres || 0;
        sheet.set(nm, cur);
        return;
      }
      const size = conn.size || getDuct(conn.type).defaultSize;
      const cur = bySize.get(size) || { count: 0, metres: 0 };
      cur.count += 1;
      cur.metres += metres || 0;
      bySize.set(size, cur);
    });
    const ctxNow = { sketch, items, ppm };
    sketch.forEach((s) => {
      if (s.kind !== 'smduct' || !s.pts?.length) return;
      const { w, h } = smDims(s);
      const P = smPts(s, ctxNow);
      const nm = smRunName(s);
      const caps = (s.capA && !s.a ? 1 : 0) + (s.capB && !s.b ? 1 : 0);
      if (caps) add('Ductwork', `End cap — ${smSizeText(s)}${smMat(s) === 'spiral' ? '' : ' mm'}`, caps);
      const m = smLenOf(P) / ppm;
      const cur = sheet.get(nm) || { count: 0, metres: 0 };
      if (!cur.tally) cur.tally = new Map();
      cur.count += 1;
      cur.metres += m;
      const { b45, b90 } = smBends({ pts: P });
      if (b45) add('Ductwork', smBendLabel(s, 45, w, h), b45);
      if (b90) add('Ductwork', smBendLabel(s, 90, w, h), b90);
      if (lengthsKnown) {
        const pc = smPieces(smLayout(P, s, ppm / 1000).segs, ppm / 1000, s.sheetLen);
        pc.tally.forEach((q, len) => cur.tally.set(len, (cur.tally.get(len) || 0) + q));
        const joints = Math.max(0, pc.count - 1) + b45 + b90 + (s.a ? 1 : 0) + (s.b ? 1 : 0);
        if (joints) add('Ductwork', smMat(s) === 'spiral' ? `Spiral coupling / joint — ${w}Ø` : smMat(s) === 'board' ? `Duct board joint (tape / H-bar) — ${w} x ${h} mm` : `TDF joint set — ${w} x ${h} mm`, joints);
      }
      sheet.set(nm, cur);
      smEndFittings(s, ctxNow).forEach((f) => add('Ductwork', f.label, 1));
    });
    // Inline fans fitted in a run get a flexible canvas connection each side.
    items.forEach((it) => {
      if (it.type !== 'exhfan' || !it.onRun || it.canvas === false) return;
      const run = sketch.find((x) => x.id === it.onRun.id);
      if (run) add('Ductwork', `Flexible canvas connection — ${smSizeText(run)}${smMat(run) === 'spiral' ? '' : ' mm'}`, 2, { note: `either side of ${tags[it.id] || 'the fan'}` });
    });
    sheet.forEach(({ count, metres, tally }, nm) => {
      const cut = tally?.size ? ` · pieces: ${smPiecesText(tally)}` : '';
      if (lengthsKnown) add('Ductwork', nm, Math.max(1, Math.ceil(metres)), { swatch: '#94a3b8', note: `metres — ${fmtM(metres)} m drawn over ${count} run(s)${cut}` });
      else add('Ductwork', nm, count, { swatch: '#94a3b8', note: 'runs — set the scale for lengths' });
    });
    const RD = 'Refrigeration & drains';
    coils.forEach(({ m, n }, k) => {
      if (k < 0) add(RD, 'Pair coil — size unknown (choose the indoor model or pick a coil on the run)', n);
      else add(RD, `Soft Drawn Copper — ${PAIR_COILS[k]}`, lengthsKnown ? Math.max(1, Math.ceil(m / 18)) : n, { note: lengthsKnown ? `${fmtM(m)} m of pipe run` : 'runs — set the scale for lengths' });
    });
    trunks.forEach((m, colour) => add(RD, `Pipe Trunking — ${colour}`, Math.max(1, Math.ceil(m)), { note: 'metres' }));
    if (topUpKg > 0) add(RD, 'Refrigerant top-up (as specified)', Math.round(topUpKg * 100) / 100, { note: 'kg' });
    const EL = 'Electrical';
    cables.forEach(({ m, n, drawn }, cable) => {
      if (lengthsKnown) add(EL, `Power cable — ${cable}`, Math.max(1, m), { note: `approx. metres: ${fmtM(drawn)} m drawn + 20% + ${CABLE_TAILS} m terminations` });
      else add(EL, `Power cable — ${cable}`, n, { note: 'runs — set the scale for an approx. length' });
    });
    breakers.forEach((n, brk) => add(EL, `Circuit breaker — ${brk}`, n));
    if (drainRuns) add(RD, 'Condensate drain line', lengthsKnown ? Math.max(1, Math.ceil(drainM)) : drainRuns, { note: lengthsKnown ? 'metres' : 'runs — set the scale for lengths' });
    [...bySize.entries()].sort((a, b) => a[0] - b[0]).forEach(([size, { count, metres }]) => {
      if (lengthsKnown) add('Ductwork', `Flex duct R1.0 — ${sizeLabel(size)} x 6m`, Math.max(1, Math.ceil(metres / FLEX_LENGTH_M)), { swatch: sizeColor(size), note: `${fmtM(metres)} m drawn over ${count} run(s)` });
      else add('Ductwork', `Flex duct — ${sizeLabel(size)}`, count, { swatch: sizeColor(size), note: 'runs — set the scale for lengths' });
    });
    const order = [...CATALOG.map((g) => g.group), 'Ductwork', 'Refrigeration & drains', 'Electrical'];
    const list = [...groups.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([name, rows]) => ({ name, rows: [...rows.values()] }));
    const siteRows = (m) => [...m.values()].map((r) => ({ name: r.name, qty: r.qty, note: lengthsKnown && r.metres ? `${fmtM(r.metres)} m` : '' }));
    const siteGroups = [
      { name: 'Existing — stays (not ordered)', rows: siteRows(keep) },
      { name: 'Existing — strip out / remove', rows: siteRows(strip) },
    ].filter((g) => g.rows.length);
    return { groups: list, site: siteGroups, total: list.reduce((n, g) => n + g.rows.reduce((m, r) => m + r.qty, 0), 0) };
  }, [items, runs, scale, sketch, ppm]);

  const pinNo = useMemo(() => {
    const m = {};
    let n = 0;
    sketch.forEach((x) => { if (x.kind === 'pin') { n += 1; m[x.id] = n; } });
    return m;
  }, [sketch]);
  const showLoads = !!(scale || sketch.length);

  const unitKw = (it) => {
    if (it.type === 'coilsection') return sectionKw(it);
    if (it.type === 'indoor' || it.type === 'splitindoor') return parseFloat(kwShort(it.spec?.model)) || 0;
    return 0;
  };
  const unitLps = (it) => (Number(it.airflow) > 0 ? Number(it.airflow) : Math.round(unitKw(it) * LPS_PER_KW));

  // Rooms for the load estimate: zone areas if any are drawn, else sketched rooms.
  // Each carries its rectangle (world units) so the auto layout can place outlets.
  const rooms = useMemo(() => {
    const zones = items.filter((i) => i.type === 'zonearea' && !i.remove);
    if (zones.length) {
      return zones.map((z) => {
        const [w, d] = footprintMm(z);
        const area = (w * d) / 1e6;
        const b = itemBox(z, ppm);
        const calc = calcRoomLoad(z.hl, area, climate, z.room || '');
        return { id: z.id, kind: 'zone', name: `${z.spec?.zone || 'Zone'}${z.room ? ` · ${z.room}` : ''}`, zone: z.spec?.zone || 'Zone 1', type: calc.inputs.type, area, kw: calc.coolKw, heatKw: calc.heatKw, x1: z.cx - b.w / 2, y1: z.cy - b.h / 2, x2: z.cx + b.w / 2, y2: z.cy + b.h / 2 };
      });
    }
    return sketch.filter((x) => x.kind === 'room').map((r) => {
      const x1 = Math.min(r.x1, r.x2);
      const x2 = Math.max(r.x1, r.x2);
      const y1 = Math.min(r.y1, r.y2);
      const y2 = Math.max(r.y1, r.y2);
      const area = ((x2 - x1) / ppm) * ((y2 - y1) / ppm);
      const calc = calcRoomLoad(r.hl, area, climate, r.name || '');
      return { id: r.id, kind: 'room', name: r.name || 'Room', zone: r.zone || 'Zone 1', type: calc.inputs.type, area, kw: calc.coolKw, heatKw: calc.heatKw, x1, y1, x2, y2 };
    });
  }, [items, sketch, ppm, climate]);

  // Design checks: airflow, return air, pipe runs, heat load, power.
  const checks = useMemo(() => {
    const out = [];
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const isUnit = (i) => i && (i.type === 'indoor' || i.type === 'coilsection') && !i.remove;
    const lengthsKnown = !!(scale || sketch.length);
    const network = (start) => {
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const id = queue.shift();
        const next = [];
        connections.forEach((c) => {
          if (isService(c) || c.remove) return;
          if (c.from.itemId === id) next.push(c.to.itemId);
          if (c.to.itemId === id) next.push(c.from.itemId);
        });
        joins.forEach((j) => {
          if (j.a.itemId === id) next.push(j.b.itemId);
          if (j.b.itemId === id) next.push(j.a.itemId);
        });
        next.forEach((n) => {
          if (seen.has(n) || !byId[n] || byId[n].remove) return;
          seen.add(n);
          if (!(isUnit(byId[n]) && n !== start)) queue.push(n);
        });
      }
      return seen;
    };
    const ductAt = (id) => connections.find((c) => !isService(c) && (c.from.itemId === id || c.to.itemId === id));
    items.filter(isUnit).forEach((u) => {
      const name = tags[u.id];
      const lps = unitLps(u);
      const net = [...network(u.id)].map((id) => byId[id]);
      const outlets = net.filter((i) => getTool(i.type).role === 'supplyTerm');
      const grilles = net.filter((i) => i.type === 'return');
      if (!lps) {
        out.push({ level: 'info', group: 'Airflow', title: `${name}: choose the model`, detail: 'Pick the unit model (or type its rated airflow) to check outlets and return air.', itemId: u.id });
        return;
      }
      if (!outlets.length) {
        out.push({ level: 'warn', group: 'Airflow', title: `${name}: no supply outlets connected`, detail: `The unit moves about ${lps} L/s — run ducts from the plenum to the outlets.`, itemId: u.id });
      } else {
        const cap = outlets.reduce((n, o) => {
          const c = ductAt(o.id);
          const neck = o.type === 'supply' ? Number(String(o.spec?.neck || '250').match(/\d+/)?.[0]) : null;
          return n + ductLps(ductRatingMm(c) || neck || 250);
        }, 0);
        const ratio = cap / lps;
        const detail = `${outlets.length} outlet(s) take about ${cap} L/s at ${NECK_VELOCITY} m/s; the unit moves about ${lps} L/s.`;
        if (ratio < 0.85) out.push({ level: 'warn', group: 'Airflow', title: `${name}: outlets too small for the unit (${Math.round(ratio * 100)}%)`, detail: `${detail} Add an outlet or upsize branches — otherwise expect noise and high static.`, itemId: u.id });
        else if (ratio > 1.3) out.push({ level: 'warn', group: 'Airflow', title: `${name}: more outlet than the unit can fill (${Math.round(ratio * 100)}%)`, detail: `${detail} Throw will be weak — fewer or smaller outlets.`, itemId: u.id });
        else out.push({ level: 'ok', group: 'Airflow', title: `${name}: supply airflow balanced (${Math.round(ratio * 100)}%)`, detail, itemId: u.id });
      }
      if (!grilles.length) {
        out.push({ level: 'warn', group: 'Return air', title: `${name}: no return grille connected`, detail: 'Run a return duct from the R/A grille (or R/A plenum) to the unit.', itemId: u.id });
      } else {
        const cap = Math.round(grilles.reduce((n, g) => {
          const [w, d] = footprintMm(g);
          return n + (w * d) / 1e6 * RA_FREE_AREA * RA_FACE_VELOCITY * 1000;
        }, 0));
        const detail = `${grilles.length} grille(s) pass about ${cap} L/s at ${RA_FACE_VELOCITY} m/s face velocity; the unit needs about ${lps} L/s.`;
        if (cap < lps * 0.9) out.push({ level: 'warn', group: 'Return air', title: `${name}: return grille undersized`, detail: `${detail} Go up a grille size or add a second return — undersized returns whistle.`, itemId: grilles[0].id });
        else out.push({ level: 'ok', group: 'Return air', title: `${name}: return air OK`, detail, itemId: grilles[0].id });
      }
    });
    runs.forEach(({ conn, metres }) => {
      if (conn.type !== 'pipe' || conn.existing) return;
      const label = `Pipe ${[conn.from.itemId, conn.to.itemId].map((id) => tags[id]).join(' → ')}`;
      if (!lengthsKnown || metres == null) {
        out.push({ level: 'info', group: 'Refrigerant', title: `${label}: length unknown`, detail: 'Set the scale to check pipe length and extra gas.', connId: conn.id });
        return;
      }
      const pc = pipeCalc(conn, metres);
      if (pc.over) out.push({ level: 'warn', group: 'Refrigerant', title: `${label}: ${fmtM(metres)} m is over the ${pc.max} m limit`, detail: 'Move the condenser closer or check the unit’s maximum pipe length.', connId: conn.id });
      else out.push({ level: 'ok', group: 'Refrigerant', title: `${label}: ${fmtM(metres)} m — within the ${pc.max} m limit`, detail: conn.topUp ? (pc.kg ? `Top-up ${pc.kg} kg included.` : 'Top-up ticked — enter the spec’d kg.') : 'No top-up included.', connId: conn.id });
      if (conn.topUp && !pc.kg) out.push({ level: 'warn', group: 'Refrigerant', title: `${label}: enter the spec’d top-up kg`, detail: 'Top-up is ticked on this run but no kg is entered, so it won’t go on the list.', connId: conn.id });
    });
    const cap = items.filter((i) => !i.remove && (i.type === 'indoor' || i.type === 'coilsection' || i.type === 'splitindoor')).reduce((n, i) => n + unitKw(i), 0);
    const load = rooms.reduce((n, r) => n + r.kw, 0);
    if (!rooms.length) {
      out.push({ level: 'info', group: 'Heat load', title: 'No rooms to estimate', detail: 'Draw zone areas or sketch rooms to scale.' });
    } else if (cap) {
      const detail = `Estimated cooling load about ${load.toFixed(1)} kW over ${rooms.reduce((n, r) => n + r.area, 0).toFixed(0)} m²; units installed ${cap.toFixed(1)} kW.`;
      if (cap < load * 0.9) out.push({ level: 'warn', group: 'Heat load', title: `Undersized: ${cap.toFixed(1)} kW for about ${load.toFixed(1)} kW`, detail: `${detail} Go up a size or check the zoning diversity.` });
      else if (cap > load * 1.35) out.push({ level: 'warn', group: 'Heat load', title: `Oversized: ${cap.toFixed(1)} kW for about ${load.toFixed(1)} kW`, detail: `${detail} A smaller unit may run better (less short-cycling).` });
      else out.push({ level: 'ok', group: 'Heat load', title: `Capacity suits the load (${Math.round((cap / load) * 100)}%)`, detail });
    } else {
      out.push({ level: 'info', group: 'Heat load', title: `Estimated load about ${load.toFixed(1)} kW`, detail: 'Pick unit models to compare capacity.' });
    }
    items.filter((i) => i.type === 'outdoor' && !i.existing).forEach((cu) => {
      const powered = connections.some((c) => c.type === 'power' && (c.from.itemId === cu.id || c.to.itemId === cu.id));
      if (!powered) out.push({ level: 'info', group: 'Electrical', title: `${tags[cu.id]}: no power run drawn`, detail: 'Add a Switchboard and Isolator, then run cable (dark red dots) to get an approx. length.', itemId: cu.id });
    });
    sketch.forEach((r) => {
      if (r.kind !== 'smduct' || !(Number(r.ls) > 0)) return;
      const { w, h } = smDims(r);
      const rule = SM_SIZING[r.sizeBy] || SM_SIZING.standard;
      const a = smAirflow(r.ls, w, h);
      if (!a) return;
      const best = smSuggest(r.ls, r.sizeBy).find((x) => x.h === h);
      if (a.v > rule.vmax || a.pa > rule.pa * 1.15) {
        out.push({ level: 'warn', group: 'Duct sizing', title: `${w}/${h} at ${r.ls} L/s is too small — ${a.v.toFixed(1)} m/s, ${a.pa.toFixed(2)} Pa/m`, detail: best ? `Try ${best.w}/${best.h}. Tap here to select the run and resize it.` : 'Go deeper. Tap here for options.', sketchId: r.id });
      } else {
        out.push({ level: 'ok', group: 'Duct sizing', title: `${w}/${h} at ${r.ls} L/s — ${a.v.toFixed(1)} m/s, ${a.pa.toFixed(2)} Pa/m`, sketchId: r.id });
      }
    });
    return out;
  }, [items, connections, joins, runs, rooms, tags, scale, sketch]);
  const warnCount = checks.filter((c) => c.level === 'warn').length;

  // Pipe run length limit and the (optional) spec'd refrigerant top-up.
  function pipeCalc(conn, metres) {
    const unit = [conn.from.itemId, conn.to.itemId].map((id) => items.find((i) => i.id === id)).find((i) => i && i.type !== 'outdoor');
    const max = conn.maxLen != null ? Number(conn.maxLen) : unit?.type === 'splitindoor' ? 25 : 50;
    const kg = conn.topUp && Number(conn.topUpKg) > 0 ? Number(conn.topUpKg) : null;
    return { max, kg, over: metres != null && metres > max };
  }

  // Ticking top-up asks for the kg from the unit's spec.
  function toggleTopUp(on) {
    if (!on) { updateSelectedConnection({ topUp: false }); return; }
    const answer = window.prompt('Refrigerant top-up for this run — spec’d kg (from the unit manual)', selectedConn?.topUpKg != null ? String(selectedConn.topUpKg) : '');
    const kg = Number(String(answer ?? '').replace(',', '.'));
    updateSelectedConnection({ topUp: true, topUpKg: answer != null && kg > 0 ? kg : selectedConn?.topUpKg });
  }

  // Pair coil for a pipe run: manual pick, else from the indoor unit's model.
  function pipeCoil(conn) {
    if (conn.coil != null && conn.coil !== 'auto') return { idx: Number(conn.coil), auto: false };
    const unit = [conn.from.itemId, conn.to.itemId].map((id) => items.find((i) => i.id === id)).find((i) => i && (i.type === 'indoor' || i.type === 'splitindoor' || i.type === 'coilsection'));
    const idx = !unit ? undefined : unit.type === 'coilsection' ? actronPair(unit.spec?.model)?.pipe : UNIT_COIL[unit.spec?.model];
    return { idx: idx ?? null, auto: true };
  }

  function equipmentText() {
    return [...equipment.groups, ...equipment.site]
      .flatMap((g) => [g.name.toUpperCase(), ...g.rows.map((r) => `${r.qty} x ${r.name}${r.note ? ` (${r.note})` : ''}`), ''])
      .join('\n');
  }

  async function copyEquipment() {
    try {
      await navigator.clipboard.writeText(`${page.Name}\n\n${equipmentText()}`);
      toast.success('Equipment list copied');
    } catch {
      toast.error('Couldn’t copy — use the CSV download instead.');
    }
  }

  function downloadEquipment() {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [['Group', 'Qty', 'Item', 'Note'], ...[...equipment.groups, ...equipment.site].flatMap((g) => g.rows.map((r) => [g.name, r.qty, r.name, r.note || '']))];
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${page.Name || 'drawing'} - equipment list.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // ---- Duct re-routing: slide a straight section sideways; the run stays square ----
  function startSegDrag(event, run, seg) {
    if (fingerOnly(event)) return; // pen mode: fingers pan
    event.stopPropagation();
    const all = run.pts.map((q) => ({ x: q.x, y: q.y }));
    let { i } = seg;
    // A section that ends at a fitting can't slide on its own: add a bend there so
    // the section moves and the duct still leaves the fitting square.
    if (i === 1) { all.splice(1, 0, { ...all[0] }); i = 2; }
    if (i === all.length - 1) all.splice(all.length - 1, 0, { ...all[all.length - 1] });
    const interior = all.slice(1, -1);
    const p = toWorld(event.clientX, event.clientY);
    dragRef.current = { kind: 'seg', connId: run.conn.id, i, horizontal: seg.horizontal, interior, px: p.x, py: p.y, sx: event.clientX, sy: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function toWorld(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.z, y: (clientY - rect.top - v.y) / v.z };
  }

  // Insert a reducer: split the run at a distance from its start; the rest of the run takes the new size.
  function addReducer(run) {
    const at = Number(redForm.at);
    const w = Number(redForm.w);
    const h = Number(redForm.h);
    if (!scale) { toast.error('Set the scale first so the distance is in real metres.'); return; }
    if (!(at > 0) || !(w >= 50) || !(h >= 50)) { toast.error('Enter the distance from the start (m) and the new width and height (mm).'); return; }
    const newId = crypto.randomUUID();
    const res = smSplit(sketch, items, run.id, at * ppm, { w, h, trKind: redForm.kind }, smCtx, newId);
    if (!res) { toast.error('That distance is off the run — pick a point between the two ends.'); return; }
    setSketch(res.sketch);
    setItems(res.items);
    setSelectedSketchId(newId);
    markDirty();
    toast.message(`Reducer added — ${smDims(run).w}/${smDims(run).h} to ${w}/${h}`);
  }

  function markDirty(msg = 'Unsaved changes') {
    dirtyRef.current = true;
    setStatus(msg);
  }

  function boxesExcept(list, excludeIds) {
    return list.filter((i) => !excludeIds.includes(i.id) && i.type !== 'zonearea').map((i) => ({ cx: i.cx, cy: i.cy, ...itemBox(i, ppm) }));
  }

  // Add a part at a world point (drop / right-click) or the centre of the view.
  function addItem(type, at = null) {
    const el = canvasRef.current;
    const v = viewRef.current;
    const cx = at ? at.x : el ? (el.clientWidth / 2 - v.x) / v.z : WORLD_W / 2;
    const cy = at ? at.y : el ? (el.clientHeight / 2 - v.y) / v.z : WORLD_H / 2;
    const draft = { id: crypto.randomUUID(), type, cx, cy, rot: 0, spec: defaultSpec(getTool(type)) };
    if (type === 'zonearea') {
      // Automatically take the next zone that isn't coloured yet.
      const used = items.filter((i) => i.type === 'zonearea').map((i) => i.spec?.zone);
      draft.spec.zone = ZONE_NAMES.find((z) => !used.includes(z)) || ZONE_NAMES[0];
    }
    const b = itemBox(draft, ppm);
    const spot = type === 'zonearea' ? { x: cx, y: cy } : findFreeCenter(cx, cy, b.w, b.h, boxesExcept(items, []), at ? 0 : 10);
    const next = { ...draft, cx: spot.x, cy: spot.y };
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
    setSelectedConnId(null);
    setPendingPort(null);
    markDirty();
    if (type === 'zone' && at) cutIn(next);
  }

  // Auto cut-in: a free zone motor dropped on a supply run splits the run through
  // itself — turned in line, sized to the duct, both halves reconnected.
  function cutIn(zone) {
    if (zone.type !== 'zone') return false;
    if (connections.some((c) => c.from.itemId === zone.id || c.to.itemId === zone.id)) return false;
    if (joins.some((j) => j.a.itemId === zone.id || j.b.itemId === zone.id)) return false;
    let best = null;
    runs.forEach((r) => {
      if (!r || isService(r.conn) || r.conn.type === 'return') return;
      const w = clamp(((r.conn.size || getDuct(r.conn.type).defaultSize) / 1000) * ppm, 5, 40);
      for (let i = 1; i < r.pts.length; i += 1) {
        const p0 = r.pts[i - 1];
        const p1 = r.pts[i];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) continue;
        const t = clamp(((zone.cx - p0.x) * dx + (zone.cy - p0.y) * dy) / len2, 0, 1);
        const qx = p0.x + t * dx;
        const qy = p0.y + t * dy;
        const dist = Math.hypot(zone.cx - qx, zone.cy - qy);
        if (dist <= w / 2 + 14 && (!best || dist < best.dist)) best = { r, i, qx, qy, dist, horiz: Math.abs(dx) >= Math.abs(dy), len: Math.sqrt(len2) };
      }
    });
    if (!best) return false;
    const { r, i } = best;
    const box = itemBox(zone, ppm);
    const half = Math.max(box.w, box.h) / 2 + 4;
    if (best.len < half * 2) {
      toast.message('That straight is too short for a zone motor — drop it on a longer section.');
      return false;
    }
    const p0 = r.pts[i - 1];
    const p1 = r.pts[i];
    const ux = (p1.x - p0.x) / best.len;
    const uy = (p1.y - p0.y) / best.len;
    const along = clamp((best.qx - p0.x) * ux + (best.qy - p0.y) * uy, half, best.len - half);
    const size = r.conn.size || getDuct(r.conn.type).defaultSize;
    const zSize = ZONE_SIZES.find((s) => s.includes(`(${size}mm)`));
    const placed = { ...zone, cx: p0.x + ux * along, cy: p0.y + uy * along, rot: best.horiz ? 0 : 90, spec: { ...zone.spec, ...(zSize ? { size: zSize } : {}) } };
    const pw = portInfo(placed, 'w', ppm);
    const pe = portInfo(placed, 'e', ppm);
    const up = Math.hypot(pw.x - p0.x, pw.y - p0.y) <= Math.hypot(pe.x - p0.x, pe.y - p0.y) ? 'w' : 'e';
    const down = up === 'w' ? 'e' : 'w';
    const keep = r.conn.bends?.length > 0;
    const bendsA = keep ? r.pts.slice(1, i).map((q) => ({ x: q.x, y: q.y })) : [];
    const bendsB = keep ? r.pts.slice(i, -1).map((q) => ({ x: q.x, y: q.y })) : [];
    const first = { ...r.conn, id: crypto.randomUUID(), to: { itemId: zone.id, portId: up }, bends: bendsA.length ? bendsA : undefined };
    const second = { ...r.conn, id: crypto.randomUUID(), from: { itemId: zone.id, portId: down }, bends: bendsB.length ? bendsB : undefined };
    setItems((current) => current.map((it) => (it.id === zone.id ? placed : it)));
    setConnections((current) => current.flatMap((c) => (c.id === r.conn.id ? [first, second] : [c])));
    setSelectedConnId(null);
    setSelectedId(zone.id);
    markDirty();
    toast.success(`${tags[zone.id] || 'Zone motor'} cut into the run`, { description: zSize ? `Sized ${zSize} to suit the duct.` : `No ${sizeLabel(size)} zone motor in the list — check the size.` });
    return true;
  }

  function updateItem(id, patch) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    markDirty();
  }

  // Rotate the selected icon (and anything joined to it) 90° clockwise.
  function rotateSelected() {
    if (!selected) return;
    const group = groupOf(selected.id);
    const pivot = { x: selected.cx, y: selected.cy };
    setItems((current) => current.map((item) => {
      if (!group.includes(item.id)) return item;
      const dx = item.cx - pivot.x;
      const dy = item.cy - pivot.y;
      return { ...item, cx: pivot.x - dy, cy: pivot.y + dx, rot: ((item.rot || 0) + 90) % 360, label: item.label ? { dx: -item.label.dy, dy: item.label.dx } : undefined };
    }));
    markDirty();
  }

  // Rough outdoor footprint from the system's kW rating (edit to the spec sheet).
  function outdoorBodyForKw(kw) {
    if (!kw) return OUTDOOR_BODIES[1];
    if (kw <= 6) return OUTDOOR_BODIES[0];
    if (kw <= 9.5) return OUTDOOR_BODIES[1];
    if (kw <= 16) return OUTDOOR_BODIES[2];
    return OUTDOOR_BODIES[3];
  }

  // Link a condenser to an FCU's model: re-use the given / already-paired / an
  // unpaired condenser, or add a new one beside the FCU.
  function pairOutdoor(fcu, model, target = null) {
    const codes = modelCodes(model);
    const body = outdoorBodyForKw(parseFloat(kwShort(model)) || 0);
    const existing = target
      || items.find((i) => i.type === 'outdoor' && i.pairedWith === fcu.id)
      || items.find((i) => i.type === 'outdoor' && !i.pairedWith);
    const patch = {
      pairedWith: fcu.id,
      outdoorModel: codes.outdoor || '',
      suits: codes.indoor || '',
      spec: { ...(existing?.spec || {}), body: body.label },
      dims: { w: body.w, d: body.d },
    };
    const described = codes.outdoor ? `Outdoor unit ${codes.outdoor}` : `Outdoor unit to suit ${codes.indoor || model} — type its model number if you want it on the plan.`;
    if (existing) {
      setItems((current) => current.map((i) => (i.id === existing.id ? { ...i, ...patch } : i)));
      toast.message(`${tags[existing.id] || 'Condenser'} paired with ${tags[fcu.id]}`, { description: described });
    } else {
      const draft = { id: crypto.randomUUID(), type: 'outdoor', cx: fcu.cx, cy: fcu.cy, rot: 0, ...patch };
      const b = itemBox(draft, ppm);
      const fb = itemBox(fcu, ppm);
      const spot = findFreeCenter(fcu.cx + fb.w / 2 + b.w / 2 + 40, fcu.cy, b.w, b.h, boxesExcept(items, []), 10);
      setItems((current) => [...current, { ...draft, cx: spot.x, cy: spot.y }]);
      toast.message(`Outdoor unit added for ${tags[fcu.id]}`, { description: `${described} Drag it to where the condenser goes.` });
    }
    markDirty();
  }

  // Swap an FCU for an ActronAir two-piece: fan section, duct plate on its outlet,
  // duct plate on the coil inlet, coil section, and a duct from plate to plate on
  // each spigot. Existing ducts, joins, pipes and the condenser move across.
  function expandTwoPiece(fcu, model) {
    const p = actronPair(model);
    if (!p) return;
    const big = /PLDT|210|240/.test(p.coilCode);
    const plateA = { id: crypto.randomUUID(), type: 'ductplate', rot: 0, spec: { size: big ? DUCT_PLATES[2] : DUCT_PLATES[0] } };
    const plateB = { id: crypto.randomUUID(), type: 'ductplate', rot: 180, spec: { size: big ? DUCT_PLATES[2] : DUCT_PLATES[1] } };
    const fan = { id: crypto.randomUUID(), type: 'fansection', rot: 0, spec: { model } };
    const coil = { id: crypto.randomUUID(), type: 'coilsection', rot: 0, spec: { model }, existing: fcu.existing, remove: fcu.remove };
    fan.existing = fcu.existing; fan.remove = fcu.remove;
    const hOf = (it) => (footprintMm(it)[1] / 1000) * ppm;
    const gap = 1.5 * ppm; // flex between the plates (Actron allows 0–6 m)
    const stack = [[fan, hOf(fan)], [plateA, hOf(plateA)], [null, gap], [plateB, hOf(plateB)], [coil, hOf(coil)]];
    const total = stack.reduce((n, [, h]) => n + h, 0);
    // Lay out top-to-bottom in the FCU's own frame, then turn with the FCU.
    const r = (((fcu.rot || 0) % 360) + 360) % 360;
    const turn = (dx, dy) => (r === 90 ? [-dy, dx] : r === 180 ? [-dx, -dy] : r === 270 ? [dy, -dx] : [dx, dy]);
    let y = -total / 2;
    const placed = [];
    stack.forEach(([it, h]) => {
      if (it) {
        const [dx, dy] = turn(0, y + h / 2);
        placed.push({ ...it, cx: fcu.cx + dx, cy: fcu.cy + dy, rot: ((it.rot || 0) + r) % 360 });
      }
      y += h;
    });
    const byId = Object.fromEntries(placed.map((it) => [it.id, it]));
    const newJoins = [
      { id: crypto.randomUUID(), a: { itemId: fan.id, portId: 'out' }, b: { itemId: plateA.id, portId: 'in' } },
      { id: crypto.randomUUID(), a: { itemId: coil.id, portId: 'in' }, b: { itemId: plateB.id, portId: 'in' } },
    ];
    const n = spigotCount(plateA.spec.size, 2);
    const dia = inchesInText(plateA.spec.size) || 400;
    const links = Array.from({ length: n }, (_, i) => ({
      id: crypto.randomUUID(), type: 'supply', size: dia, existing: fcu.existing, remove: fcu.remove,
      from: { itemId: plateA.id, portId: `sa${i + 1}` }, to: { itemId: plateB.id, portId: `sa${n - i}` },
    }));
    // Move what was attached to the FCU: R/A side -> fan, S/A side and services -> coil.
    const target = (portId) => (portId === 'ra' ? { itemId: fan.id, portId: 'ra' } : { itemId: coil.id, portId: portId === 'sa' ? 'sa' : portId });
    const keptJoins = joins.filter((j) => j.a.itemId !== fcu.id && j.b.itemId !== fcu.id);
    const shifts = {};
    const movedJoins = joins.filter((j) => j.a.itemId === fcu.id || j.b.itemId === fcu.id).map((j) => {
      const mine = j.a.itemId === fcu.id ? j.a : j.b;
      const other = j.a.itemId === fcu.id ? j.b : j.a;
      const to = target(mine.portId);
      const oldP = portInfo(fcu, mine.portId, ppm);
      const newP = portInfo(byId[to.itemId], to.portId, ppm);
      groupOf(other.itemId, keptJoins).forEach((id) => { shifts[id] = { dx: newP.x - oldP.x, dy: newP.y - oldP.y }; });
      return { id: j.id, a: to, b: other };
    });
    setItems((current) => [
      ...current.filter((i) => i.id !== fcu.id).map((i) => {
        const sh = shifts[i.id];
        const moved = sh ? { ...i, cx: i.cx + sh.dx, cy: i.cy + sh.dy } : i;
        return moved.type === 'outdoor' && moved.pairedWith === fcu.id ? { ...moved, pairedWith: coil.id, outdoorModel: p.outdoor.split(' / ')[0], suits: p.coilCode } : moved;
      }),
      ...placed,
    ]);
    setJoins([...keptJoins, ...movedJoins, ...newJoins]);
    setConnections((current) => [
      ...current.map((c) => ({
        ...c,
        from: c.from.itemId === fcu.id ? target(c.from.portId) : c.from,
        to: c.to.itemId === fcu.id ? target(c.to.portId) : c.to,
        bends: c.from.itemId === fcu.id || c.to.itemId === fcu.id ? undefined : c.bends,
      })),
      ...links,
    ]);
    if (!items.some((i) => i.type === 'outdoor' && i.pairedWith === fcu.id)) {
      const spare = items.find((i) => i.type === 'outdoor' && !i.pairedWith);
      const body = outdoorBodyForKw(actronKw(p));
      const patch = { pairedWith: coil.id, outdoorModel: p.outdoor.split(' / ')[0], suits: p.coilCode, spec: { body: body.label }, dims: { w: body.w, d: body.d } };
      if (spare) {
        setItems((current) => current.map((i) => (i.id === spare.id ? { ...i, ...patch } : i)));
      } else {
        const b = { w: (body.w / 1000) * ppm, h: (body.d / 1000) * ppm };
        const spot = findFreeCenter(fcu.cx + (total / 2) + b.w, fcu.cy, b.w, b.h, boxesExcept(items, [fcu.id]), 10);
        setItems((current) => [...current, { id: crypto.randomUUID(), type: 'outdoor', cx: spot.x, cy: spot.y, rot: 0, ...patch }]);
      }
    }
    setSelectedId(coil.id);
    setSelectedConnId(null);
    markDirty();
    toast.success(`ActronAir 2-piece placed — ${p.coilCode} / ${p.fanCode}`, { description: `Fan section and coil section with ${n} x ${dia}mm duct plates, joined plate to plate. Drag the coil section to set the gap (0–6 m). Outdoor ${p.outdoor}.` });
  }

  function unjoinSelected() {
    if (!selected) return;
    setJoins((current) => current.filter((j) => j.a.itemId !== selected.id && j.b.itemId !== selected.id));
    markDirty();
    toast.message(`${tags[selected.id]} unjoined — it now moves on its own.`);
  }

  function updateSelectedSpec(key, value) {
    if (!selected) return;
    if (selected.type === 'indoor' && key === 'model' && String(value).startsWith(ACTRON_2PC_PREFIX)) {
      expandTwoPiece(selected, value.slice(ACTRON_2PC_PREFIX.length));
      return;
    }
    const tool = getTool(selected.type);
    setItems((current) => current.map((item) => {
      if (item.id !== selected.id) return item;
      const spec = { ...(item.spec || {}), [key]: value };
      const next = { ...item, spec };
      (tool.specs || []).forEach((f) => {
        if (f.dependsOn === key && !specOptions(tool, f, next).includes(getSpec(next, f))) spec[f.key] = 'None';
      });
      // Picking a unit model / body resets the footprint to that series' size.
      if (item.type === 'indoor' && key === 'model') { const p = indoorPreset(value); next.dims = { w: p.w, d: p.d }; }
      if (SECTION_TYPES.has(item.type) && key === 'model') next.dims = undefined;
      if (item.type === 'outdoor' && key === 'body') next.dimsFromBody = true;
      if (item.type === 'outdoor' && key === 'body') { const b = OUTDOOR_BODIES.find((o) => o.label === value) || OUTDOOR_BODIES[1]; next.dims = { w: b.w, d: b.d }; }
      return next;
    }));
    markDirty();
    if ((selected.type === 'indoor' || selected.type === 'splitindoor') && key === 'model' && value !== CHOOSE_MODEL) pairOutdoor(selected, value);
    // Keep a two-piece system matched: the joined / ducted partner section follows.
    if (SECTION_TYPES.has(selected.type) && key === 'model') {
      const linked = new Set(groupOf(selected.id));
      connections.forEach((c) => {
        if (c.from.itemId === selected.id) linked.add(c.to.itemId);
        if (c.to.itemId === selected.id) linked.add(c.from.itemId);
      });
      setItems((current) => current.map((i) => (i.id !== selected.id && linked.has(i.id) && SECTION_TYPES.has(i.type) ? { ...i, spec: { ...i.spec, model: value }, dims: undefined } : i)));
    }
  }

  function updateSelectedDims(which, value) {
    if (!selected) return;
    const [w, d] = footprintMm(selected);
    const n = Math.max(50, Math.min(5000, Number(value) || 0));
    updateItem(selected.id, { dims: which === 'w' ? { w: n, d } : { w, d: n } });
  }

  function deleteSelectedItem() {
    if (!selected) return;
    setItems((current) => current.filter((item) => item.id !== selected.id));
    setConnections((current) => current.filter((conn) => conn.from.itemId !== selected.id && conn.to.itemId !== selected.id));
    setJoins((current) => current.filter((j) => j.a.itemId !== selected.id && j.b.itemId !== selected.id));
    if (selected.type === 'indoor' || selected.type === 'splitindoor') {
      setItems((current) => current.map((i) => (i.pairedWith === selected.id ? { ...i, pairedWith: undefined, suits: '' } : i)));
    }
    setSelectedId(null);
    setPendingPort(null);
    markDirty();
  }

  function deleteSelectedConnection() {
    if (!selectedConn) return;
    setConnections((current) => current.filter((conn) => conn.id !== selectedConn.id));
    setSelectedConnId(null);
    markDirty();
  }

  function updateSelectedConnection(patch) {
    if (!selectedConn) return;
    if (patch.type) {
      const a = items.find((item) => item.id === selectedConn.from.itemId);
      const b = items.find((item) => item.id === selectedConn.to.itemId);
      if (a && b) {
        const res = resolveDuct(patch.type, a, b, portInfo(a, selectedConn.from.portId, ppm), portInfo(b, selectedConn.to.portId, ppm));
        if (res.error) { toast.error(res.error); return; }
        if (res.type !== patch.type) { toast.error(`That run can only be ${getDuct(res.type).label.toLowerCase()} or flex.`); return; }
      }
    }
    setConnections((current) => current.map((conn) => conn.id === selectedConn.id ? { ...conn, ...patch } : conn));
    markDirty();
  }

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === 's') { event.preventDefault(); save(); return; }
      if (ctrl && key === 'z') { event.preventDefault(); undo(event.shiftKey ? 1 : -1); return; }
      if (ctrl && key === 'y') { event.preventDefault(); undo(1); return; }
      if (ctrl && key === 'c') { if (selected) { clipRef.current = selected; toast.message(`${tags[selected.id]} copied`); } return; }
      if (ctrl && key === 'v') { if (clipRef.current) { event.preventDefault(); pasteItem(clipRef.current); } return; }
      if (ctrl && key === 'd') { event.preventDefault(); if (selected) pasteItem(selected); return; }
      if (ctrl && key === 'p') { event.preventDefault(); setPrintDialog(true); return; }
      if (ctrl && event.shiftKey && key === 'e') { event.preventDefault(); exportDxf(); return; }
      if (ctrl) return;
      const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (nudge && selected) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const group = groupOf(selected.id);
        setItems((current) => current.map((i) => (group.includes(i.id) ? { ...i, cx: i.cx + nudge[0] * step, cy: i.cy + nudge[1] * step } : i)));
        markDirty();
        return;
      }
      if (event.key === '1') { setDuctType('supply'); toast.message('Drawing supply duct'); return; }
      if (event.key === '2') { setDuctType('return'); toast.message('Drawing return duct'); return; }
      if (event.key === '3') { setDuctType('flex'); toast.message('Drawing flex duct'); return; }
      if (event.key === '4') { setDuctType('exhaust'); toast.message('Drawing exhaust duct'); return; }
      if (event.key === '5') { setDuctType('oa'); toast.message('Drawing outside air duct'); return; }
      if (key === 'l') { setShowLabels((s) => !s); return; }
      if (event.key === '?') { setShowKeys((s) => !s); return; }
      if (key === 'w') { setSketchTool('wall'); return; }
      if (key === 'b') { setSketchTool('room'); return; }
      if (key === 't') { setSketchTool('text'); return; }
      if (key === 'd') { setSketchTool('smduct'); return; }
      if (key === 'a') { setSketchTool('callout'); return; }
      if (key === 'm') { setSketchTool('measure'); return; }
      if (key === 'n') { setSketchTool('pin'); return; }
      if (key === 'v') { setSketchTool(null); setPendingPort(null); setSketchDraft(null); return; }
      if (key === 'k') { startScale(); return; }
      if (key === 'o') { fileRef.current?.click(); return; }
      if (key === 'h') { setCompact((c) => !c); return; }
      if (key === 'g') { setDuctMaterial((m) => (m === 'sheet' ? 'flex' : 'sheet')); toast.message('Toggled flex / sheet metal for new runs'); return; }
      if (key === 'x') { addTransitionToRun(selectedSketch?.kind === 'smduct' ? selectedSketch : (sketch.find((x) => x.id === selected?.onRun?.id && x.kind === 'smduct') || null)); return; }
      if (key === 'e') { toggleCaps(selectedSketch?.kind === 'smduct' ? selectedSketch : sketch.find((x) => x.id === selected?.onRun?.id)); return; }
      if (key === 'c' && selected?.type === 'exhfan' && selected.onRun) { updateItem(selected.id, { canvas: selected.canvas === false }); return; }
      if (key === 'p') { setPenMode((v) => !v); return; }
      if (event.key === 'r' || event.key === 'R') rotateSelected();
      else if (event.key === '+' || event.key === '=') zoomCentre(1.25);
      else if (event.key === '-' || event.key === '_') zoomCentre(1 / 1.25);
      else if (event.key === '0') fitView();
      else if (event.key === 'f' || event.key === 'F') focusSelected();
      else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected) deleteSelectedItem();
        else if (selectedConn) deleteSelectedConnection();
        else if (selectedSketchId) deleteSketch();
      } else if (event.key === 'Escape') {
        setPendingPort(null);
        setScaleDraft(null);
        setCtxMenu(null);
        setShowKeys(false);
        setWire(null);
        setSketchTool(null);
        setSketchDraft(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function loadPlan(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await loadPlanFile(file);
  }

  async function loadPlanFile(file) {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      setStatus('Use a JPG, PNG, phone photo, or PDF plan.');
      return;
    }
    setPlanBusy(true);
    setStatus(isPdf ? 'Rendering PDF page 1…' : 'Preparing plan…');
    let blob;
    let note = '';
    try {
      if (isPdf) {
        const res = await pdfFileToJpeg(file);
        blob = res.blob;
        note = ` (PDF page 1 of ${res.pages})`;
      } else {
        blob = await imageFileToJpeg(file);
      }
    } catch (err) {
      const msg = err?.message || 'unknown error';
      setStatus(`Could not read plan: ${msg}`);
      toast.error('Plan could not be read', { description: msg });
      setPlanBusy(false);
      return;
    }
    setBackground(URL.createObjectURL(blob));
    fitView();
    setStatus('Saving plan…');
    try {
      const uploaded = await sdk.storage.upload(new File([blob], 'plan.jpg', { type: 'image/jpeg' }));
      if (!uploaded) throw new Error('No file returned');
      setPlanFile([{ ...uploaded, size: uploaded.size || blob.size, name: uploaded.name || 'plan.jpg', type: uploaded.type || 'image/jpeg' }]);
      dirtyRef.current = true;
      setStatus(`Plan loaded${note} · saved automatically · now set the scale`);
    } catch (err) {
      setPlanFile([]);
      setStatus(`Could not store plan: ${err?.message || 'unknown error'} · it will be lost on reload`);
      toast.error('Plan could not be stored', { description: `${err?.message || 'unknown error'} — try loading the plan again before you save.` });
    } finally {
      setPlanBusy(false);
    }
    if (!scale) toast.message('Plan loaded', { description: 'Tap “Set scale” and mark a known dimension so units draw to size and ducts are measured.' });
  }

  // ---- Scale calibration ----
  function startScale() {
    setScaleDraft({ a: null, b: null, mm: '' });
    setSelectedId(null);
    setSelectedConnId(null);
    setPendingPort(null);
  }

  function addScalePoint(p) {
    setScaleDraft((d) => {
      if (!d) return d;
      if (!d.a) return { ...d, a: p };
      if (!d.b) return { ...d, b: p };
      return d;
    });
  }

  function applyScale(event) {
    event?.preventDefault();
    if (!scaleDraft?.a || !scaleDraft?.b) return;
    const mm = Number(scaleDraft.mm);
    const dist = Math.hypot(scaleDraft.b.x - scaleDraft.a.x, scaleDraft.b.y - scaleDraft.a.y);
    if (!mm || mm <= 0) { toast.error('Enter the real length in millimetres.'); return; }
    if (dist < 10) { toast.error('Those two points are too close together — pick a longer dimension.'); return; }
    const pxPerM = dist / (mm / 1000);
    setScale({ pxPerM, a: scaleDraft.a, b: scaleDraft.b, mm });
    setScaleDraft(null);
    markDirty('Scale set · unsaved changes');
    const sheetM = WORLD_W / pxPerM;
    if (sheetM > 120 || sheetM < 2) {
      toast.warning('That scale looks wrong', { description: `It makes the whole sheet ${Math.round(sheetM)} m wide, so ducts will draw ${sheetM > 120 ? 'as thin lines' : 'huge'}. Check the length is in millimetres (e.g. 3600 for 3.6 m) and that both clicks sit on the ends of the same dimension. Press K to set it again.`, duration: 15000 });
    } else {
      toast.success('Scale set', { description: `${mm.toLocaleString()} mm reference applied. Units now draw to size and duct lengths are measured.` });
    }
  }

  // ---- Pointer handling ----
  function startItemDrag(event, item) {
    if (fingerOnly(event)) return; // pen mode: fingers pan
    if (scaleDraft) return;
    event.stopPropagation();
    const p = toWorld(event.clientX, event.clientY);
    if (sketchTool === 'smduct') {
      // SM duct tool on: pressing a free duct connection of this part (e.g. a transition outlet) starts a run;
      // pressing the part itself moves it, the same as in Select.
      const hit = smFindSnap(p, SM_SNAP_PX / (viewRef.current?.z || 1), smCtx);
      if (hit?.kind === 'port' && hit.itemId === item.id) {
        event.preventDefault();
        startSketch(event);
        return;
      }
    }
    const group = groupOf(item.id);
    const starts = {};
    items.forEach((i) => { if (group.includes(i.id)) starts[i.id] = { cx: i.cx, cy: i.cy }; });
    dragRef.current = { kind: 'item', id: item.id, group, starts, px: p.x, py: p.y, sx: event.clientX, sy: event.clientY, moved: false };
    setSelectedId(item.id);
    setSelectedConnId(null);
    setPendingPort(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startLabelDrag(event, item) {
    if (fingerOnly(event)) return; // pen mode: fingers pan
    if (scaleDraft) return;
    event.stopPropagation();
    const p = toWorld(event.clientX, event.clientY);
    const off = labelOffset(item, itemBox(item, ppm));
    dragRef.current = { kind: 'label', id: item.id, px: p.x, py: p.y, ox: off.dx, oy: off.dy, sx: event.clientX, sy: event.clientY, moved: false };
    setSelectedId(item.id);
    setSelectedConnId(null);
    setPendingPort(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag.moved && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < 3) return;
    drag.moved = true;
    const p = toWorld(event.clientX, event.clientY);
    if (drag.kind === 'sketch') {
      let x2 = skSnap(p.x);
      let y2 = skSnap(p.y);
      if (drag.tool === 'wall' && !event.shiftKey) {
        if (Math.abs(x2 - drag.x1) >= Math.abs(y2 - drag.y1)) y2 = drag.y1;
        else x2 = drag.x1;
      }
      if (drag.tool === 'smduct') {
        const selfId = drag.startTarget?.kind === 'end' ? drag.startTarget.id : null;
        const hit = smFindSnap(p, SM_SNAP_PX / (viewRef.current?.z || 1), smCtx, selfId);
        drag.endTarget = hit && Math.hypot(hit.x - drag.x1, hit.y - drag.y1) > 4 ? hit : null;
        if (drag.endTarget) {
          x2 = drag.endTarget.x;
          y2 = drag.endTarget.y;
        } else if (!event.shiftKey) {
          // Sheet metal runs snap to 0 / 45 / 90° so bends come out as standard 45s and 90s.
          const len = Math.hypot(p.x - drag.x1, p.y - drag.y1);
          const ang = Math.round(Math.atan2(p.y - drag.y1, p.x - drag.x1) / (Math.PI / 4)) * (Math.PI / 4);
          const g = (ppm * 50) / 1000;
          const l = Math.round(len / g) * g;
          x2 = drag.x1 + Math.cos(ang) * l;
          y2 = drag.y1 + Math.sin(ang) * l;
        }
      }
      setSketchDraft({ kind: drag.tool, x1: drag.x1, y1: drag.y1, x2, y2, snapA: drag.startTarget, snapB: drag.endTarget });
      return;
    }
    if (drag.kind === 'smpoint') {
      const run = sketch.find((x) => x.id === drag.id);
      if (!run) return;
      let x = skSnap(p.x);
      let y = skSnap(p.y);
      drag.target = null;
      if (drag.end) {
        const hit = smFindSnap(p, SM_SNAP_PX / (viewRef.current?.z || 1), smCtx, run.id);
        if (hit) { x = hit.x; y = hit.y; drag.target = hit; }
      }
      const nb = run.pts[drag.idx === 0 ? 1 : drag.idx - 1];
      if (!drag.target && nb && !event.shiftKey) {
        // Keep the segment to the neighbour at 0 / 45 / 90°.
        const len = Math.hypot(p.x - nb.x, p.y - nb.y);
        const ang = Math.round(Math.atan2(p.y - nb.y, p.x - nb.x) / (Math.PI / 4)) * (Math.PI / 4);
        const g = (ppm * 50) / 1000;
        const l = Math.round(len / g) * g;
        x = nb.x + Math.cos(ang) * l;
        y = nb.y + Math.sin(ang) * l;
      }
      setSketch((current) => current.map((r) => (r.id === drag.id ? { ...r, pts: r.pts.map((q, i) => (i === drag.idx ? { x, y } : q)) } : r)));
      markDirty();
      return;
    }
    if (drag.kind === 'sketchmove') {
      const dx = skSnap(p.x - drag.px);
      const dy = skSnap(p.y - drag.py);
      const o = drag.orig;
      setSketch((current) => current.map((s) => (s.id === drag.id ? { ...s, x1: o.x1 + dx, y1: o.y1 + dy, ...(o.x2 != null ? { x2: o.x2 + dx, y2: o.y2 + dy } : {}), ...(o.pts ? { pts: o.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : {}) } : s)));
      if (drag.riders?.length) {
        // Dampers, fans and spigots fitted to the run travel with it.
        const at = new Map(drag.riders.map((r) => [r.id, r]));
        setItems((current) => current.map((i) => (at.has(i.id) ? { ...i, cx: at.get(i.id).cx + dx, cy: at.get(i.id).cy + dy } : i)));
      }
      markDirty();
      return;
    }
    if (drag.kind === 'resize') {
      const w = Math.max(MIN_PX, p.x - drag.left);
      const h = Math.max(MIN_PX, p.y - drag.top);
      const toMm = (v) => Math.round((v / ppm) * 1000);
      const dims = drag.turned ? { w: toMm(h), d: toMm(w) } : { w: toMm(w), d: toMm(h) };
      setItems((current) => current.map((i) => (i.id === drag.id ? { ...i, cx: drag.left + w / 2, cy: drag.top + h / 2, dims } : i)));
      markDirty();
      return;
    }
    if (drag.kind === 'wire') {
      const from = items.find((i) => i.id === drag.itemId);
      const target = nearestPort(p, drag.itemId);
      drag.target = target;
      if (from) {
        const s = portPosition(from, drag.portId, ppm);
        setWire({ x1: s.x, y1: s.y, x2: target ? target.x : p.x, y2: target ? target.y : p.y, snapped: !!target });
      }
      return;
    }
    if (drag.kind === 'item') {
      const dx = snap(p.x - drag.px);
      const dy = snap(p.y - drag.py);
      setItems((current) => current.map((item) => {
        const s = drag.starts[item.id];
        if (!s) return item;
        return { ...item, cx: clamp(s.cx + dx, 0, WORLD_W), cy: clamp(s.cy + dy, 0, WORLD_H) };
      }));
    } else {
      if (drag.kind === 'seg') {
        const pts = drag.interior.map((q) => ({ ...q }));
        const j0 = drag.i - 2;
        const j1 = drag.i - 1;
        if (drag.horizontal) {
          const y = snap(pts[j0].y + (p.y - drag.py));
          pts[j0].y = y;
          pts[j1].y = y;
        } else {
          const x = snap(pts[j0].x + (p.x - drag.px));
          pts[j0].x = x;
          pts[j1].x = x;
        }
        setConnections((current) => current.map((c) => (c.id === drag.connId ? { ...c, bends: pts } : c)));
        markDirty();
        return;
      }
      const label = { dx: drag.ox + (p.x - drag.px), dy: drag.oy + (p.y - drag.py) };
      setItems((current) => current.map((item) => item.id === drag.id ? { ...item, label } : item));
    }
    markDirty();
  }

  // On drop: snap-join to a nearby facing port, otherwise only nudge if it landed on top of something.
  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === 'sketch') {
      const d = sketchDraft;
      setSketchDraft(null);
      if (!drag.moved && drag.tool === 'smduct') {
        // A tap with SM duct on selects the run or part under it, so it can be edited or deleted.
        const t = drag.startTarget;
        if (t?.kind === 'end' || t?.kind === 'side') {
          setSelectedSketchId(t.id);
          setSelectedId(null);
          setSelectedConnId(null);
          setRightTab('selection');
        } else if (t?.kind === 'port') {
          setSelectedId(t.itemId);
          setSelectedSketchId(null);
          setSelectedConnId(null);
          setRightTab('selection');
        }
        return;
      }
      if (!drag.moved || !d || Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 6) return;
      if (d.kind === 'smduct') {
        let W = Number(sheetDims.w) || 300;
        let H = Number(sheetDims.h) || 150;
        let runMat = smMat({ mat: runMaterial });
        {
          // Starting on a transition's outlet: the new run takes the outlet size.
          const tp = [drag.startTarget, drag.endTarget].find((t) => t?.kind === 'port' && items.find((i) => i.id === t.itemId)?.type === 'transition' && t.portId === 'e');
          const tr = tp && items.find((i) => i.id === tp.itemId);
          if (tr) {
            const o = transDims(tr).b;
            W = o.w;
            H = o.h;
            if (o.round) runMat = 'spiral';
          }
        }
        const air = ['supply', 'return', 'exhaust', 'oa'].includes(ductType) ? ductType : 'supply';
        const A = drag.startTarget;
        const B = drag.endTarget;
        const runOf = (t) => (t?.kind === 'end' ? sketch.find((x) => x.id === t.id) : null);
        const freeEnd = (r, end) => r && !r[end === 'start' ? 'a' : 'b'];
        const fits = (r) => r && smDims(r).w === W && smDims(r).h === H && (r.air || 'supply') === air && smMat(r) === runMat;
        const notes = [];
        let next = sketch;
        let selId;
        const ra = runOf(A);
        if (ra && freeEnd(ra, A.end) && fits(ra)) {
          // Carry on from a free end of a same-size run: one run, with a bend.
          next = next.map((x) => {
            if (x.id !== ra.id) return x;
            const pts = A.end === 'start' ? [{ x: d.x2, y: d.y2 }, ...x.pts] : [...x.pts, { x: d.x2, y: d.y2 }];
            return { ...x, pts, x1: pts[0].x, y1: pts[0].y, x2: pts[pts.length - 1].x, y2: pts[pts.length - 1].y };
          });
          selId = ra.id;
          const rb = runOf(B);
          if (rb && freeEnd(rb, B.end) && fits(rb)) {
            next = smMerge(next, ra.id, A.end, rb.id, B.end, { ...smCtx, sketch: next });
            notes.push('Joined into one run');
          } else if (B) {
            next = next.map((x) => (x.id === ra.id ? { ...x, [A.end === 'start' ? 'a' : 'b']: smLinkFrom(B) } : x));
          }
        } else {
          const el = { id: crypto.randomUUID(), kind: 'smduct', pts: [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }], x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, w: W, h: H, air, mat: runMat, a: smLinkFrom(A), b: smLinkFrom(B) };
          if (!el.a) delete el.a;
          if (!el.b) delete el.b;
          next = [...next, el];
          selId = el.id;
          const rb = runOf(B);
          if (rb && freeEnd(rb, B.end) && fits(rb) && !el.a) {
            // Ran into the free end of a same-size run: make it one run.
            delete el.b;
            next = smMerge(next.map((x) => (x.id === el.id ? { ...x, b: undefined } : x)), rb.id, B.end, el.id, 'end', { ...smCtx, sketch: next });
            selId = rb.id;
            notes.push('Joined into one run');
          }
        }
        const fresh = next.find((x) => x.id === selId);
        if (fresh) {
          smEndFittings(fresh, { ...smCtx, sketch: next }).forEach((f) => notes.push(f.type === 'bto' ? 'Branch take-off added' : f.type === 'transition' ? 'Transition added' : 'Square-to-round added'));
          if ([A, B].some((t) => t?.kind === 'port')) notes.push('Connected to the part');
        }
        setSketch(next);
        setSelectedSketchId(selId);
        if (notes.length) toast.message([...new Set(notes)].join(' · '));
        setRightTab('selection');
        markDirty();
        return;
      }
      if (d.kind === 'callout') {
        const el = { id: crypto.randomUUID(), kind: 'callout', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, text: 'Airflow: ___ L/s', size: 14 };
        setSketch((current) => [...current, el]);
        setSelectedSketchId(el.id);
        setSelectedId(null);
        setSelectedConnId(null);
        setRightTab('selection');
        markDirty();
        return;
      }
      const el = d.kind === 'room'
        ? { id: crypto.randomUUID(), kind: 'room', x1: Math.min(d.x1, d.x2), y1: Math.min(d.y1, d.y2), x2: Math.max(d.x1, d.x2), y2: Math.max(d.y1, d.y2), name: '' }
        : { id: crypto.randomUUID(), kind: d.kind === 'measure' ? 'dim' : 'wall', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 };
      setSketch((current) => [...current, el]);
      markDirty();
      return;
    }
    if (drag?.kind === 'sketchmove') return;
    if (drag?.kind === 'smpoint') {
      if (drag.end && drag.target) {
        setSketch((current) => current.map((r) => (r.id === drag.id ? { ...r, [drag.end]: smLinkFrom(drag.target) } : r)));
        toast.message(drag.target.kind === 'side' ? 'Branch take-off added' : drag.target.kind === 'port' ? 'Connected to the part' : 'Joined');
      }
      return;
    }
    if (drag?.kind === 'wire') {
      setWire(null);
      if (!drag.moved) {
        // A tap: first tap picks the start, a tap on another part's dot finishes the duct.
        const prev = drag.prevPending;
        if (prev && prev.itemId !== drag.itemId) connectPorts(prev.itemId, prev.portId, drag.itemId, drag.portId);
        else if (prev && prev.portId === drag.portId) setPendingPort(null);
        return;
      }
      if (drag.target) connectPorts(drag.itemId, drag.portId, drag.target.itemId, drag.target.portId);
      else toast.message('Let go on a connection dot of another part to run a duct.');
      return;
    }
    if (!drag?.moved || drag.kind !== 'item') return;
    const group = drag.group;
    const members = items.filter((i) => group.includes(i.id));
    const others = items.filter((i) => !group.includes(i.id));
    const reach = JOIN_SCREEN_PX / viewRef.current.z;

    let best = null;
    members.forEach((m) => {
      portDefs(m).forEach((md) => {
        if (md.service || joinedPorts.has(portKey(m.id, md.id))) return;
        const mp = portInfo(m, md.id, ppm);
        others.forEach((o) => {
          portDefs(o).forEach((od) => {
            if (od.service || joinedPorts.has(portKey(o.id, od.id))) return;
            const op = portInfo(o, od.id, ppm);
            if (op.dir !== OPP[mp.dir]) return;
            const dist = Math.hypot(mp.x - op.x, mp.y - op.y);
            if (dist <= reach && (!best || dist < best.dist)) best = { m, pid: md.id, mp, o, opid: od.id, op, dx: op.x - mp.x, dy: op.y - mp.y, dist };
          });
        });
      });
    });

    if (best) {
      const res = resolveDuct('flex', best.m, best.o, best.mp, best.op, true);
      if (res.error) {
        toast.error(`Can’t join: ${res.error}`);
      } else {
        setItems((current) => current.map((item) => group.includes(item.id) ? { ...item, cx: item.cx + best.dx, cy: item.cy + best.dy } : item));
        setJoins((current) => [...current, { id: crypto.randomUUID(), a: { itemId: best.m.id, portId: best.pid }, b: { itemId: best.o.id, portId: best.opid } }]);
        markDirty();
        toast.success(`Joined ${tags[best.m.id]} to ${tags[best.o.id]}`, { description: 'They now move and rotate together. Use Unjoin to separate.' });
        return;
      }
    }

    if (group.length > 1) return;
    const me = members[0];
    if (!me || me.type === 'zonearea') return;
    if (me.type === 'transition') {
      const ts = smSeatTransition(me, smCtx, reach);
      if (ts) {
        fitTransition(me.id, ts);
        return;
      }
    }
    if (SM_INLINE.has(me.type) || SM_SIDE.has(me.type)) {
      const seat = smSeat(me, smCtx, reach);
      if (seat) {
        setItems((current) => current.map((item) => (item.id === me.id ? {
          ...item,
          cx: seat.cx,
          cy: seat.cy,
          rot: seat.rot,
          onRun: seat.onRun,
          ...(seat.dims ? { dims: seat.dims, ductSize: seat.ductSize } : {}),
          ...(seat.spec ? { spec: { ...item.spec, ...seat.spec } } : {}),
        } : item)));
        markDirty();
        toast.message(SM_SIDE.has(me.type) ? `${tags[me.id]} fitted to the duct side — run flex from its outlet` : `${tags[me.id]} fitted in the duct run`);
        return;
      }
      if (me.onRun) {
        // Taken off the run: back to its own catalogue size.
        setItems((current) => current.map((item) => (item.id === me.id ? { ...item, onRun: undefined, ...(item.ductSize ? { ductSize: undefined, dims: undefined } : {}) } : item)));
      }
    }
    if (me.type === 'zone' && cutIn(me)) return;
    const b = itemBox(me, ppm);
    const boxes = boxesExcept(items, [me.id]);
    const heavyOverlap = boxes.some((o) => {
      const ox = Math.max(0, Math.min(me.cx + b.w / 2, o.cx + o.w / 2) - Math.max(me.cx - b.w / 2, o.cx - o.w / 2));
      const oy = Math.max(0, Math.min(me.cy + b.h / 2, o.cy + o.h / 2) - Math.max(me.cy - b.h / 2, o.cy - o.h / 2));
      return ox * oy > 0.5 * Math.min(b.w * b.h, o.w * o.h);
    });
    if (!heavyOverlap) return;
    const spot = findFreeCenter(me.cx, me.cy, b.w, b.h, boxes, 0);
    setItems((current) => current.map((item) => item.id === me.id ? { ...item, cx: spot.x, cy: spot.y } : item));
  }

  function beginPinch() {
    const [a, b] = [...pointersRef.current.values()];
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - rect.left;
    const cy = (a.y + b.y) / 2 - rect.top;
    const v = viewRef.current;
    gestureRef.current = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.z, wx: (cx - v.x) / v.z, wy: (cy - v.y) / v.z, moved: true };
  }

  function openContextMenu(event) {
    event.preventDefault();
    if (scaleDraft) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setCtxMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, world: toWorld(event.clientX, event.clientY) });
  }

  function onCanvasPointerDown(event) {
    if (event.button === 2) return; // right-click opens the add menu instead
    if (ctxMenu) setCtxMenu(null);
    const finger = fingerOnly(event);
    if (scaleDraft && !finger) {
      event.preventDefault();
      if (!scaleDraft.b) addScalePoint(toWorld(event.clientX, event.clientY));
      return;
    }
    if (sketchTool && !finger) {
      event.preventDefault();
      startSketch(event);
      return;
    }
    canvasRef.current.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const v = viewRef.current;
      gestureRef.current = { type: 'pan', sx: event.clientX, sy: event.clientY, vx: v.x, vy: v.y, moved: false };
    } else if (pointersRef.current.size === 2) {
      beginPinch();
    }
  }

  function onCanvasPointerMove(event) {
    if (dragRef.current) { moveDrag(event); return; }
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gestureRef.current;
    if (!g) return;
    if (g.type === 'pan') {
      const dx = event.clientX - g.sx;
      const dy = event.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    } else if (g.type === 'pinch' && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left;
      const cy = (a.y + b.y) / 2 - rect.top;
      const z = clamp(g.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), MIN_Z, MAX_Z);
      setView({ z, x: cx - g.wx * z, y: cy - g.wy * z });
    }
  }

  function onCanvasPointerUp(event) {
    if (dragRef.current) { endDrag(); return; }
    const had = pointersRef.current.delete(event.pointerId);
    const g = gestureRef.current;
    if (pointersRef.current.size === 0) {
      if (had && g?.type === 'pan' && !g.moved) {
        // Double-tap empty space to zoom in there
        const now = Date.now();
        const lt = lastTapRef.current;
        if (lt && now - lt.t < 350 && Math.hypot(event.clientX - lt.x, event.clientY - lt.y) < 30) {
          const rect = canvasRef.current.getBoundingClientRect();
          zoomAt(1.8, event.clientX - rect.left, event.clientY - rect.top);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { t: now, x: event.clientX, y: event.clientY };
        }
        setSelectedId(null);
        setSelectedConnId(null);
        setPendingPort(null);
        setSelectedSketchId(null);
      }
      gestureRef.current = null;
    } else if (pointersRef.current.size === 1 && g?.type === 'pinch') {
      const [p] = [...pointersRef.current.values()];
      const v = viewRef.current;
      gestureRef.current = { type: 'pan', sx: p.x, sy: p.y, vx: v.x, vy: v.y, moved: true };
    }
  }

  // ---- Auto duct layout ----
  const autoCtx = {
    newItem: (type, spec, at, extra = {}) => ({ id: crypto.randomUUID(), type, cx: at.x, cy: at.y, rot: 0, spec: { ...defaultSpec(getTool(type)), ...spec }, ...extra }),
    portInfo: (item, portId) => portInfo(item, portId, ppm),
    itemBox: (item) => itemBox(item, ppm),
    btoSizes: BTO_SIZES,
    raGrilles: RA_GRILLES,
  };
  const modelKw = (m) => parseFloat(kwShort(m)) || 0;
  const autoFcu = items.find((i) => i.type === 'indoor' && !i.remove) || null;

  function patchRoom(room, patch) {
    if (room.kind === 'zone') {
      const it = items.find((i) => i.id === room.id);
      if (patch.type) updateItem(room.id, { hl: { ...(it?.hl || {}), type: patch.type } });
      return;
    }
    const sk = sketch.find((x) => x.id === room.id);
    if (patch.zone) updateSketch(room.id, { zone: patch.zone });
    if (patch.type) updateSketch(room.id, { hl: { ...(sk?.hl || {}), type: patch.type } });
  }

  function generateAuto({ model }) {
    const fcu = autoFcu;
    if (fcu) {
      const busy = joins.some((j) => [j.a, j.b].some((e) => e.itemId === fcu.id && e.portId === 'sa'))
        || connections.some((c) => [c.from, c.to].some((e) => e.itemId === fcu.id && (e.portId === 'sa' || e.portId === 'ra')));
      if (busy) {
        toast.error('That indoor unit already has ducts', { description: 'Delete its plenum and duct runs first, or remove the unit and let the layout place one.' });
        return;
      }
    }
    if (!scale && !sketch.length) {
      toast.error('Set the scale first', { description: 'Room sizes need to be in real metres for the load and outlet sizing.' });
      return;
    }
    const list = rooms.map((r) => ({ ...r, coolW: r.kw * 1000 }));
    const unitKwVal = fcu ? unitKw(fcu) : modelKw(model);
    const options = ['comfort', 'economy'].map((option) => buildLayout(list, { option, fcu, model, unitKw: unitKwVal, ppm, ctx: autoCtx }));
    const bad = options.find((o) => o.error);
    if (bad) {
      toast.error(bad.error);
      return;
    }
    setAutoOpen(false);
    setSelectedId(null);
    setSelectedConnId(null);
    setSelectedSketchId(null);
    setAutoPreview({ options, index: 0 });
  }

  function acceptAuto() {
    if (!autoPreview) return;
    const o = autoPreview.options[autoPreview.index];
    setItems((current) => [...current, ...o.items]);
    setConnections((current) => [...current, ...o.connections]);
    setJoins((current) => [...current, ...o.joins]);
    setAutoPreview(null);
    markDirty();
    toast.success(`${o.summary.title} added`, { description: 'Everything is editable — drag outlets to suit lights and trusses. Undo removes it.' });
  }

  // ---- Free sketch (no plan) ----
  // Snap to a 50 mm grid at the drawing's scale.
  function skSnap(v) {
    const g = (ppm * 50) / 1000;
    return Math.round(v / g) * g;
  }

  function startSketch(event) {
    const p = toWorld(event.clientX, event.clientY);
    const x = skSnap(p.x);
    const y = skSnap(p.y);
    if (sketchTool === 'text' || sketchTool === 'pin') {
      const el = sketchTool === 'pin'
        ? { id: crypto.randomUUID(), kind: 'pin', x1: p.x, y1: p.y, text: '' }
        : { id: crypto.randomUUID(), kind: 'text', x1: x, y1: y, text: 'Label' };
      setSketch((current) => [...current, el]);
      setSketchTool(null);
      setSelectedId(null);
      setSelectedConnId(null);
      setSelectedSketchId(el.id);
      setRightTab('selection');
      markDirty();
      return;
    }
    let sx = x;
    let sy = y;
    let startTarget = null;
    if (sketchTool === 'smduct') {
      // Start on a run end, a part's duct connection or the side of a run (branch).
      startTarget = smFindSnap(p, SM_SNAP_PX / (viewRef.current?.z || 1), smCtx);
      if (startTarget) { sx = startTarget.x; sy = startTarget.y; }
    }
    dragRef.current = { kind: 'sketch', tool: sketchTool, x1: sx, y1: sy, startTarget, endTarget: null, sx: event.clientX, sy: event.clientY, moved: false };
    canvasRef.current.setPointerCapture(event.pointerId);
  }

  function startSketchMove(event, el) {
    if (fingerOnly(event)) return; // pen mode: fingers pan
    if (sketchTool || scaleDraft) return; // let the tap draw instead
    event.stopPropagation();
    const p = toWorld(event.clientX, event.clientY);
    setSelectedId(null);
    setSelectedConnId(null);
    setPendingPort(null);
    setSelectedSketchId(el.id);
    setRightTab('selection');
    let orig = { ...el };
    if (el.kind === 'smduct' && (event.ctrlKey || event.metaKey) && (el.a || el.b || sketch.some((x) => x.kind === 'smduct' && ['a', 'b'].some((k) => x[k] && x[k].kind !== 'port' && x[k].id === el.id)))) {
      // Ctrl + drag breaks the run free of everything it's joined to.
      orig = smBake(el, smCtx);
      setSketch((current) => smDetachOthers(current, el.id, { ...smCtx, sketch: current }).map((x) => (x.id === el.id ? orig : x)));
      toast.message('Run disconnected');
    }
    const riders = el.kind === 'smduct' ? items.filter((i) => i.onRun?.id === el.id).map((i) => ({ id: i.id, cx: i.cx, cy: i.cy })) : [];
    dragRef.current = { kind: 'sketchmove', id: el.id, orig, riders, px: p.x, py: p.y, sx: event.clientX, sy: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  // DXF for CAD: walls, rooms, sheet metal (both edges + centreline), flex and service runs,
  // parts as outlines with tags, text, callouts and dimensions — all in real millimetres.
  function exportDxf() {
    if (!scale) toast.warning('Scale not set', { description: 'The DXF will not be in real millimetres until you set the scale.' });
    const k = 1000 / ppm;
    const P = (q) => ({ x: q.x * k, y: q.y * k });
    const dxf = createDxf();
    const th = 120; // text height, mm
    sketch.forEach((x) => {
      if (x.kind === 'wall') dxf.line('WALLS', x.x1 * k, x.y1 * k, x.x2 * k, x.y2 * k);
      else if (x.kind === 'room') {
        dxf.poly('ROOMS', [{ x: x.x1, y: x.y1 }, { x: x.x2, y: x.y1 }, { x: x.x2, y: x.y2 }, { x: x.x1, y: x.y2 }].map(P), true);
        dxf.text('TEXT', ((x.x1 + x.x2) / 2) * k, ((x.y1 + x.y2) / 2) * k, th * 1.5, x.name);
      } else if (x.kind === 'dim') {
        dxf.line('DIMS', x.x1 * k, x.y1 * k, x.x2 * k, x.y2 * k);
        dxf.text('DIMS', ((x.x1 + x.x2) / 2) * k, ((x.y1 + x.y2) / 2) * k - th, th, `${Math.round(Math.hypot(x.x2 - x.x1, x.y2 - x.y1) * k)}`);
      } else if (x.kind === 'text' || x.kind === 'pin') dxf.text('TEXT', x.x1 * k, x.y1 * k, th, x.text);
      else if (x.kind === 'callout') {
        dxf.line('TEXT', x.x2 * k, x.y2 * k, x.x1 * k, x.y1 * k);
        String(x.text || '').split('\n').forEach((ln, i) => dxf.text('TEXT', x.x2 * k, x.y2 * k + i * th * 1.4, th, ln));
      } else if (x.kind === 'smduct') {
        const pts = smPts(x, smCtx).map(P);
        const hw = smDims(x).w / 2;
        dxf.poly('DUCT-SM-CL', pts);
        for (let i = 1; i < pts.length; i += 1) {
          const a = pts[i - 1];
          const b = pts[i];
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const nx = -(b.y - a.y) / L;
          const ny = (b.x - a.x) / L;
          [-1, 1].forEach((sg) => dxf.line('DUCT-SM', a.x + nx * hw * sg, a.y + ny * hw * sg, b.x + nx * hw * sg, b.y + ny * hw * sg));
        }
        [[0, 1, x.capA && !x.a], [pts.length - 1, pts.length - 2, x.capB && !x.b], [0, 1, !x.capA && !x.a], [pts.length - 1, pts.length - 2, !x.capB && !x.b]].forEach(([i, j, on]) => {
          if (!on || !pts[j]) return;
          const L = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) || 1;
          const nx = -(pts[i].y - pts[j].y) / L;
          const ny = (pts[i].x - pts[j].x) / L;
          dxf.line('DUCT-SM', pts[i].x + nx * hw, pts[i].y + ny * hw, pts[i].x - nx * hw, pts[i].y - ny * hw);
        });
        const sg = longestSeg(pts);
        dxf.text('TEXT', sg.x, sg.y - hw - th * 0.6, th, `${DUCT_PREFIX[x.air] || ''}${smSizeText(x)} ${SM_MATS[smMat(x)]}`, sg.ang);
      }
    });
    runs.forEach((r) => dxf.poly(isService(r.conn) ? 'SERVICES' : 'DUCT-FLEX', r.pts.map(P)));
    items.forEach((it) => {
      const b = itemBox(it, ppm);
      const c = P({ x: it.cx, y: it.cy });
      const w = b.w * k;
      const h = b.h * k;
      dxf.poly('EQUIP', [{ x: c.x - w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y + h / 2 }, { x: c.x - w / 2, y: c.y + h / 2 }], true);
      dxf.text('TEXT', c.x - w / 2, c.y + h / 2 + th * 1.2, th * 0.9, `${tags[it.id] || ''} ${shortSpec(it) || ''}`.trim());
    });
    const blob = new Blob([dxf.toString()], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project?.Name || 'Ductplanner').replace(/[\\/:*?"<>|]+/g, '-')} - ${page.Name || 'Level'}.dxf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('DXF exported', { description: 'Millimetres, one layer per kind (walls, sheet metal, flex, equipment, text).' });
  }

  // Cap / uncap the open ends of a run.
  function toggleCaps(run) {
    if (run?.kind !== 'smduct') { toast.message('Select a duct run first, then press E to cap its open end(s).'); return; }
    const open = [['a', 'capA'], ['b', 'capB']].filter(([k]) => !run[k]);
    if (!open.length) { toast.error('Both ends of this run are joined — nothing to cap.'); return; }
    const on = !open.every(([, c]) => run[c]);
    updateSketch(run.id, Object.fromEntries(open.map(([, c]) => [c, on])));
    toast.message(on ? `End cap${open.length > 1 ? 's' : ''} added` : 'End cap removed');
  }

  // Put a transition onto a run end (from a drop, the X key or the panel button).
  function fitTransition(itemId, ts) {
    setItems((current) => current.map((it) => (it.id === itemId ? { ...it, cx: ts.cx, cy: ts.cy, rot: ts.rot, tIn: ts.tIn, tOut: ts.tOut, onRun: { id: ts.runId, end: ts.end } } : it)));
    setSketch((current) => current.map((x) => (x.id === ts.runId ? { ...x, [ts.key]: { kind: 'port', itemId, portId: 'w' }, [ts.key === 'a' ? 'capA' : 'capB']: false } : x)));
    setSelectedId(itemId);
    setSelectedSketchId(null);
    setRightTab('selection');
    markDirty();
    toast.message(`Transition ${ts.tIn} → ${ts.tOut} fitted`, { description: 'Change the outlet size in the panel. Draw on (D) from its outlet end — the new run takes the outlet size.' });
  }

  // Selected run (or the run of the selected part): add a transition at its open end.
  function addTransitionToRun(run) {
    if (!run) { addItem('transition'); toast.message('Transition added — drag it onto the open end of a duct run to fit it.'); return; }
    const P = smPts(run, smCtx);
    const key = !run.b ? 'b' : !run.a ? 'a' : null;
    if (!key) { toast.error('Both ends of this run are already joined.'); return; }
    const at = key === 'b' ? P[P.length - 1] : P[0];
    const id = crypto.randomUUID();
    const draft = { id, type: 'transition', cx: at.x, cy: at.y, rot: 0, spec: defaultSpec(getTool('transition')) };
    const out = sketchDimsText(run);
    const ts = smSeatTransition(draft, { ...smCtx, sketch: sketch.map((x) => x) }, 1e6, out);
    if (!ts || ts.runId !== run.id) { toast.error('Transitions fit on straight (0° / 90°) run ends only.'); return; }
    setItems((current) => [...current, draft]);
    fitTransition(id, ts);
  }

  // Toolbar size as a transition outlet, when it differs from the run.
  function sketchDimsText(run) {
    const w = Number(sheetDims.w) || 300;
    const h = Number(sheetDims.h) || 150;
    return smMat(run) === 'spiral' ? String(w) : `${w}x${h}`;
  }

  // ---- Editing the points of a sheet metal run ----
  function startSmPoint(event, run, idx) {
    if (fingerOnly(event) || sketchTool || scaleDraft) return;
    event.stopPropagation();
    const pts = smPts(run, smCtx);
    // Moving a tied end frees it; it can re-tie where it's dropped.
    const freed = idx === 0 && run.a ? 'a' : idx === pts.length - 1 && run.b ? 'b' : null;
    setSketch((current) => current.map((x) => (x.id === run.id ? { ...x, pts, ...(freed ? { [freed]: undefined } : {}) } : x)));
    dragRef.current = { kind: 'smpoint', id: run.id, idx, end: idx === 0 ? 'a' : idx === pts.length - 1 ? 'b' : null, target: null, sx: event.clientX, sy: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function addSmPoint(run, p) {
    const pts = smPts(run, smCtx);
    let best = { d: Infinity, i: -1, x: 0, y: 0 };
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0.05, 0.95);
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < best.d) best = { d, i, x, y };
    }
    if (best.i < 0) return;
    const next = [...pts.slice(0, best.i + 1), { x: best.x, y: best.y }, ...pts.slice(best.i + 1)];
    setSketch((current) => current.map((x) => {
      if (x.id === run.id) return { ...x, pts: next };
      // Branches off later segments shift up one.
      if (x.kind !== 'smduct') return x;
      let y = x;
      ['a', 'b'].forEach((k) => {
        const l = x[k];
        if (l?.kind === 'side' && l.id === run.id && l.seg >= best.i) {
          if (l.seg > best.i) y = { ...y, [k]: { ...l, seg: l.seg + 1 } };
          else y = smBake(y, { ...smCtx, sketch: current }, [k]);
        }
      });
      return y;
    }));
    markDirty();
    toast.message('Bend point added — drag it to shape the run');
  }

  function removeSmPoint(run, idx) {
    const pts = smPts(run, smCtx);
    if (idx === 0 || idx === pts.length - 1 || pts.length <= 2) return;
    const next = pts.filter((_, i) => i !== idx);
    setSketch((current) => {
      const c = { ...smCtx, sketch: current };
      return current.map((x) => {
        if (x.id === run.id) return { ...x, pts: next };
        if (x.kind !== 'smduct') return x;
        let y = x;
        ['a', 'b'].forEach((k) => {
          const l = x[k];
          if (l?.kind !== 'side' || l.id !== run.id || l.seg < idx - 1) return;
          if (l.seg >= idx) y = { ...y, [k]: { ...l, seg: l.seg - 1 } };
          else y = smBake(y, c, [k]);
        });
        return y;
      });
    });
    markDirty();
  }

  function updateSketch(id, patch) {
    setSketch((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    markDirty();
  }

  // Heat-load inputs and readout for a sketched room or zone area.
  function roomFields(room, onChange, areaM2) {
    const area = Math.abs(areaM2);
    const calc = calcRoomLoad(room.hl, area, climate, room.name || '');
    const v = calc.inputs;
    const setHl = (patch) => onChange({ hl: { ...(room.hl || {}), ...patch } });
    const field = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs';
    return (
      <div className="rounded-md border border-border p-2 text-xs space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Heat load</div>
          {showLoads && <div className="text-[10px] text-muted-foreground">{`${Math.round(calc.wPerM2)} W/m²`}</div>}
        </div>
        {showLoads ? (
          <div className="flex gap-3">
            <div><span className="font-semibold text-sm">{`${calc.coolKw.toFixed(1)} kW`}</span><span className="text-muted-foreground"> cool</span></div>
            <div><span className="font-semibold text-sm">{`${calc.heatKw.toFixed(1)} kW`}</span><span className="text-muted-foreground"> heat</span></div>
          </div>
        ) : <div>Set the scale for a load estimate.</div>}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Room type</span>
            <select className={field} value={v.type} onChange={(e) => setHl({ type: e.target.value })}>
              {Object.entries(ROOM_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </label>
          {room.kind === 'room' ? (
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Zone</span>
              <select className={field} value={room.zone || 'Zone 1'} onChange={(e) => onChange({ zone: e.target.value })}>
                {ZONE_NAMES.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">People</span>
              <Input className="h-8 text-xs" type="number" min="0" inputMode="numeric" value={v.people} onChange={(e) => setHl({ people: e.target.value })} />
            </label>
          )}
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Main windows face</span>
            <select className={field} value={v.orient} onChange={(e) => setHl({ orient: e.target.value })}>
              {Object.entries(ORIENTS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Glass (m²)</span>
            <Input className="h-8 text-xs" type="number" min="0" step="0.5" inputMode="decimal" value={v.glass} onChange={(e) => setHl({ glass: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Shading</span>
            <select className={field} value={v.shading} onChange={(e) => setHl({ shading: e.target.value })}>
              {Object.entries(SHADING).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">External walls</span>
            <select className={field} value={v.walls} onChange={(e) => setHl({ walls: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Above</span>
            <select className={field} value={v.ceiling} onChange={(e) => setHl({ ceiling: e.target.value })}>
              {Object.entries(CEILINGS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Ceiling height (m)</span>
            <Input className="h-8 text-xs" type="number" min="2" step="0.1" inputMode="decimal" value={v.height} onChange={(e) => setHl({ height: e.target.value })} />
          </label>
          {room.kind === 'room' && (
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">People</span>
              <Input className="h-8 text-xs" type="number" min="0" inputMode="numeric" value={v.people} onChange={(e) => setHl({ people: e.target.value })} />
            </label>
          )}
        </div>
      </div>
    );
  }

  const photoMatches = (f, key) => String(f?.name || f?.Name || f?.fileName || f?.originalName || '').includes(String(key || '').replace(/\.jpg$/, ''));
  const photoUrl = (key) => (key ? photoUrls[key] || photos.find((f) => photoMatches(f, key))?.url || null : null);

  async function addPhoto(file, pin) {
    if (!file || !pin) return;
    setPhotoBusy(true);
    try {
      const blob = await imageFileToJpeg(file);
      const key = `pin-${pin.id.slice(0, 8)}-${Date.now()}`;
      const name = `${key}.jpg`;
      setPhotoUrls((m) => ({ ...m, [key]: URL.createObjectURL(blob) }));
      const uploaded = await sdk.storage.upload(new File([blob], name, { type: 'image/jpeg' }));
      if (!uploaded) throw new Error('No file returned');
      setPhotos((cur) => [...cur.filter((f) => !photoMatches(f, pin.photo)), { ...uploaded, name: uploaded.name || name, size: uploaded.size || blob.size, type: uploaded.type || 'image/jpeg' }]);
      updateSketch(pin.id, { photo: key });
      toast.success('Photo added', { description: 'Hit Save to keep it with the drawing.' });
    } catch (err) {
      toast.error('Photo could not be stored', { description: err?.message || 'Try again.' });
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto(pin) {
    setPhotos((cur) => cur.filter((f) => !photoMatches(f, pin.photo)));
    updateSketch(pin.id, { photo: undefined });
  }

  function deleteSketch() {
    const gone = sketch.find((x) => x.id === selectedSketchId);
    if (gone?.photo) setPhotos((cur) => cur.filter((f) => !photoMatches(f, gone.photo)));
    setSketch((current) => smDetachOthers(current, selectedSketchId, { ...smCtx, sketch: current }).filter((s) => s.id !== selectedSketchId));
    setSelectedSketchId(null);
    markDirty();
  }

  // ---- Job details, PDF export and pick slip ----
  function openJob() {
    setJobForm({ Name: project?.Name || '', address_c: project?.address_c || '', suburb_c: project?.suburb_c || '', phone_c: project?.phone_c || '' });
    setJobOpen(true);
  }

  async function saveJob(event) {
    event.preventDefault();
    if (!onSaveProject) return;
    setJobSaving(true);
    try {
      const ok = await onSaveProject(jobForm);
      if (ok) {
        toast.success('Job details saved');
        setJobOpen(false);
      } else {
        toast.error('Could not save job details');
      }
    } finally {
      setJobSaving(false);
    }
  }

  // Fans for the schedule on the PDF and in the list.
  const fanSchedule = items
    .filter((it) => FAN_TYPES.has(it.type))
    .map((it) => {
      const tool = getTool(it.type);
      const pick = it.spec?.model || it.spec?.kind || '';
      return {
        id: it.id,
        tag: tags[it.id] || '',
        kind: tool.label,
        model: (it.fanModel || '').trim() || pick || '—',
        supplier: (it.fanSupplier || '').trim() || '—',
        duty: it.spec?.duty || '—',
      };
    });

  // Extent of everything drawn (the whole sheet when a plan image is loaded), with a margin.
  function drawingBounds() {
    if (background) return { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const take = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    items.forEach((it) => { const b = itemBox(it, ppm); take(it.cx - b.w / 2, it.cy - b.h / 2); take(it.cx + b.w / 2, it.cy + b.h / 2); });
    runs.forEach((r) => r.pts.forEach((q) => take(q.x, q.y)));
    sketch.forEach((x) => {
      if (x.kind === 'smduct') smPts(x, smCtx).forEach((q) => take(q.x, q.y));
      else { if (x.x1 != null) take(x.x1, x.y1); if (x.x2 != null) take(x.x2, x.y2); }
    });
    if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H };
    const pad = Math.max(20, 0.06 * Math.max(x1 - x0, y1 - y0));
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  // Print view: the plan fitted to an A4 landscape sheet (plus schedule), or the pick slip.
  // The browser's print dialog saves it as a PDF.
  function exportPdf(mode) {
    setSelectedId(null);
    setSelectedConnId(null);
    setPendingPort(null);
    setCtxMenu(null);
    setShowKeys(false);
    if (!project?.address_c) toast.message('Tip: add the customer address in Job details so it prints on the sheet.');
    const prev = viewRef.current;
    setPrintScaleUsed(null);
    if (mode === 'plan') {
      const paper = PAPER[printOpts.paper] || PAPER.A4;
      const W = paper.plan.w * PX_PER_MM;
      const H = paper.plan.h * PX_PER_MM;
      const bx = drawingBounds();
      const N = Number(printOpts.scale);
      if (N && scale) {
        // True scale: 1 m on site = 1000/N mm on paper.
        const z = ((1000 / N) / ppm) * PX_PER_MM;
        const cx = (bx.x0 + bx.x1) / 2;
        const cy = (bx.y0 + bx.y1) / 2;
        setView({ z, x: W / 2 - cx * z, y: H / 2 - cy * z });
        setPrintScaleUsed(N);
        if ((bx.x1 - bx.x0) * z > W * 1.001 || (bx.y1 - bx.y0) * z > H * 1.001) {
          const fits = PRINT_SCALES.find((n) => (bx.x1 - bx.x0) * (((1000 / n) / ppm) * PX_PER_MM) <= W && (bx.y1 - bx.y0) * (((1000 / n) / ppm) * PX_PER_MM) <= H);
          toast.warning(`The drawing is bigger than ${printOpts.paper} at 1:${N}`, { description: fits ? `It fits at 1:${fits}${printOpts.paper === 'A4' ? ', or try A3' : ''}. Printing centred and cropped.` : 'Try A3 or a smaller scale. Printing centred and cropped.' });
        }
      } else {
        const z = Math.min(W / (bx.x1 - bx.x0), H / (bx.y1 - bx.y0));
        setView({ z, x: (W - (bx.x1 - bx.x0) * z) / 2 - bx.x0 * z, y: (H - (bx.y1 - bx.y0) * z) / 2 - bx.y0 * z });
      }
    }
    setPrintMode(mode);
    const restore = () => {
      setView(prev);
      setPrintMode(null);
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    setTimeout(() => window.print(), 350);
  }

  // Stretch a zone area from its bottom-right corner.
  function startResize(event, item) {
    if (fingerOnly(event)) return; // pen mode: fingers pan
    event.stopPropagation();
    const box = itemBox(item, ppm);
    dragRef.current = { kind: 'resize', id: item.id, left: item.cx - box.w / 2, top: item.cy - box.h / 2, turned: ((item.rot || 0) / 90) % 2 === 1, sx: event.clientX, sy: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  // Press on a connection dot and drag to another part's dot to run a duct.
  function startWire(event, itemId, portId) {
    if (fingerOnly(event)) return; // pen mode: fingers pan
    event.stopPropagation();
    dragRef.current = { kind: 'wire', itemId, portId, prevPending: pendingPort, sx: event.clientX, sy: event.clientY, moved: false };
    setSelectedId(null);
    setSelectedConnId(null);
    setPendingPort({ itemId, portId });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function nearestPort(p, excludeId) {
    const reach = 28 / viewRef.current.z;
    let best = null;
    items.forEach((it) => {
      if (it.id === excludeId) return;
      portDefs(it).forEach((d) => {
        if (d.joinOnly || joinedPorts.has(portKey(it.id, d.id))) return;
        const q = portInfo(it, d.id, ppm);
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (dist <= reach && (!best || dist < best.dist)) best = { itemId: it.id, portId: d.id, x: q.x, y: q.y, dist };
      });
    });
    return best;
  }

  function pasteItem(source) {
    const copy = { ...source, id: crypto.randomUUID(), cx: source.cx + 30, cy: source.cy + 30, label: undefined, pairedWith: undefined, spec: { ...(source.spec || {}) } };
    setItems((current) => [...current, copy]);
    clipRef.current = copy;
    setSelectedId(copy.id);
    setSelectedConnId(null);
    markDirty();
  }

  function undo(step = -1) {
    const h = historyRef.current;
    const i = h.index + step;
    if (i < 0 || i >= h.stack.length) { toast.message(step < 0 ? 'Nothing to undo' : 'Nothing to redo'); return; }
    h.index = i;
    const s = JSON.parse(h.stack[i]);
    restoringRef.current = true;
    setItems(s.items);
    setConnections(s.connections);
    setJoins(s.joins);
    setSketch(s.sketch || []);
    setSelectedSketchId(null);
    setSelectedId(null);
    setSelectedConnId(null);
    setPendingPort(null);
    markDirty();
  }

  function handlePortClick(itemId, portId) {
    setSelectedId(null);
    setSelectedConnId(null);
    if (!pendingPort) {
      setPendingPort({ itemId, portId });
      return;
    }
    if (pendingPort.itemId === itemId) {
      setPendingPort(pendingPort.portId === portId ? null : { itemId, portId });
      return;
    }
    connectPorts(pendingPort.itemId, pendingPort.portId, itemId, portId);
  }

  function connectPorts(aId, aPort, bId, bPort) {
    const a = items.find((item) => item.id === aId);
    const b = items.find((item) => item.id === bId);
    if (!a || !b || aId === bId) { setPendingPort(null); return; }
    const pendingPort = { itemId: aId, portId: aPort };
    const itemId = bId;
    const portId = bPort;
    // Refrigerant pipes and condensate drains use their own connection points.
    const pa = portInfo(a, pendingPort.portId, ppm);
    const pb = portInfo(b, portId, ppm);
    if (pa.service || pb.service) {
      if (pa.service !== pb.service) {
        const want = [pa.service, pb.service].includes('power') ? 'Power cable runs from the switchboard to the isolator and condenser (dark red dots).' : [pa.service, pb.service].includes('pipe') ? 'Refrigerant pipe runs go from an indoor unit to its outdoor unit (orange dots).' : 'Drains run from an indoor unit to a pump or drain point (blue dots).';
        toast.error(want);
        return;
      }
      const svc = { id: crypto.randomUUID(), type: pa.service, from: { itemId: aId, portId: aPort }, to: { itemId: bId, portId: bPort } };
      if (pa.service === 'power') {
        // Only the run leaving the switchboard needs a breaker; isolator -> CU is the same circuit.
        svc.breaker = BREAKERS[1];
        svc.noBreaker = ![a, b].some((it) => it.type === 'switchboard');
      }
      setConnections((current) => [...current, svc]);
      setPendingPort(null);
      setSelectedId(null);
      setSelectedConnId(svc.id);
      markDirty();
      return;
    }
    const res = resolveDuct(ductType, a, b, portInfo(a, pendingPort.portId, ppm), portInfo(b, portId, ppm));
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.note) toast.message(res.note);
    // Size the duct to the spigot it starts from (or the one it ends on).
    const sa = portSizeMm(a, portInfo(a, pendingPort.portId, ppm).id);
    const sb = portSizeMm(b, portInfo(b, portId, ppm).id);
    const size = sa || sb || getDuct(res.type).defaultSize;
    if (sa && sb && sa !== sb) {
      toast.warning('Spigot sizes don’t match', { description: `${tags[a.id]} is ${sizeLabel(sa)} but ${tags[b.id]} is ${sizeLabel(sb)}. Duct set to ${sizeLabel(size)} — add a reducer or check the fitting sizes.` });
    }
    const next = {
      id: crypto.randomUUID(),
      type: res.type,
      size,
      from: { itemId: pendingPort.itemId, portId: pendingPort.portId },
      to: { itemId, portId },
      ...(ductMaterial === 'sheet' && res.type !== 'flex' ? { material: 'sheet', shape: 'rect', w: Number(sheetDims.w) || 300, h: Number(sheetDims.h) || 150 } : {}),
    };
    setConnections((current) => [...current, next]);
    setPendingPort(null);
    setSelectedConnId(next.id);
    markDirty();
  }

  async function save(opts = {}) {
    if (planBusy) {
      toast.message('Plan still loading — save again in a moment.');
      setStatus('Plan still loading…');
      return;
    }
    setStatus('Saving…');
    const payload = JSON.stringify({ items, connections, joins, scale, showLabels, sketch, climate });
    lastSavedRef.current = payload;
    let ok = false;
    try { ok = await onSave(payload, planFile, photos); } catch { ok = false; }
    if (ok) {
      dirtyRef.current = false;
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setStatus(`${opts.auto ? 'Auto-saved' : 'Saved'} ✓ ${new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · ${items.length} objects · ${connections.length} runs`);
      if (!opts.quiet && !opts.auto) toast.success('Drawing saved', { description: `${items.length} objects and ${connections.length} run(s) saved successfully.` });
      return true;
    }
    try { localStorage.setItem(draftKey, JSON.stringify({ t: Date.now(), payload })); } catch { /* ignore */ }
    setStatus('SAVE FAILED — a draft copy is kept');
    if (!opts.auto || !saveFailToastRef.current) toast.error('Save failed', { description: 'A draft copy is kept. Try Save again.' });
    if (opts.auto) saveFailToastRef.current = true;
    return false;
  }
  saveRef.current = save;

  // Switch floor level (saves this one first) or add a new level.
  async function switchLevel(value) {
    if (value === String(page.Id)) return;
    if (value === '__add') {
      const name = window.prompt('Name for the new level', `Level ${levels.length + 1}`);
      if (!name || !name.trim()) return;
      setLevelBusy(true);
      try {
        if (dirtyRef.current) await save({ quiet: true });
        await onAddLevel?.(name.trim());
      } finally {
        setLevelBusy(false);
      }
      return;
    }
    setLevelBusy(true);
    try {
      if (dirtyRef.current) await save({ quiet: true });
      onSwitchLevel?.(value);
    } finally {
      setLevelBusy(false);
    }
  }

  const selectedSketch = sketch.find((s) => s.id === selectedSketchId) || null;
  const showPortsFor = (item) => !scaleDraft && !sketchTool && portDefs(item).length > 0 && (pendingPort ? true : selectedId === item.id);
  const selectedTool = selected ? getTool(selected.type) : null;
  const selectedJoined = selected ? joins.some((j) => j.a.itemId === selected.id || j.b.itemId === selected.id) : false;
  const selectedRun = selectedConn ? runs.find((r) => r.conn.id === selectedConn.id) : null;
  const sizeValue = selectedConn ? (selectedConn.size || getDuct(selectedConn.type).defaultSize) : null;
  const sizeOptions = SIZES.some((s) => s.mm === sizeValue) || sizeValue == null ? SIZES : [...SIZES, { mm: sizeValue, label: `${sizeValue}mm` }];
  const bar = scale ? niceScaleBar(scale.pxPerM, view.z) : null;
  const inv = 1 / view.z;
  const selectedMm = selected ? footprintMm(selected) : null;

  function printHeader(title) {
    return (
      <div className="flex items-start justify-between border-b-2 border-black pb-2 mb-2">
        <div className="flex items-center gap-2">
          <img src={ECHO_LOGO} alt="Echo Air Conditioning" className="h-12 w-auto shrink-0" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          <div>
            <div className="text-base font-bold">{COMPANY.name}</div>
            <div className="text-[10px]">{COMPANY.line}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase tracking-wide">{title}</div>
          <div className="text-[10px]">{`${new Date().toLocaleDateString('en-AU')} · ${page.Name} · Rev ${project?.revision_c || 'A'}`}</div>
        </div>
      </div>
    );
  }

  function printCustomer() {
    const cells = [
      ['Customer', project?.Name || '—'],
      ['Address', [project?.address_c, project?.suburb_c].filter(Boolean).join(', ') || '—'],
      ['Phone', project?.phone_c || '—'],
      ['Scale', printScaleUsed ? `1:${printScaleUsed} @ ${printOpts.paper}` : scale ? `Not to a set scale (fitted to ${printOpts.paper})` : 'Not to scale'],
    ];
    return (
      <div className="grid grid-cols-4 gap-2 text-[10px] mb-2">
        {cells.map(([k, v]) => (
          <div key={k} className="border border-black px-2 py-1">
            <div className="uppercase tracking-wider text-[8px] text-gray-600">{k}</div>
            <div className="font-semibold text-[11px]">{v}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderSymbol(item, box) {
    if (item.type === 'indoor') {
      const [w, d] = footprintMm(item);
      return <IndoorUnitPlan w={w} d={d} />;
    }
    if (item.type === 'outdoor') {
      const [w, d] = footprintMm(item);
      return <OutdoorUnitPlan w={w} d={d} fans={outdoorBody(item).fans} />;
    }
    if (SECTION_TYPES.has(item.type)) {
      const [w, d] = footprintMm(item);
      return item.type === 'fansection' ? <FanSectionPlan w={w} d={d} /> : <CoilSectionPlan w={w} d={d} />;
    }
    if (WALL_TYPES.has(item.type)) {
      const [w, d] = footprintMm(item);
      return <WallGrillePlan kind={item.type} w={w} d={d} className={ROLE_TONE[getTool(item.type).role] || 'text-slate-900'} />;
    }
    if (item.type === 'transition') {
      return <TransitionPlan t={transDims(item)} className={ROLE_TONE.fit} />;
    }
    const spigots = item.type === 'saplenum' || item.type === 'raplenum' || item.type === 'ductplate' ? spigotCount(item.spec?.size, 2) : item.type === 'rafilterbox' ? (rfbOutlet(item).rect ? 0 : rfbOutlet(item).n) : undefined;
    return <HvacSymbol type={item.type} size="100%" stretch={STRETCH.has(item.type)} spigots={spigots} className={ROLE_TONE[getTool(item.type).role] || 'text-slate-900'} />;
  }

  return (
    <div ref={rootRef} id="dp-print-root" className="min-h-svh bg-background text-foreground flex flex-col overflow-auto">
      <style>{'.nss .sym svg *{vector-effect:non-scaling-stroke}'}</style>
      <style>{`@media screen { .dp-print-only { display: none !important; } }
@media print {
  @page { size: ${printMode === 'pick' ? 'A4 portrait' : `${printOpts.paper} landscape`}; margin: 8mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #dp-print-root, #dp-print-root * { visibility: visible !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #dp-print-root { position: absolute !important; left: 0; top: 0; width: 100% !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; color: #000 !important; }
  #dp-print-root .dp-noprint { display: none !important; }
  #dp-print-root .dp-print-plan { padding: 0 !important; background: #fff !important; flex: none !important; display: flex !important; align-items: flex-start; gap: 4mm; }
  #dp-print-root .dp-side-list { display: block !important; width: 77mm; flex: none; }
  #dp-print-root [data-drawing-canvas] { width: ${(PAPER[printOpts.paper] || PAPER.A4).plan.w}mm !important; flex: none !important; height: ${(PAPER[printOpts.paper] || PAPER.A4).plan.h}mm !important; min-height: 0 !important; border: 1px solid #000 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
  .dp-page-break { break-before: page; }
}`}</style>
      <header className="dp-noprint border-b border-border bg-card px-2 py-1 flex items-center gap-2 min-h-11 [&_button]:h-8">
        <Button variant="ghost" size="sm" onClick={async () => { if (dirtyRef.current && !planBusy) await save({ quiet: true }); onBack(); }} className="shrink-0">
          <ApperIcon name="ArrowLeft" size={16} />
          <span className="hidden sm:inline">Projects</span>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{project?.Name || page.Name}</div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
            {!online && <ApperIcon name="WifiOff" size={12} className="text-amber-600 shrink-0" />}
            <span className="truncate">{status}</span>
          </div>
        </div>
        <label className="shrink-0 flex items-center gap-1 text-xs" title="Floor level — each level is its own drawing">
          <ApperIcon name="Layers3" size={15} className="text-muted-foreground" />
          <select
            value={String(page.Id)}
            disabled={levelBusy || !online}
            onChange={(event) => switchLevel(event.target.value)}
            className="h-9 max-w-36 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Floor level"
          >
            {(levels.length ? levels : [page]).map((l) => <option key={l.Id} value={String(l.Id)}>{l.Name}</option>)}
            {onAddLevel && <option value="__add">+ Add level…</option>}
          </select>
        </label>
        <Button variant="outline" size="sm" className="shrink-0" onClick={openJob} title="Customer name, address and phone">
          <ApperIcon name="UserRound" size={15} />
          <span className="hidden md:inline">Job details</span>
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setPrintDialog(true)} title="Export the plan and schedule as a PDF">
          <ApperIcon name="FileDown" size={15} />
          <span className="hidden md:inline">Export PDF</span>
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={exportDxf} title="Export DXF for AutoCAD / other CAD  ·  Ctrl + Shift + E">
          <ApperIcon name="FileCode2" size={15} />
          <span className="hidden md:inline">DXF</span>
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => exportPdf('pick')} title="Print a pick slip for the store">
          <ApperIcon name="ClipboardList" size={15} />
          <span className="hidden md:inline">Pick slip</span>
        </Button>
        <Button className="hidden sm:inline-flex shrink-0" onClick={save}>
          <ApperIcon name="Save" size={16} />
          Save drawing
        </Button>
      </header>

      <div className="dp-print-only text-black px-1">
        {printHeader(printMode === 'pick' ? 'Pick slip' : 'Duct layout')}
        {printCustomer()}
      </div>

      <div className="flex flex-col flex-1 min-h-0 pb-20 sm:pb-0">
        <div className="dp-noprint border-b border-border bg-card px-2 py-1 flex flex-wrap items-center gap-1.5 shrink-0 [&_button]:shrink-0">
          <input ref={fileRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={loadPlan} />
          <Button variant="outline" size="sm" className="h-8 px-2" disabled={planBusy} title="Load a plan (PDF or image)  ·  O" onClick={() => fileRef.current?.click()}>
            <ApperIcon name={planBusy ? 'Loader' : 'ImagePlus'} size={15} className={planBusy ? 'animate-spin' : ''} />
            <span className="hidden xl:inline">{planBusy ? 'Loading…' : 'Plan'}</span>
          </Button>
          {background && (
            <Button variant="ghost" size="sm" className="h-8 px-2" title="Remove the plan image" onClick={() => { setBackground(''); setPlanFile([]); markDirty('Plan removed · unsaved changes'); }}>
              <ApperIcon name="ImageOff" size={15} />
            </Button>
          )}
          {scaleDraft ? (
            <div className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-2 py-0.5">
              <span className="text-xs whitespace-nowrap">
                {!scaleDraft.a ? 'Tap the start of a known dimension' : !scaleDraft.b ? 'Now tap the end' : 'Real length (mm):'}
              </span>
              {scaleDraft.a && scaleDraft.b && (
                <form onSubmit={applyScale} className="flex gap-1">
                  <Input autoFocus type="number" inputMode="numeric" min="1" placeholder="Length in mm, e.g. 3600" value={scaleDraft.mm} onChange={(event) => setScaleDraft((d) => ({ ...d, mm: event.target.value }))} className="h-7 w-28 text-xs" />
                  <Button type="submit" size="sm" className="h-7">Apply</Button>
                </form>
              )}
              {scaleDraft.a && <Button variant="ghost" size="sm" className="h-7 px-1.5" title="Restart" onClick={() => setScaleDraft({ a: null, b: null, mm: '' })}><ApperIcon name="RotateCcw" size={14} /></Button>}
              <Button variant="ghost" size="sm" className="h-7 px-1.5" title="Cancel (Esc)" onClick={() => setScaleDraft(null)}><ApperIcon name="X" size={14} /></Button>
            </div>
          ) : (
            <Button variant={scale && !scaleOff ? 'outline' : scaleOff ? 'destructive' : 'default'} size="sm" className="h-8 px-2" title={`${scaleOff ? `Scale looks wrong: the sheet works out ${Math.round(WORLD_W / scale.pxPerM)} m wide, so ducts draw too ${WORLD_W / scale.pxPerM > 120 ? 'thin' : 'big'}. Click to set it again.` : scale ? `Scale set from a ${Number(scale.mm).toLocaleString()} mm reference (sheet ≈ ${Math.round(WORLD_W / scale.pxPerM)} m wide) — click to reset` : 'Set the scale: mark a known dimension so everything draws to size'}  ·  K`} onClick={startScale}>
              <ApperIcon name={scaleOff ? 'TriangleAlert' : 'Ruler'} size={15} />
              <span className="text-xs">{scaleOff ? 'Check scale' : scale ? 'Scale ✓' : 'Set scale'}</span>
            </Button>
          )}
          <div className="h-6 w-px bg-border mx-0.5" />
          {[[null, 'MousePointer2', 'Select', 'V'], ['smduct', 'RectangleHorizontal', 'SM duct', 'D'], ['wall', 'PenLine', 'Wall', 'W'], ['room', 'Square', 'Room', 'B'], ['text', 'Type', 'Text', 'T'], ['callout', 'MessageSquareText', 'Callout', 'A'], ['measure', 'Ruler', 'Measure', 'M'], ['pin', 'MapPin', 'Note', 'N']].map(([tool, icon, label, key]) => (
            <Button
              key={label}
              variant={sketchTool === tool ? 'default' : 'ghost'}
              size="sm"
              className={`h-8 gap-1 px-2 ${tool === 'smduct' ? 'font-semibold' : ''}`}
              title={`${label}  ·  ${key}`}
              onClick={() => { setSketchTool(tool); setPendingPort(null); setSketchDraft(null); }}
            >
              <ApperIcon name={icon} size={15} />
              <span className={`text-xs ${tool === 'smduct' ? '' : 'hidden 2xl:inline'}`}>{label}</span>
              <kbd className="hidden md:inline text-[9px] opacity-60">{key}</kbd>
            </Button>
          ))}
          <Button variant={autoOpen || autoPreview ? 'default' : 'ghost'} size="sm" className="h-8 px-2" title="Heat load by room and an automatic duct layout" onClick={() => { setSketchTool(null); setPendingPort(null); setAutoOpen(true); }}>
            <ApperIcon name="Sparkles" size={15} />
          </Button>
          <div className="h-6 w-px bg-border mx-0.5" />
          <div className="flex items-center rounded-md border border-border p-0.5">
            {DUCT_TYPES.map((duct, n) => (
              <button
                key={duct.type}
                type="button"
                title={`${duct.label}  ·  ${n + 1}`}
                onClick={() => setDuctType(duct.type)}
                className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] ${ductType === duct.type ? 'bg-primary/15 font-semibold' : 'text-muted-foreground'}`}
              >
                <span className="h-2 w-3.5 rounded-full" style={{ backgroundColor: duct.color, boxShadow: `inset 0 0 0 1px ${duct.edge}` }} />
                {{ supply: 'SA', return: 'RA', flex: 'Flex', exhaust: 'EA', oa: 'OA' }[duct.type] || duct.label}
              </button>
            ))}
          </div>
          {(
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <select
                aria-label="Run material"
                title="Material for new duct runs  ·  G toggles flex / sheet metal"
                value={ductMaterial === 'flex' ? 'flex' : runMaterial}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === 'flex') { setDuctMaterial('flex'); return; }
                  setDuctMaterial('sheet');
                  setRunMaterial(v);
                }}
                className="h-7 rounded-md border border-input bg-background px-1 text-[11px] font-medium text-foreground"
              >
                <option value="flex">Flex</option>
                {Object.entries(SM_MATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className={`flex items-center gap-0.5 ${ductMaterial === 'flex' && sketchTool !== 'smduct' && selectedSketch?.kind !== 'smduct' ? 'invisible' : ''}`}>
              <Input className="h-7 w-14 px-1 text-xs" type="number" min="50" step="25" inputMode="numeric" aria-label="Sheet metal width (mm)" title={runMaterial === 'spiral' ? 'Diameter (mm)' : 'Width (mm)'} value={sheetDims.w} onChange={(event) => setSheetDims((d) => ({ ...d, w: event.target.value }))} />
              {runMaterial !== 'spiral' && (
                <>
                  ×
                  <Input className="h-7 w-14 px-1 text-xs" type="number" min="50" step="25" inputMode="numeric" aria-label="Sheet metal height (mm)" value={sheetDims.h} onChange={(event) => setSheetDims((d) => ({ ...d, h: event.target.value }))} />
                </>
              )}
              {runMaterial === 'spiral' && 'Ø'}
              </span>
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title="Transition: fit one on the open end of the selected run (or add one to drag onto a run end)  ·  X" onClick={() => addTransitionToRun(selectedSketch?.kind === 'smduct' ? selectedSketch : null)}>
            <HvacSymbol type="reducer" size={15} />
            <span className="text-xs hidden xl:inline">Transition</span>
            <kbd className="hidden md:inline text-[9px] opacity-60">X</kbd>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title="End cap: cap the open end(s) of the selected run  ·  E" onClick={() => toggleCaps(selectedSketch)}>
            <ApperIcon name="PanelRightClose" size={15} />
            <span className="text-xs hidden xl:inline">End cap</span>
            <kbd className="hidden md:inline text-[9px] opacity-60">E</kbd>
          </Button>
          {(
            <Button variant="ghost" size="sm" className={`h-8 px-2 ${pendingPort ? '' : 'invisible'}`} tabIndex={pendingPort ? 0 : -1} onClick={() => setPendingPort(null)}>
              <ApperIcon name="X" size={14} />
              <span className="text-xs">Cancel duct</span>
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant={compact ? 'default' : 'ghost'} size="sm" className="h-8 gap-1 px-2" title={`${compact ? 'Show' : 'Hide'} the parts library and side panel  ·  H`} onClick={() => setCompact((c) => !c)}>
              <ApperIcon name={compact ? 'PanelLeftOpen' : 'Maximize2'} size={15} />
              {compact && <span className="text-xs">Show parts</span>}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" title="Keyboard shortcuts  ·  ?" onClick={() => setShowKeys((v) => !v)}>
              <ApperIcon name="Keyboard" size={15} />
            </Button>
          </div>
        </div>
        {(
          <div className={`dp-noprint border-b border-border px-3 py-0.5 text-[11px] text-muted-foreground truncate shrink-0 ${sketchTool || pendingPort ? 'bg-primary/5' : 'bg-card'}`}>
            {!sketchTool && !pendingPort && 'Select: tap a part or run to edit it · Delete removes it · drag to move.'}
            {pendingPort && 'Now tap a port on the component at the other end.'}
            {sketchTool === 'wall' && 'Drag to draw a wall (stays square; Shift for angles). Esc when done.'}
            {sketchTool === 'room' && 'Drag a box over each room. Name it and set its zone in the panel. Esc when done.'}
            {sketchTool === 'text' && 'Tap where the label goes, then type it in the panel.'}
            {sketchTool === 'smduct' && `${SM_MATS[runMaterial]} ${runMaterial === 'spiral' ? `${Number(sheetDims.w) || 300}Ø` : `${Number(sheetDims.w) || 300}×${Number(sheetDims.h) || 150}`} ${AIR_NAME[ductType] || 'supply'} — drag to draw, tap to select; ends snap to run ends, part connections or a run side (branch). Start on a run end to bend. Shift = free angle · Ctrl+drag = disconnect · Esc = done.`}
            {sketchTool === 'callout' && 'Drag from where the arrow points to where the text box goes, then type in the panel.'}
            {sketchTool === 'measure' && (scale || sketch.some((x) => x.kind === 'wall' || x.kind === 'room') ? 'Drag between two points to measure. Esc when done.' : 'Set the scale first so measurements are real metres.')}
            {sketchTool === 'pin' && 'Tap where the note goes, then type it and add a photo in the panel.'}
          </div>
        )}
        <div className="dp-noprint lg:hidden border-b border-border bg-card px-2 py-1 flex gap-3 overflow-x-auto shrink-0">
          {CATALOG.map((group) => (
            <div key={group.group} className="shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{group.group}</div>
              <div className="flex gap-1">
                {group.items.map((tool) => (
                  <Button key={tool.type} variant="outline" size="sm" title={`Add ${tool.label}`} className="h-auto w-[72px] flex-col gap-0.5 px-1 py-1.5 shrink-0 text-[10px] font-normal leading-tight whitespace-normal" onClick={() => addItem(tool.type)}>
                    <HvacSymbol type={tool.type} size={22} />
                    <span className="line-clamp-2 text-center">{tool.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <aside className={`dp-noprint hidden ${compact ? '' : 'lg:flex'} flex-col w-56 shrink-0 border-r border-border bg-card p-2 min-h-0 max-h-[calc(100svh-120px)]`}>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Parts library</div>
          <ComponentList draggable onPick={(type) => addItem(type)} />
          <p className="text-[11px] text-muted-foreground mt-2 shrink-0">Drag a part onto the plan to place it, or right-click the plan to add one right there.</p>
        </aside>
        <main className={`flex-1 p-1 sm:p-1.5 bg-muted/30 min-w-0 dp-print-plan ${printMode === 'pick' ? 'dp-noprint' : ''}`}>
          {autoPreview && (() => {
            const o = autoPreview.options[autoPreview.index];
            const sm = o.summary;
            return (
              <div className="dp-noprint mb-2 rounded-lg border border-primary/50 bg-card p-2 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-md bg-muted p-1">
                    {autoPreview.options.map((opt, i) => (
                      <button
                        key={opt.summary.option}
                        type="button"
                        onClick={() => setAutoPreview((p) => ({ ...p, index: i }))}
                        className={`rounded px-2 py-1 text-xs font-medium ${autoPreview.index === i ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {`Option ${String.fromCharCode(65 + i)} · ${opt.summary.title}`}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAutoPreview(null)}>Cancel</Button>
                    <Button variant="outline" size="sm" onClick={() => { setAutoPreview(null); setAutoOpen(true); }}>Edit rooms</Button>
                    <Button size="sm" onClick={acceptAuto}>
                      <ApperIcon name="Check" size={14} />
                      Select
                    </Button>
                  </div>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {`${sm.newFcu ? 'New ' : ''}unit ${sm.unitKw.toFixed(1)} kW for ${sm.loadKw.toFixed(1)} kW load · ${sm.unitLps} L/s · ${sm.zones} zone${sm.zones === 1 ? '' : 's'} · ${sm.outlets} outlets · ${sm.btos} BTOs · ≈${sm.flexM} m flex · R/A ${sm.grille}`}
                </div>
                {sm.notes.length > 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">{sm.notes.join(' ')}</div>}
              </div>
            );
          })()}
          <div
            ref={canvasRef}
            data-drawing-canvas
            className={`nss h-[62svh] sm:h-[calc(100svh-132px)] min-h-[380px] relative overflow-hidden rounded-lg border border-border bg-muted/40 shadow-sm touch-none select-none ${scaleDraft || sketchTool ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            onContextMenu={openContextMenu}
            onDragOver={(event) => {
              const types = event.dataTransfer.types;
              if (types.includes('text/x-hvac-part') || types.includes('Files')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                if (types.includes('Files') && !planDragOver) setPlanDragOver(true);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setPlanDragOver(false);
            }}
            onDrop={(event) => {
              setPlanDragOver(false);
              const file = event.dataTransfer.files?.[0];
              if (file) {
                event.preventDefault();
                loadPlanFile(file);
                return;
              }
              const type = event.dataTransfer.getData('text/x-hvac-part');
              if (!type) return;
              event.preventDefault();
              addItem(type, toWorld(event.clientX, event.clientY));
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left bg-card shadow-sm"
              style={{ width: WORLD_W, height: WORLD_H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
            >
              {background ? (
                <img src={background} alt="Uploaded plan" draggable={false} className="absolute inset-0 size-full object-contain pointer-events-none select-none" />
              ) : (
                <div
                  className="absolute inset-0 opacity-40 pointer-events-none"
                  style={{
                    backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />
              )}

              {/* zone areas: translucent room colouring, underneath ducts and parts */}
              {items.filter((i) => i.type === 'zonearea').map((item) => {
                const box = itemBox(item, ppm);
                const color = zoneColor(item.spec?.zone) || ZONE_COLORS[0];
                const isSel = selectedId === item.id;
                return (
                  <div
                    key={item.id}
                    aria-label={`${item.spec?.zone || 'Zone'} area`}
                    className="absolute rounded-sm touch-none cursor-move"
                    style={{ left: item.cx - box.w / 2, top: item.cy - box.h / 2, width: box.w, height: box.h, backgroundColor: `${color}33`, border: `${isSel ? 3 : 2}px dashed ${color}` }}
                    onPointerDown={(event) => startItemDrag(event, item)}
                  />
                );
              })}

              <svg className="absolute inset-0" width={WORLD_W} height={WORLD_H} style={{ pointerEvents: 'none', overflow: 'visible' }}>
                {/* auto layout preview (dashed until Select) */}
                {autoPreview && (() => {
                  const o = autoPreview.options[autoPreview.index];
                  const all = Object.fromEntries([...items, ...o.items].map((i) => [i.id, i]));
                  return (
                    <g opacity={0.9}>
                      {o.connections.map((c) => {
                        const a = all[c.from.itemId];
                        const b = all[c.to.itemId];
                        if (!a || !b) return null;
                        const pa = portInfo(a, c.from.portId, ppm);
                        const pb = portInfo(b, c.to.portId, ppm);
                        const pts = routePoints(pa, pa.dir, pb, pb.dir);
                        return (
                          <polyline
                            key={c.id}
                            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke={c.type === 'return' ? '#dc2626' : sizeColor(c.size)}
                            strokeWidth={Math.max(3, (c.size / 1000) * ppm * 0.6)}
                            strokeDasharray="8 5"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                      {o.items.map((it) => {
                        const b = itemBox(it, ppm);
                        const tool = getTool(it.type);
                        const round = it.type === 'supply';
                        return (
                          <g key={it.id}>
                            {round
                              ? <circle cx={it.cx} cy={it.cy} r={b.w / 2} fill="#7c3aed22" stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 3" />
                              : <rect x={it.cx - b.w / 2} y={it.cy - b.h / 2} width={b.w} height={b.h} rx={3} fill="#7c3aed22" stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 3" />}
                            <text x={it.cx} y={it.cy + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="#5b21b6" stroke="#fff" strokeWidth={3} paintOrder="stroke">{tool?.tag || ''}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
                {/* free sketch: walls, rooms and text */}
                {sketch.map((s) => {
                  const sel = selectedSketchId === s.id;
                  const col = sel ? '#2563eb' : '#111827';
                  const live = sketchTool || scaleDraft ? 'none' : undefined;
                  if (s.kind === 'wall') {
                    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / ppm;
                    return (
                      <g key={s.id}>
                        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={16} style={{ pointerEvents: live || 'stroke', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)} />
                        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col} strokeWidth={5} strokeLinecap="square" />
                        {sel && (
                          <text x={(s.x1 + s.x2) / 2} y={(s.y1 + s.y2) / 2 - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#2563eb" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${fmtM(len)} m`}</text>
                        )}
                      </g>
                    );
                  }
                  if (s.kind === 'dim') {
                    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
                    const ux = len ? (s.x2 - s.x1) / len : 1;
                    const uy = len ? (s.y2 - s.y1) / len : 0;
                    const t = 7 * Math.min(inv, 2.5);
                    let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
                    if (ang > 90 || ang < -90) ang += 180;
                    const mx = (s.x1 + s.x2) / 2;
                    const my = (s.y1 + s.y2) / 2;
                    const dc = sel ? '#2563eb' : '#7c3aed';
                    return (
                      <g key={s.id}>
                        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={14} style={{ pointerEvents: live || 'stroke', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)} />
                        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={dc} strokeWidth={1.5} />
                        {[[s.x1, s.y1], [s.x2, s.y2]].map(([x, y], i) => (
                          <line key={i} x1={x - uy * t} y1={y + ux * t} x2={x + uy * t} y2={y - ux * t} stroke={dc} strokeWidth={1.5} />
                        ))}
                        <text x={mx} y={my - 4} transform={`rotate(${ang} ${mx} ${my})`} textAnchor="middle" fontSize={11 * Math.min(inv, 2.5)} fontWeight="700" fill={dc} stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{`${(len / ppm).toFixed(2)} m`}</text>
                      </g>
                    );
                  }
                  if (s.kind === 'pin') {
                    const k = Math.min(inv, 2.5);
                    return (
                      <g key={s.id} transform={`translate(${s.x1} ${s.y1}) scale(${k})`} style={{ pointerEvents: live || 'all', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)}>
                        <path d="M0 0 L-9 -16 A10 10 0 1 1 9 -16 Z" fill={sel ? '#2563eb' : '#e11d48'} stroke="#fff" strokeWidth={2} />
                        <text x={0} y={-17} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="800" fill="#fff">{pinNo[s.id]}</text>
                        {s.photo && <circle cx={10} cy={-28} r={4.5} fill="#facc15" stroke="#fff" strokeWidth={1.5} />}
                      </g>
                    );
                  }
                  if (s.kind === 'smduct' && s.pts?.length > 1) {
                    const P = smPts(s, smCtx);
                    const mm = ppm / 1000;
                    const lay = smLayout(P, s, mm);
                    const dw = lay.W;
                    const hw = dw / 2;
                    const dpath = lay.d;
                    const seg = longestSeg(P);
                    let ang = seg.ang ?? 0;
                    if (ang > 90 || ang < -90) ang += 180;
                    const lenM = smLenOf(P) / ppm;
                    const mat = smMat(s);
                    const edge = sel ? '#2563eb' : mat === 'board' ? '#92400e' : (CASING[s.air] || CASING.supply);
                    const fillC = mat === 'board' ? '#fef3c7' : mat === 'spiral' ? '#e2e8f0' : (SM_FILL[s.air] || SM_FILL.supply);
                    const k = Math.min(inv, 2.5);
                    // TDF flange joints every sheet length, restarting on each straight between bends.
                    const ticks = [];
                    const sheetW = (Number(s.sheetLen) || SM_DEFAULT_SHEET) * mm;
                    const seams = [];
                    if (mat === 'spiral') {
                      // Spiral lock-seam: short diagonal lines every 150 mm.
                      const st = Math.max(3, 150 * mm);
                      lay.segs.forEach((g) => {
                        const { u } = g;
                        for (let at = g.from + st / 2; at < g.to; at += st) {
                          const cx = g.a.x + u.x * at;
                          const cy = g.a.y + u.y * at;
                          seams.push(`M${cx - u.y * hw - u.x * hw * 0.35},${cy + u.x * hw - u.y * hw * 0.35} L${cx + u.y * hw + u.x * hw * 0.35},${cy - u.x * hw + u.y * hw * 0.35}`);
                        }
                      });
                    }
                    if (scale && sheetW > 2 && mat === 'sheet') {
                      const ov = Math.max(1.2, 35 * mm);
                      const gap = Math.max(0.8, 20 * mm);
                      lay.segs.forEach((g) => {
                        const { u } = g;
                        for (let at = g.from + sheetW; at < g.to - 1; at += sheetW) {
                          [0, gap].forEach((o) => {
                            const cx = g.a.x + u.x * (at + o);
                            const cy = g.a.y + u.y * (at + o);
                            ticks.push(`M${cx - u.y * (hw + ov)},${cy + u.x * (hw + ov)} L${cx + u.y * (hw + ov)},${cy - u.x * (hw + ov)}`);
                          });
                        }
                      });
                    }
                    // Turning vanes: across the mitre on square bends, as arcs on radius bends.
                    const vanes = [];
                    const nV = smVaneCount(s);
                    const fr = nV === 2 ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75];
                    lay.bends.forEach((b) => {
                      const { v, u1, u2 } = b;
                      if (b.radius) {
                        const throat = b.R - hw;
                        if (b.deg < 67.5 || !nV || throat < 0.5) return;
                        for (let j = 1; j <= nV; j += 1) {
                          const r = throat + (dw * j) / (nV + 1);
                          const f = r / b.R;
                          const p1 = { x: b.c.x + (b.st.x - b.c.x) * f, y: b.c.y + (b.st.y - b.c.y) * f };
                          const p2 = { x: b.c.x + (b.en.x - b.c.x) * f, y: b.c.y + (b.en.y - b.c.y) * f };
                          vanes.push(`M${p1.x},${p1.y} A${r},${r} 0 0 ${b.sweep} ${p2.x},${p2.y}`);
                        }
                        return;
                      }
                      if (Math.abs(u1.x * u2.x + u1.y * u2.y) > 0.2) return; // 45s: no vanes
                      const c1 = { x: v.x + (u2.x - u1.x) * hw, y: v.y + (u2.y - u1.y) * hw };
                      const c2 = { x: v.x - (u2.x - u1.x) * hw, y: v.y - (u2.y - u1.y) * hw };
                      const r = hw * 0.32;
                      if (nV) fr.forEach((f) => {
                        const cx = c1.x + (c2.x - c1.x) * f;
                        const cy = c1.y + (c2.y - c1.y) * f;
                        vanes.push(`M${cx - u1.x * r},${cy - u1.y * r} Q${cx},${cy} ${cx + u2.x * r},${cy + u2.y * r}`);
                      });
                      vanes.push(`M${c1.x},${c1.y} L${c2.x},${c2.y}`);
                    });
                    const fits = smEndFittings(s, smCtx);
                    return (
                      <g key={s.id}>
                        <path d={dpath} fill="none" stroke="transparent" strokeWidth={Math.max(22 * inv, dw + 12 * inv)} strokeLinejoin="miter" style={{ pointerEvents: live || 'stroke', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)} onDoubleClick={(event) => { event.stopPropagation(); addSmPoint(s, toWorld(event.clientX, event.clientY)); }} />
                        <path d={dpath} fill="none" stroke={edge} strokeWidth={dw} strokeLinejoin="miter" strokeMiterlimit={4} strokeLinecap="butt" style={{ pointerEvents: 'none' }} />
                        <path d={dpath} fill="none" stroke={fillC} strokeWidth={Math.max(1, dw - 2.5)} strokeLinejoin="miter" strokeMiterlimit={4} strokeLinecap="butt" style={{ pointerEvents: 'none' }} />
                        {mat === 'board' && dw - 2 * BOARD_MM * mm > 3 && (
                          <>
                            <path d={dpath} fill="none" stroke={edge} strokeWidth={dw - 2 * BOARD_MM * mm} strokeLinejoin="miter" strokeMiterlimit={4} strokeLinecap="butt" style={{ pointerEvents: 'none' }} />
                            <path d={dpath} fill="none" stroke="#ffffff" strokeWidth={Math.max(1, dw - 2 * BOARD_MM * mm - 1.6)} strokeLinejoin="miter" strokeMiterlimit={4} strokeLinecap="butt" style={{ pointerEvents: 'none' }} />
                          </>
                        )}
                        <path d={dpath} fill="none" stroke={edge} strokeOpacity={0.45} strokeWidth={0.8} strokeDasharray={mat === 'spiral' ? '14 4 2 4' : '6 4'} style={{ pointerEvents: 'none' }} />
                        {seams.length > 0 && <path d={seams.join(' ')} fill="none" stroke={edge} strokeOpacity={0.55} strokeWidth={0.8} style={{ pointerEvents: 'none' }} />}
                        {ticks.length > 0 && <path d={ticks.join(' ')} fill="none" stroke={edge} strokeWidth={1.4} style={{ pointerEvents: 'none' }} />}
                        {[[0, 1, s.capA && !s.a], [P.length - 1, P.length - 2, s.capB && !s.b]].map(([i, j, on]) => {
                          if (!on || !P[j]) return null;
                          const L = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) || 1;
                          const u = { x: (P[i].x - P[j].x) / L, y: (P[i].y - P[j].y) / L };
                          const t = Math.max(2, 40 * mm);
                          const c = { x: P[i].x - u.x * t / 2, y: P[i].y - u.y * t / 2 };
                          return (
                            <g key={`cap${i}`} style={{ pointerEvents: 'none' }}>
                              <line x1={c.x - u.y * (hw + 1)} y1={c.y + u.x * (hw + 1)} x2={c.x + u.y * (hw + 1)} y2={c.y - u.x * (hw + 1)} stroke={edge} strokeWidth={t} />
                              <line x1={P[i].x - u.y * hw * 0.6} y1={P[i].y + u.x * hw * 0.6} x2={P[i].x + u.y * hw * 0.6} y2={P[i].y - u.x * hw * 0.6} stroke="#fff" strokeWidth={Math.max(0.6, t * 0.25)} />
                            </g>
                          );
                        })}
                        {vanes.length > 0 && <path d={vanes.join(' ')} fill="none" stroke={edge} strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                        {fits.filter((f) => f.type !== 'bend').map((f, i) => {
                          const n = { x: -f.u.y, y: f.u.x };
                          const wA = Math.max(3, f.from.w * mm) / 2;
                          const wB = dw / 2;
                          if (f.type === 'bto') {
                            // Shoe: flared collar where the branch leaves the main.
                            const L = Math.max(4, 120 * mm);
                            const flare = wB + Math.max(2, 75 * mm);
                            const q = `${f.at.x + n.x * flare},${f.at.y + n.y * flare} ${f.at.x - n.x * flare},${f.at.y - n.y * flare} ${f.at.x + f.u.x * L - n.x * wB},${f.at.y + f.u.y * L - n.y * wB} ${f.at.x + f.u.x * L + n.x * wB},${f.at.y + f.u.y * L + n.y * wB}`;
                            return <polygon key={i} points={q} fill={fillC} stroke={edge} strokeWidth={1.4} style={{ pointerEvents: 'none' }} />;
                          }
                          const L = Math.max(5, (f.lenMm || Math.max(250, Math.abs(f.from.w - f.to.w) * 1.2)) * mm);
                          const o = { x: f.at.x - (f.shift?.x || 0), y: f.at.y - (f.shift?.y || 0) };
                          const q = `${o.x + n.x * wA},${o.y + n.y * wA} ${o.x - n.x * wA},${o.y - n.y * wA} ${f.at.x + f.u.x * L - n.x * wB},${f.at.y + f.u.y * L - n.y * wB} ${f.at.x + f.u.x * L + n.x * wB},${f.at.y + f.u.y * L + n.y * wB}`;
                          let ta = (Math.atan2(f.u.y, f.u.x) * 180) / Math.PI;
                          if (ta > 90 || ta < -90) ta += 180;
                          const tx = f.at.x + f.u.x * (L / 2);
                          const ty = f.at.y + f.u.y * (L / 2);
                          return (
                            <g key={i} style={{ pointerEvents: 'none' }}>
                              <polygon points={q} fill="#ffffff" stroke={edge} strokeWidth={1.4} />
                              {f.type === 'transition' && scale && (
                                <text x={tx} y={ty} transform={`rotate(${ta} ${tx} ${ty})`} dy={Math.max(wA, wB) + 11 * k} textAnchor="middle" fontSize={8.5 * k} fontWeight="600" fill={edge} stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
                                  {`${f.from.w}/${f.from.h} → ${f.to.w}/${f.to.h}`}
                                </text>
                              )}
                              {f.type === 'sq2round' && <line x1={f.at.x + n.x * wA} y1={f.at.y + n.y * wA} x2={f.at.x + f.u.x * L + n.x * wB} y2={f.at.y + f.u.y * L + n.y * wB} stroke={edge} strokeWidth={0.6} strokeDasharray="2 2" />}
                            </g>
                          );
                        })}
                        {seg.x != null && (
                          <text x={seg.x} y={seg.y} transform={`rotate(${ang} ${seg.x} ${seg.y})`} dy={-(hw + 4)} textAnchor="middle" fontSize={10 * k} fontWeight="700" fill={edge} stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                            {`${DUCT_PREFIX[s.air] || ''}${mat === 'spiral' ? `${smDims(s).w}Ø SPIRAL` : `${smDims(s).w}/${smDims(s).h}${mat === 'board' ? ' DB' : ''}`}${scale || sketch.length ? ` · ${fmtM(lenM)}m` : ''}`}
                          </text>
                        )}
                        {seg.x != null && (String(s.ls || '').trim() || String(s.elev || '').trim()) && (
                          <text x={seg.x} y={seg.y} transform={`rotate(${ang} ${seg.x} ${seg.y})`} dy={hw + 11 * k} textAnchor="middle" fontSize={9.5 * k} fontWeight="600" fill={edge} stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                            {[String(s.ls || '').trim() && `${String(s.ls).trim()} L/s`, String(s.elev || '').trim()].filter(Boolean).join(' · ')}
                          </text>
                        )}
                        {sketchTool === 'smduct' && !sel && [[P[0], s.a], [P[P.length - 1], s.b]].map(([q, link], i) => (
                          <circle key={i} cx={q.x} cy={q.y} r={4 * k} fill={link ? '#16a34a' : '#fff'} stroke={link ? '#14532d' : '#2563eb'} strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
                        ))}
                        {sel && P.map((q, i) => {
                          const end = i === 0 ? s.a : i === P.length - 1 ? s.b : null;
                          return (
                            <rect
                              key={i}
                              x={q.x - 5 * k}
                              y={q.y - 5 * k}
                              width={10 * k}
                              height={10 * k}
                              rx={i === 0 || i === P.length - 1 ? 5 * k : 1.5 * k}
                              fill={end ? '#16a34a' : '#ffffff'}
                              stroke={end ? '#14532d' : '#2563eb'}
                              strokeWidth={1.5}
                              style={{ pointerEvents: live || 'all', cursor: 'grab' }}
                              onPointerDown={(event) => startSmPoint(event, s, i)}
                              onDoubleClick={(event) => { event.stopPropagation(); removeSmPoint(s, i); }}
                            />
                          );
                        })}
                      </g>
                    );
                  }
                  if (s.kind === 'callout') {
                    const fsz = (s.size || 14) * Math.min(inv, 2.5);
                    const lines = String(s.text || '').split('\n');
                    const tw = Math.max(...lines.map((ln) => ln.length), 4) * fsz * 0.58 + fsz;
                    const th = lines.length * fsz * 1.25 + fsz * 0.6;
                    const bx = s.x2 - tw / 2;
                    const by = s.y2 - th / 2;
                    const ux = s.x1 - s.x2;
                    const uy = s.y1 - s.y2;
                    const ul = Math.hypot(ux, uy) || 1;
                    const ah = fsz * 0.8;
                    const nx = ux / ul;
                    const ny = uy / ul;
                    const head = `${s.x1},${s.y1} ${s.x1 - nx * ah - ny * ah * 0.5},${s.y1 - ny * ah + nx * ah * 0.5} ${s.x1 - nx * ah + ny * ah * 0.5},${s.y1 - ny * ah - nx * ah * 0.5}`;
                    return (
                      <g key={s.id} style={{ pointerEvents: live || 'all', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)}>
                        <line x1={s.x2} y1={s.y2} x2={s.x1} y2={s.y1} stroke="transparent" strokeWidth={14} />
                        <line x1={s.x2} y1={s.y2} x2={s.x1 - nx * ah * 0.6} y2={s.y1 - ny * ah * 0.6} stroke={col} strokeWidth={1.6} />
                        <polygon points={head} fill={col} />
                        <rect x={bx} y={by} width={tw} height={th} rx={3} fill="#ffffff" stroke={col} strokeWidth={1.4} />
                        <text x={s.x2} y={by + fsz * 0.3} textAnchor="middle" fontSize={fsz} fontWeight="600" fill={col}>
                          {lines.map((ln, i) => <tspan key={i} x={s.x2} dy={fsz * 1.25}>{ln || ' '}</tspan>)}
                        </text>
                      </g>
                    );
                  }
                  if (s.kind === 'room') {
                    const w = s.x2 - s.x1;
                    const h = s.y2 - s.y1;
                    return (
                      <g key={s.id}>
                        <rect x={s.x1} y={s.y1} width={w} height={h} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: live || 'stroke', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)} />
                        <rect x={s.x1} y={s.y1} width={w} height={h} fill="none" stroke={col} strokeWidth={4} />
                        <text x={s.x1 + w / 2} y={s.y1 + h / 2} textAnchor="middle" fontSize="14" fontWeight="700" fill={col} stroke="#fff" strokeWidth={3} paintOrder="stroke">{s.name || ''}</text>
                        <text x={s.x1 + w / 2} y={s.y1 + h / 2 + 16} textAnchor="middle" fontSize="11" fill="#475569" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${fmtM(w / ppm)} × ${fmtM(h / ppm)} m${showLoads ? ` · ≈${roomLoadKw((w / ppm) * (h / ppm), s).toFixed(1)} kW` : ''}`}</text>
                      </g>
                    );
                  }
                  return (
                    <text key={s.id} x={s.x1} y={s.y1} fontSize={s.size || 16} fontWeight="700" fill={col} stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: live || 'all', cursor: 'move' }} onPointerDown={(event) => startSketchMove(event, s)}>
                      {s.text}
                    </text>
                  );
                })}
                {/* Flexible canvas connections either side of inline fans fitted in a run */}
                {items.filter((it) => it.type === 'exhfan' && it.onRun && it.canvas !== false).map((it) => {
                  const run = sketch.find((x) => x.id === it.onRun.id);
                  if (!run) return null;
                  const mm = ppm / 1000;
                  const box = itemBox(it, ppm);
                  const horiz = ((it.rot || 0) / 90) % 2 === 0;
                  const half = (horiz ? box.w : box.h) / 2;
                  const L = Math.max(3, 150 * mm);
                  const W = Math.max(4, smDims(run).w * mm);
                  return [-1, 1].map((sgn) => {
                    const c = horiz ? { x: it.cx + sgn * (half + L / 2), y: it.cy } : { x: it.cx, y: it.cy + sgn * (half + L / 2) };
                    const w = horiz ? L : W;
                    const h = horiz ? W : L;
                    const zig = [];
                    for (let k2 = 0; k2 <= 6; k2 += 1) {
                      const f = k2 / 6;
                      zig.push(horiz ? `${c.x - w / 2 + (k2 % 2 ? w : 0)},${c.y - h / 2 + h * f}` : `${c.x - w / 2 + w * f},${c.y - h / 2 + (k2 % 2 ? h : 0)}`);
                    }
                    return (
                      <g key={`${it.id}${sgn}`} style={{ pointerEvents: 'none' }}>
                        <rect x={c.x - w / 2} y={c.y - h / 2} width={w} height={h} fill="#fff7ed" stroke="#7c2d12" strokeWidth={1} />
                        <polyline points={zig.join(' ')} fill="none" stroke="#7c2d12" strokeWidth={0.7} />
                      </g>
                    );
                  });
                })}
                {sketchDraft && (() => {
                  const d = sketchDraft;
                  const s = Math.min(inv, 3);
                  if (d.kind === 'smduct') {
                    const dw = Math.max(3, ((Number(sheetDims.w) || 300) / 1000) * ppm);
                    const ring = (t, key) => t && (
                      <g key={key}>
                        <circle cx={t.x} cy={t.y} r={9 * s} fill="none" stroke="#16a34a" strokeWidth={2.5} />
                        <text x={t.x + 12 * s} y={t.y - 10 * s} fontSize={11 * s} fontWeight="700" fill="#15803d" stroke="#fff" strokeWidth={3} paintOrder="stroke">{t.kind === 'side' ? 'Branch' : t.kind === 'port' ? 'Connect' : 'Join'}</text>
                      </g>
                    );
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#2563eb" strokeOpacity={0.35} strokeWidth={dw} strokeLinecap="butt" />
                        <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="10 6" />
                        {ring(d.snapA, 'a')}
                        {ring(d.snapB, 'b')}
                        <text x={d.x2 + 8 * s} y={d.y2 + 16 * s} fontSize={13 * s} fontWeight="700" fill="#2563eb" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${fmtM(Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / ppm)} m`}</text>
                      </g>
                    );
                  }
                  if (d.kind === 'room') {
                    const x = Math.min(d.x1, d.x2);
                    const y = Math.min(d.y1, d.y2);
                    const w = Math.abs(d.x2 - d.x1);
                    const h = Math.abs(d.y2 - d.y1);
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={x} y={y} width={w} height={h} fill="#2563eb" fillOpacity={0.08} stroke="#2563eb" strokeWidth={3} strokeDasharray="8 5" />
                        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={13 * s} fontWeight="700" fill="#2563eb" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${fmtM(w / ppm)} × ${fmtM(h / ppm)} m`}</text>
                      </g>
                    );
                  }
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#2563eb" strokeWidth={5} strokeDasharray="10 6" strokeLinecap="square" />
                      <text x={d.x2 + 8 * s} y={d.y2 - 8 * s} fontSize={13 * s} fontWeight="700" fill="#2563eb" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${fmtM(Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / ppm)} m`}</text>
                    </g>
                  );
                })()}
                {showLabels && items.map((item) => {
                  if (!item.label) return null;
                  const box = itemBox(item, ppm);
                  const off = item.label;
                  if (Math.abs(off.dx) < box.w / 2 + 6 && Math.abs(off.dy) < box.h / 2 + 16) return null;
                  return (
                    <line key={`${item.id}-leader`} x1={item.cx} y1={item.cy} x2={item.cx + off.dx} y2={item.cy + off.dy} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 2" />
                  );
                })}

                {runs.map(({ conn, a, b, pts, metres, mismatch }) => {
                  if (!inView(conn)) return null;
                  if (isService(conn)) {
                    const dp = roundedPath(pts, 6);
                    const isSel = selectedConnId === conn.id;
                    const pipe = conn.type === 'pipe';
                    const power = conn.type === 'power';
                    const trunked = pipe && conn.trunking && conn.trunking !== 'None';
                    const seg = longestSeg(pts);
                    const what = pipe ? coilShort(pipeCoil(conn).idx) : power ? (conn.cable || cableFor(conn.breaker || BREAKERS[1])).split(' ')[0] : 'Drain';
                    const len = metres == null ? '' : power ? ` ≈${approxCable(metres)}m` : ` ${fmtM(metres)}m`;
                    const text = `${conn.remove ? 'REMOVE ' : conn.existing ? 'EX ' : ''}${what}${len}${trunked ? ' T' : ''}`;
                    return (
                      <g key={conn.id} opacity={conn.remove ? 0.55 : conn.existing ? 0.6 : 1}>
                        <path d={dp} fill="none" stroke="transparent" strokeWidth={18} style={{ pointerEvents: scaleDraft ? 'none' : 'stroke', cursor: 'pointer' }} onPointerDown={(event) => { if (fingerOnly(event)) return; event.stopPropagation(); setSelectedConnId(conn.id); setSelectedId(null); setPendingPort(null); }} />
                        {isSel && <path d={dp} fill="none" stroke="var(--primary)" strokeOpacity={0.3} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />}
                        {trunked && <path d={dp} fill="none" stroke="#64748b" strokeOpacity={0.35} strokeWidth={14} strokeLinejoin="round" />}
                        {pipe ? (
                          <>
                            <path d={dp} fill="none" stroke="#7c2d12" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                            <path d={dp} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </>
                        ) : power ? (
                          <path d={dp} fill="none" stroke="#9f1239" strokeWidth={2.5} strokeDasharray="12 3 2 3" strokeLinecap="round" strokeLinejoin="round" />
                        ) : (
                          <path d={dp} fill="none" stroke="#0284c7" strokeWidth={3} strokeDasharray="7 4" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {conn.remove && <path d={dp} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="3 5" />}
                        {seg.len > 24 && (
                          <text x={seg.x} y={seg.y - 7} transform={`rotate(${seg.ang} ${seg.x} ${seg.y})`} textAnchor="middle" fontSize="9" fontWeight="700" fill={pipe ? '#7c2d12' : power ? '#9f1239' : '#0369a1'} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{text}</text>
                        )}
                      </g>
                    );
                  }
                  const d = roundedPath(pts, scale && isSheet(conn) ? 0 : conn.bends?.length ? 6 : 10);
                  const size = conn.size || getDuct(conn.type).defaultSize;
                  const st = statusOf(conn);
                  const sm = isSheet(conn);
                  const fill = st !== 'new' ? '#e2e8f0' : sm ? '#cbd5e1' : sizeColor(size);
                  const casing = st === 'new' ? (sm ? '#334155' : (CASING[conn.type] || CASING.supply)) : st === 'remove' ? '#dc2626' : '#475569';
                  // Once the plan scale is set, ducts draw at their true width (outer edge = real duct size).
                  const trueW = ((isRect(conn) ? Number(conn.w) || 300 : size) / 1000) * ppm;
                  const toScale = !!scale;
                  const w = toScale ? Math.max(2, trueW) : clamp(trueW, 5, 60);
                  const squareEnds = toScale && sm;
                  const isSelected = selectedConnId === conn.id;
                  // Stamp size (and length) along the longest straight of the run
                  let seg = { len: -1, x: 0, y: 0, ang: 0 };
                  for (let i = 1; i < pts.length; i += 1) {
                    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                    if (len > seg.len) seg = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2, ang: (Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x) * 180) / Math.PI };
                  }
                  if (seg.ang > 90 || seg.ang < -90) seg.ang += 180;
                  const stamp = `${st === 'remove' ? 'REMOVE ' : st === 'existing' ? 'EX ' : ''}${mismatch.length ? '! ' : ''}${DUCT_PREFIX[conn.type] || ''}${sm ? `SM ${isRect(conn) ? `${Number(conn.w) || 300}×${Number(conn.h) || 150}` : `${size}Ø`}` : `${size}Ø`}${metres != null ? ` ${fmtM(metres)}m` : ''}`;
                  const fs = clamp(w * 0.8, 8, 12);
                  return (
                    <g key={conn.id} opacity={st === 'remove' ? 0.7 : 1}>
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(20, w + 10)}
                        style={{ pointerEvents: scaleDraft ? 'none' : 'stroke', cursor: 'pointer' }}
                        onPointerDown={(event) => {
                          if (fingerOnly(event)) return;
                          event.stopPropagation();
                          setSelectedConnId(conn.id);
                          setSelectedId(null);
                          setPendingPort(null);
                        }}
                      />
                      {isSelected && (
                        <path d={d} fill="none" stroke="var(--primary)" strokeOpacity={0.3} strokeWidth={w + 12} strokeLinecap="round" strokeLinejoin="round" />
                      )}
                      <path d={d} fill="none" stroke={casing} strokeWidth={toScale ? w : w + 3} strokeLinecap={st === 'new' && !squareEnds ? 'round' : 'butt'} strokeLinejoin={squareEnds ? 'miter' : 'round'} strokeDasharray={st === 'new' ? undefined : `${Math.max(7, w * 0.9)} ${Math.max(5, w * 0.6)}`} />
                      <path d={d} fill="none" stroke={fill} strokeWidth={toScale ? Math.max(1, w - 2) : w} strokeLinecap={squareEnds ? 'butt' : 'round'} strokeLinejoin={squareEnds ? 'miter' : 'round'} />
                      {st === 'remove' && <path d={d} fill="none" stroke="#dc2626" strokeWidth={Math.max(1.5, w * 0.18)} strokeDasharray={`${Math.max(4, w * 0.5)} ${Math.max(4, w * 0.5)}`} />}
                      {st === 'new' && sm && (
                        <path d={d} fill="none" stroke="#64748b" strokeOpacity={0.6} strokeWidth={1} strokeDasharray={`${Math.max(6, w * 0.4)} ${Math.max(4, w * 0.25)}`} />
                      )}
                      {st === 'new' && !sm && conn.type === 'flex' && (
                        <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={w * 0.5} strokeDasharray={`${w * 0.25} ${w * 0.45}`} />
                      )}
                      <circle cx={a.x} cy={a.y} r={3.5} fill="#ffffff" stroke={casing} strokeWidth={1.5} />
                      <circle cx={b.x} cy={b.y} r={3.5} fill="#ffffff" stroke={casing} strokeWidth={1.5} />
                      {seg.len > 24 && (
                        <text
                          x={seg.x}
                          y={seg.y}
                          transform={`rotate(${seg.ang} ${seg.x} ${seg.y})`}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={fs}
                          fontWeight="700"
                          fill={mismatch.length ? '#b45309' : '#0f172a'}
                          stroke="#ffffff"
                          strokeWidth={3}
                          paintOrder="stroke"
                          style={{ pointerEvents: 'none' }}
                        >
                          {stamp}
                        </text>
                      )}
                    </g>
                  );
                })}

                {pendingPort && (() => {
                  const item = items.find((entry) => entry.id === pendingPort.itemId);
                  if (!item) return null;
                  const p = portPosition(item, pendingPort.portId, ppm);
                  return <circle cx={p.x} cy={p.y} r={9 * Math.min(inv, 3)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="3 3" />;
                })()}

                {/* BTO / DBTO: size and airflow arrow on each open end until it's connected */}
                {items.filter((it) => (it.type === 'bto' || it.type === 'dbto') && inView(it)).flatMap((it) => portDefs(it).map((d) => {
                  if (usedPorts.has(portKey(it.id, d.id))) return null;
                  const p = portInfo(it, d.id, ppm);
                  const [ux, uy] = DIRS[p.dir] || [0, 0];
                  const mm = portSizeMm(it, d.id);
                  const inlet = d.id === 'w';
                  const k = Math.min(inv, 2.5);
                  const g = 5 * k;
                  const L = 15 * k;
                  const near = { x: p.x + ux * g, y: p.y + uy * g };
                  const far = { x: p.x + ux * (g + L), y: p.y + uy * (g + L) };
                  const tip = inlet ? near : far;
                  const tail = inlet ? far : near;
                  const vx = inlet ? -ux : ux;
                  const vy = inlet ? -uy : uy;
                  const h = 5 * k;
                  const col = inlet ? '#15803d' : '#1d4ed8';
                  const lx = p.x + ux * (g + L + 10 * k);
                  const ly = p.y + uy * (g + L + 10 * k);
                  return (
                    <g key={`${it.id}-${d.id}-flow`} style={{ pointerEvents: 'none' }}>
                      <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke="#fff" strokeWidth={5 * k} strokeLinecap="round" />
                      <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke={col} strokeWidth={2.2 * k} strokeLinecap="round" />
                      <path d={`M${tip.x} ${tip.y} L${tip.x - vx * h - vy * h * 0.7} ${tip.y - vy * h + vx * h * 0.7} L${tip.x - vx * h + vy * h * 0.7} ${tip.y - vy * h - vx * h * 0.7} Z`} fill={col} stroke="#fff" strokeWidth={1 * k} paintOrder="stroke" />
                      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={10 * k} fontWeight="800" fill={col} stroke="#fff" strokeWidth={3 * k} paintOrder="stroke">{`${mm ? `${Math.round(mm / 25)}"` : ''}${inlet ? ' IN' : ''}`}</text>
                    </g>
                  );
                }))}

                {wire && (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2} stroke="var(--primary)" strokeWidth={3 * Math.min(inv, 3)} strokeDasharray={`${8 * Math.min(inv, 3)} ${5 * Math.min(inv, 3)}`} strokeLinecap="round" />
                    {wire.snapped && <circle cx={wire.x2} cy={wire.y2} r={10 * Math.min(inv, 3)} fill="var(--primary)" fillOpacity={0.25} stroke="var(--primary)" strokeWidth={2 * Math.min(inv, 3)} />}
                  </g>
                )}

                {scaleDraft?.a && (
                  <g>
                    {scaleDraft.b && (
                      <line x1={scaleDraft.a.x} y1={scaleDraft.a.y} x2={scaleDraft.b.x} y2={scaleDraft.b.y} stroke="#2563eb" strokeWidth={2 * inv} strokeDasharray={`${6 * inv} ${4 * inv}`} />
                    )}
                    <circle cx={scaleDraft.a.x} cy={scaleDraft.a.y} r={6 * inv} fill="#2563eb" stroke="#fff" strokeWidth={2 * inv} />
                    {scaleDraft.b && <circle cx={scaleDraft.b.x} cy={scaleDraft.b.y} r={6 * inv} fill="#2563eb" stroke="#fff" strokeWidth={2 * inv} />}
                  </g>
                )}
              </svg>

              {items.map((item) => {
                const tool = getTool(item.type);
                const isSel = selectedId === item.id;
                const box = itemBox(item, ppm);
                if (item.type === 'zonearea' || !inView(item)) return null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={`${tags[item.id]} · ${tool.label}`}
                    aria-label={`${tags[item.id]} ${tool.label}`}
                    className={`absolute rounded-sm touch-none transition-shadow bg-white/85 ${item.remove ? 'opacity-55 grayscale outline-2 outline-dashed outline-red-600' : item.existing ? 'opacity-65 grayscale outline-2 outline-dashed outline-slate-500' : ''} shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_1px_4px_rgba(0,0,0,0.35)] ${isSel ? 'ring-2 ring-primary ring-offset-1 ring-offset-transparent' : 'hover:ring-1 hover:ring-primary/40'}`}
                    style={{ left: item.cx - box.w / 2, top: item.cy - box.h / 2, width: box.w, height: box.h }}
                    onPointerDown={(event) => startItemDrag(event, item)}
                  >
                    <span
                      className="sym absolute flex"
                      style={{
                        left: (box.w - box.uw) / 2,
                        top: (box.h - box.uh) / 2,
                        width: box.uw,
                        height: box.uh,
                        transform: `rotate(${item.rot || 0}deg)`,
                      }}
                    >
                      {renderSymbol(item, box)}
                    </span>
                    {item.remove && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 10 10" preserveAspectRatio="none">
                        <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="#dc2626" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      </svg>
                    )}
                  </button>
                );
              })}

              {/* joint markers where parts are joined directly */}
              {joins.map((j) => {
                const a = items.find((i) => i.id === j.a.itemId);
                if (!a) return null;
                const p = portPosition(a, j.a.portId, ppm);
                return (
                  <span
                    key={j.id}
                    className="absolute pointer-events-none rounded-full bg-card border-2 border-foreground/70"
                    style={{ left: p.x, top: p.y, width: 7, height: 7, transform: `translate(-50%, -50%) scale(${Math.min(inv, 2.5)})` }}
                  />
                );
              })}

              {showLabels && items.map((item) => {
                if (!inView(item)) return null;
                const sub = shortSpec(item);
                const box = itemBox(item, ppm);
                const off = labelOffset(item, box);
                const isSel = selectedId === item.id;
                return (
                  <div
                    key={`${item.id}-tag`}
                    title="Drag to move this label"
                    className={`absolute whitespace-nowrap touch-none cursor-move text-[9px] leading-none font-bold tracking-wide ${isSel ? 'text-primary' : 'text-slate-900'}`}
                    style={{ left: item.cx + off.dx, top: item.cy + off.dy, transform: 'translate(-50%, -50%)', textShadow: '0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff' }}
                    onPointerDown={(event) => startLabelDrag(event, item)}
                  >
                    {item.type === 'zonearea' ? (
                      <span className="text-[11px]" style={{ color: zoneColor(item.spec?.zone) || undefined }}>
                        {`${item.spec?.zone || 'Zone'}${item.room ? ` · ${item.room}` : ''}`}
                      </span>
                    ) : (
                      <>
                        {zoneColor(item.spec?.zone) && <span className="inline-block size-2 rounded-full mr-0.5 align-middle" style={{ backgroundColor: zoneColor(item.spec.zone) }} />}
                        {item.remove ? <span className="text-red-600">RM </span> : item.existing ? <span className="text-slate-500">EX </span> : null}
                        {tags[item.id]}
                        {sub && <span className="font-semibold text-slate-600">{` ${sub}`}</span>}
                        {item.type === 'zone' && zoneColor(item.spec?.zone) && <span className="font-bold" style={{ color: zoneColor(item.spec.zone) }}>{` ${item.spec.zone.replace('Zone ', 'Z')}`}</span>}
                      </>
                    )}
                  </div>
                );
              })}

              {items.filter((it) => showPortsFor(it) && inView(it)).flatMap((item) => portDefs(item).filter((d) => !d.joinOnly && !joinedPorts.has(portKey(item.id, d.id))).map((d) => {
                const isPending = pendingPort?.itemId === item.id && pendingPort?.portId === d.id;
                const p = portInfo(item, d.id, ppm);
                const tone = d.service === 'pipe' ? 'border-orange-600' : d.service === 'drain' ? 'border-sky-600' : d.service === 'power' ? 'border-rose-800' : d.air === 'supply' ? 'border-green-600' : d.air === 'return' ? 'border-red-600' : d.air === 'exhaust' ? 'border-purple-600' : 'border-primary/70';
                return (
                  <button
                    key={`${item.id}-${d.id}`}
                    type="button"
                    aria-label={`${tags[item.id]} ${d.air ? `${d.air} ` : ''}connection`}
                    title={d.air ? `${(AIR_NAME[d.air] || d.air).replace(/^./, (c) => c.toUpperCase())} air connection` : 'Duct connection'}
                    className="absolute size-7 flex items-center justify-center touch-none cursor-crosshair"
                    style={{
                      left: p.x + DIRS[p.dir][0] * 16 * Math.min(inv, 3),
                      top: p.y + DIRS[p.dir][1] * 16 * Math.min(inv, 3),
                      transform: `translate(-50%, -50%) scale(${Math.min(inv, 3)})`,
                    }}
                    onPointerDown={(event) => startWire(event, item.id, d.id)}
                  >
                    <span className={`size-3 rounded-full border-2 ${isPending ? 'bg-primary border-primary scale-125' : `bg-background ${tone}`}`} />
                  </button>
                );
              }))}

              {/* section handles on the selected duct run: slide a straight sideways to re-route it */}
              {selectedRun && !scaleDraft && (() => {
                const pts = selectedRun.pts;
                const s = Math.min(inv, 3);
                const handles = [];
                for (let i = 1; i < pts.length; i += 1) {
                  const dx = pts[i].x - pts[i - 1].x;
                  const dy = pts[i].y - pts[i - 1].y;
                  if (Math.hypot(dx, dy) < 24 * inv) continue;
                  handles.push({ i, horizontal: Math.abs(dy) <= Math.abs(dx), x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 });
                }
                return handles.map((h) => (
                  <button
                    key={`s${h.i}`}
                    type="button"
                    aria-label="Move this section of duct"
                    title={h.horizontal ? 'Drag up or down to move this section' : 'Drag left or right to move this section'}
                    className={`absolute size-9 flex items-center justify-center touch-none ${h.horizontal ? 'cursor-ns-resize' : 'cursor-ew-resize'}`}
                    style={{ left: h.x, top: h.y, transform: `translate(-50%, -50%) scale(${s})` }}
                    onPointerDown={(event) => startSegDrag(event, selectedRun, h)}
                  >
                    <span className="flex items-center justify-center size-6 rounded-full bg-white border-2 border-primary shadow text-primary">
                      <ApperIcon name={h.horizontal ? 'MoveVertical' : 'MoveHorizontal'} size={13} />
                    </span>
                  </button>
                ));
              })()}

              {/* resize handle on a selected zone area */}
              {selected?.type === 'zonearea' && !scaleDraft && (() => {
                const box = itemBox(selected, ppm);
                return (
                  <button
                    type="button"
                    aria-label="Resize zone area"
                    title="Drag to stretch over the room"
                    className="absolute size-8 flex items-center justify-center touch-none cursor-nwse-resize"
                    style={{ left: selected.cx + box.w / 2, top: selected.cy + box.h / 2, transform: `translate(-50%, -50%) scale(${Math.min(inv, 3)})` }}
                    onPointerDown={(event) => startResize(event, selected)}
                  >
                    <span className="size-4 rounded-sm bg-white border-2 border-primary shadow" />
                  </button>
                );
              })()}

              {/* rotate handle on the selected item */}
              {selected && !scaleDraft && !pendingPort && (() => {
                const box = itemBox(selected, ppm);
                const s = Math.min(inv, 3);
                return (
                  <button
                    type="button"
                    aria-label="Rotate 90 degrees"
                    title="Rotate 90° (R)"
                    className="absolute size-9 rounded-full bg-primary text-primary-foreground shadow flex items-center justify-center touch-none"
                    style={{ left: selected.cx + box.w / 2 + 4 * s, top: selected.cy - box.h / 2 - 4 * s, transform: `translate(0, -100%) scale(${s})`, transformOrigin: 'bottom left' }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); rotateSelected(); }}
                  >
                    <ApperIcon name="RotateCw" size={15} />
                  </button>
                );
              })()}
            </div>

            <div className="dp-noprint absolute top-2 right-2 flex flex-col items-center gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
              <Button variant="outline" size="icon" className="size-11 bg-card shadow-sm" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomCentre(1.4)}>
                <ApperIcon name="ZoomIn" size={20} />
              </Button>
              <div className="text-[10px] font-semibold tabular-nums rounded bg-card/90 border border-border px-1">{Math.round(view.z * 100)}%</div>
              <Button variant="outline" size="icon" className="size-11 bg-card shadow-sm" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomCentre(1 / 1.4)}>
                <ApperIcon name="ZoomOut" size={20} />
              </Button>
              <Button variant="outline" size="icon" className="size-11 bg-card shadow-sm" aria-label="Fit whole plan" title="Fit whole plan (0)" onClick={fitView}>
                <ApperIcon name="Maximize" size={18} />
              </Button>
              {selected && (
                <Button variant="outline" size="icon" className="size-11 bg-card shadow-sm" aria-label="Zoom to selected part" title="Zoom to selected (F)" onClick={focusSelected}>
                  <ApperIcon name="Focus" size={19} />
                </Button>
              )}
              <Button variant="outline" size="icon" className={`size-11 shadow-sm ${showKeys ? 'bg-primary/10 border-primary' : 'bg-card'}`} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShowKeys((s) => !s)}>
                <ApperIcon name="Keyboard" size={18} />
              </Button>
              <Button variant="outline" size="icon" className="size-11 bg-card shadow-sm" aria-label={isFull ? 'Exit full screen' : 'Full screen'} title={isFull ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>
                <ApperIcon name={isFull ? 'Minimize2' : 'Maximize2'} size={18} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`size-11 shadow-sm ${showLabels ? 'bg-card' : 'bg-primary/10 border-primary'}`}
                aria-label={showLabels ? 'Hide labels' : 'Show labels'}
                title={showLabels ? 'Hide labels' : 'Show labels'}
                onClick={() => { setShowLabels((s) => !s); markDirty(); }}
              >
                <ApperIcon name={showLabels ? 'Tag' : 'EyeOff'} size={15} />
              </Button>
              <Button
                variant="outline"
                className={`h-11 px-2 shadow-sm flex-col gap-0 text-[9px] font-bold leading-none ${phaseView === 'all' ? 'bg-card' : 'bg-primary/10 border-primary text-primary'}`}
                title="Cycle view: everything / existing site / proposed layout"
                aria-label="Change existing or proposed view"
                onClick={() => setPhaseView((v) => (v === 'all' ? 'existing' : v === 'existing' ? 'proposed' : 'all'))}
              >
                <ApperIcon name="Layers" size={15} />
                {phaseView === 'all' ? 'ALL' : phaseView === 'existing' ? 'EXIST' : 'PROP'}
              </Button>
              <Button
                variant="outline"
                className={`h-11 px-2 shadow-sm flex-col gap-0 text-[9px] font-bold leading-none ${penMode ? 'bg-primary/10 border-primary text-primary' : 'bg-card'}`}
                title={penMode ? 'Pen mode on: the pen draws and moves parts, fingers only pan and zoom. Tap to turn off.' : 'Pen mode: use the pen to draw and move parts, fingers only pan and zoom (stops palm bumps).'}
                aria-label={penMode ? 'Turn pen mode off' : 'Turn pen mode on'}
                aria-pressed={penMode}
                onClick={() => { setPenMode((v) => !v); toast.message(penMode ? 'Pen mode off — fingers edit again' : 'Pen mode on — pen edits, fingers pan and zoom'); }}
              >
                <ApperIcon name="PenTool" size={15} />
                {penMode ? 'PEN' : 'TOUCH'}
              </Button>
            </div>

            {(items.some((i) => i.existing) || connections.some((c) => c.existing)) && (
              <div className="absolute bottom-2 right-2 z-10 pointer-events-none rounded-md border border-slate-300 bg-white/95 text-slate-900 px-2 py-1.5 text-[10px] leading-tight shadow-sm space-y-1">
                <div className="font-bold uppercase tracking-wider text-[9px]">{phaseView === 'existing' ? 'Existing site' : phaseView === 'proposed' ? 'Proposed layout' : 'Existing / new'}</div>
                {phaseView !== 'existing' && (
                  <div className="flex items-center gap-1.5"><svg width="30" height="10"><line x1="2" y1="5" x2="28" y2="5" stroke="#15803d" strokeWidth="8" strokeLinecap="round" /><line x1="2" y1="5" x2="28" y2="5" stroke="#4ade80" strokeWidth="5" strokeLinecap="round" /></svg>New work</div>
                )}
                <div className="flex items-center gap-1.5"><svg width="30" height="10"><line x1="1" y1="5" x2="29" y2="5" stroke="#475569" strokeWidth="8" strokeDasharray="6 4" /><line x1="1" y1="5" x2="29" y2="5" stroke="#e2e8f0" strokeWidth="5" /></svg>Existing — stays</div>
                {phaseView !== 'proposed' && (
                  <div className="flex items-center gap-1.5"><svg width="30" height="10"><line x1="1" y1="5" x2="29" y2="5" stroke="#dc2626" strokeWidth="8" strokeDasharray="6 4" /><line x1="1" y1="5" x2="29" y2="5" stroke="#e2e8f0" strokeWidth="5" /><line x1="1" y1="5" x2="29" y2="5" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 3" /></svg>Existing — remove</div>
                )}
              </div>
            )}

            {ctxMenu && (
              <div
                data-no-zoom
                className="absolute z-20 w-64 rounded-lg border border-border bg-card shadow-lg p-2 cursor-default"
                style={{
                  left: Math.max(4, Math.min(ctxMenu.x, (canvasRef.current?.clientWidth || 600) - 264)),
                  top: Math.max(4, Math.min(ctxMenu.y, (canvasRef.current?.clientHeight || 400) - 380)),
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
              >
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-xs font-semibold">Add part here</span>
                  <button type="button" aria-label="Close menu" className="text-muted-foreground hover:text-foreground" onClick={() => setCtxMenu(null)}>
                    <ApperIcon name="X" size={14} />
                  </button>
                </div>
                <ComponentList compact autoFocus onPick={(type) => { addItem(type, ctxMenu.world); setCtxMenu(null); }} />
              </div>
            )}

            {showKeys && (
              <div
                data-no-zoom
                className="absolute z-20 right-16 top-2 w-72 max-h-[calc(100%-1rem)] overflow-y-auto rounded-lg border border-border bg-card shadow-lg p-3 text-xs cursor-default"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">Keyboard shortcuts</span>
                  <button type="button" aria-label="Close" className="text-muted-foreground hover:text-foreground" onClick={() => setShowKeys(false)}>
                    <ApperIcon name="X" size={14} />
                  </button>
                </div>
                <table className="w-full">
                  <tbody>
                    {SHORTCUTS.map(([k, what]) => (
                      <tr key={k}>
                        <td className="py-1 pr-3 whitespace-nowrap align-top">
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</kbd>
                        </td>
                        <td className="py-1 text-muted-foreground">{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-muted-foreground">Ducts: press on a part's connection dot and drag to another part's dot, or tap one dot then the other.</p>
              </div>
            )}

            {planDragOver && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/10 border-4 border-dashed border-primary rounded-lg pointer-events-none">
                <div className="rounded-lg bg-card px-4 py-3 shadow text-sm font-semibold flex items-center gap-2">
                  <ApperIcon name="Upload" size={18} />
                  Drop to load this plan (PDF, JPG or PNG)
                </div>
              </div>
            )}

            {scaleDraft && (
              <div className="absolute top-2 left-2 right-14 pointer-events-none">
                <div className="inline-block rounded-md bg-primary text-primary-foreground text-xs px-2 py-1 shadow">
                  {!scaleDraft.a ? 'Scale: tap the start of a known dimension' : !scaleDraft.b ? 'Scale: tap the end point' : 'Scale: enter the real length in the panel'}
                </div>
              </div>
            )}

            {runs.length > 0 && (
              <div className="absolute left-2 pointer-events-none rounded bg-card/90 border border-border px-2 py-1 flex flex-wrap gap-x-2 gap-y-0.5 max-w-[70%]" style={{ bottom: bar ? 44 : 8 }}>
                {[...new Set(runs.filter((r) => !isService(r.conn)).map((r) => r.conn.size || getDuct(r.conn.type).defaultSize))].sort((x, y) => x - y).map((mm) => (
                  <span key={mm} className="flex items-center gap-1 text-[10px] font-semibold">
                    <span className="inline-block w-4 h-2 rounded-sm" style={{ backgroundColor: sizeColor(mm) }} />
                    {`${mm}Ø`}
                  </span>
                ))}
              </div>
            )}

            {bar && (
              <div className="absolute bottom-2 left-2 pointer-events-none rounded bg-card/90 border border-border px-2 py-1">
                <div className="h-1.5 border-x-2 border-b-2 border-foreground" style={{ width: bar.px }} />
                <div className="text-[10px] font-semibold mt-0.5">{bar.m < 1 ? `${bar.m * 1000} mm` : `${bar.m} m`}</div>
              </div>
            )}

            {items.length === 0 && !background && !scaleDraft && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-muted-foreground pointer-events-none">
                <div>
                  <ApperIcon name="DraftingCompass" size={36} className="mx-auto mb-2" />
                  <p className="text-sm">Blank Level 1</p>
                  <p className="text-xs">Drag a plan file here, use Load plan, or sketch the rooms with Wall / Room.</p>
                </div>
              </div>
            )}
          </div>

          {/* Equipment list printed beside the plan on PDF page 1 */}
          <div className="dp-print-only dp-side-list text-black text-[9px] leading-tight">
            {fanSchedule.length > 0 && (
              <div className="mb-2">
                <div className="font-bold uppercase tracking-wider text-[10px] border-b-2 border-black pb-1 mb-1">Fan schedule</div>
                <table className="w-full border-collapse text-[8px]">
                  <thead>
                    <tr className="text-left">
                      {['Tag', 'Fan', 'Model', 'Supplier', 'Duty'].map((h) => <th key={h} className="border border-black px-0.5 py-0.5">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {fanSchedule.map((f) => (
                      <tr key={f.id}>
                        {[f.tag, f.kind, f.model, f.supplier, f.duty].map((v, i) => <td key={i} className="border border-black px-0.5 py-0.5 align-top">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="font-bold uppercase tracking-wider text-[10px] border-b-2 border-black pb-1 mb-1">Equipment list</div>
            {equipment.groups.length === 0 && <p>Nothing drawn yet.</p>}
            {equipment.groups.map((g) => (
              <div key={g.name} className="mb-1.5">
                <div className="font-bold uppercase text-[8px] tracking-wider text-gray-700">{g.name}</div>
                {g.rows.map((r) => (
                  <div key={r.name} className="flex gap-1.5 border-b border-gray-300 py-0.5">
                    <span className="font-bold w-6 shrink-0 text-right">{r.qty}</span>
                    <span>
                      {r.swatch && <span className="inline-block size-2 rounded-sm mr-1 align-middle" style={{ backgroundColor: r.swatch }} />}
                      {r.name}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {equipment.site.map((g) => (
              <div key={g.name} className="mb-1.5 text-gray-600">
                <div className="font-bold uppercase text-[8px] tracking-wider">{g.name}</div>
                {g.rows.map((r) => (
                  <div key={r.name} className="flex gap-1.5 border-b border-dashed border-gray-300 py-0.5">
                    <span className="font-bold w-6 shrink-0 text-right">{r.qty}</span>
                    <span>{`${r.name}${r.note ? ` (${r.note})` : ''}`}</span>
                  </div>
                ))}
              </div>
            ))}
            {sketch.some((x) => x.kind === 'pin') && (
              <div className="mb-1.5">
                <div className="font-bold uppercase text-[8px] tracking-wider text-gray-700">Site notes</div>
                {sketch.filter((x) => x.kind === 'pin').map((x) => (
                  <div key={x.id} className="flex gap-1.5 border-b border-gray-300 py-0.5">
                    <span className="font-bold w-6 shrink-0 text-right text-rose-700">{pinNo[x.id]}</span>
                    <span>{`${x.text || '(no note)'}${x.photo ? ' · photo' : ''}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className={`dp-noprint border-t lg:border-t-0 lg:border-l border-border bg-card p-3 lg:w-72 shrink-0 lg:overflow-y-auto lg:max-h-[calc(100svh-120px)] ${compact && !selected && !selectedConn && !selectedSketch ? 'lg:hidden' : ''}`}>
          <div className="flex gap-1 mb-3 rounded-md bg-muted p-1">
            {[['selection', 'Selection'], ['list', `List${equipment.total ? ` (${equipment.total})` : ''}`], ['checks', `Checks${warnCount ? ` ⚠${warnCount}` : ''}`]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRightTab(id)}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${rightTab === id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {rightTab === 'selection' && selected && selectedTool && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold">{tags[selected.id]}</div>
                <div className="text-xs text-muted-foreground">
                  {selected.type === 'indoor' && selected.spec?.model && selected.spec.model !== CHOOSE_MODEL
                    ? selected.spec.model
                    : selected.type === 'outdoor' && (selected.outdoorModel || selected.suits)
                      ? `${selectedTool.label} · ${selected.outdoorModel || `to suit ${selected.suits}`}`
                      : FAN_TYPES.has(selected.type) && (selected.fanModel || '').trim()
                        ? `${selectedTool.label} · ${selected.fanModel.trim()}${(selected.fanSupplier || '').trim() ? ` · ${selected.fanSupplier.trim()}` : ''}`
                        : selectedTool.label}
                </div>
              </div>
              {(selectedTool.specs || []).map((field) => {
                const value = getSpec(selected, field);
                return (
                  <label key={field.key} className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">{field.label}</span>
                    <select
                      value={value}
                      onChange={(event) => updateSelectedSpec(field.key, event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {field.groups ? (
                        <>
                          <option value={field.placeholder}>{field.placeholder}</option>
                          {field.groups.map((g) => (
                            <optgroup key={g.group} label={g.group}>
                              {g.models.map((m) => <option key={m} value={m}>{m}</option>)}
                            </optgroup>
                          ))}
                        </>
                      ) : (
                        specOptions(selectedTool, field, selected).map((o) => <option key={o} value={o}>{o}</option>)
                      )}
                    </select>
                  </label>
                );
              })}
              {selected.type === 'rafilterbox' && rfbOutlet(selected).rect && (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Neck size W x D (mm)</span>
                  <Input className="h-9" placeholder="e.g. 600x300" value={selected.rfbNeck || ''} onChange={(event) => updateItem(selected.id, { rfbNeck: event.target.value })} />
                </label>
              )}
              {selected.type === 'transition' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Inlet (big end)</span>
                      <Input className="h-9" placeholder="600x300" value={selected.tIn || ''} onChange={(event) => updateItem(selected.id, { tIn: event.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Outlet</span>
                      <Input className="h-9" placeholder="400x300 or 300Ø" value={selected.tOut || ''} onChange={(event) => updateItem(selected.id, { tOut: event.target.value })} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Length (mm)</span>
                    <Input className="h-9" type="number" min="100" step="50" inputMode="numeric" placeholder="300" value={selected.tLen ?? ''} onChange={(event) => updateItem(selected.id, { tLen: event.target.value === '' ? undefined : Number(event.target.value) })} />
                  </label>
                  <p className="text-[11px] text-muted-foreground">Type W x H for rectangular (600x300) or one number for round (300). It draws to these sizes and goes on the bill of materials.</p>
                </div>
              )}
              {selected.type === 'exhfan' && selected.onRun && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selected.canvas !== false} onChange={(event) => updateItem(selected.id, { canvas: event.target.checked })} />
                  Flexible canvas connection each side of the fan
                </label>
              )}
              {FAN_TYPES.has(selected.type) && (
                <div className="space-y-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Model no.</span>
                    <Input className="h-9" placeholder="e.g. ECO-200 or TD-500/160" value={selected.fanModel || ''} onChange={(event) => updateItem(selected.id, { fanModel: event.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Supplier</span>
                    <Input className="h-9" list="fan-suppliers" placeholder="e.g. Fantech" value={selected.fanSupplier || ''} onChange={(event) => updateItem(selected.id, { fanSupplier: event.target.value })} />
                    <datalist id="fan-suppliers">
                      {FAN_SUPPLIERS.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </label>
                  <p className="text-[11px] text-muted-foreground">A typed model no. replaces the Fan pick on the plan label and in the bill of materials.</p>
                </div>
              )}
              {(selected.type === 'bto' || selected.type === 'dbto') && (
                <p className="text-[11px] text-muted-foreground">{`Sizes read inlet / straight-through / branch${selected.type === 'dbto' ? 'es' : ''}. Open ends show their size — the green IN arrow is the inlet (large end). The first ${selected.type === 'dbto' ? DBTO_SHEET.length : BTO_SHEET.length} sizes are from your costing sheet.`}</p>
              )}
              {selected.type === 'zonearea' && (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Room name</span>
                  <Input className="h-9" placeholder="e.g. Bed 1" value={selected.room || ''} onChange={(event) => updateItem(selected.id, { room: event.target.value })} />
                  <span className="text-[11px] text-muted-foreground">Drag the square in the bottom-right corner to stretch the colour over the room.</span>
                </label>
              )}
              {selected.type === 'zonearea' && roomFields({ ...selected, kind: 'zone', name: selected.room }, (patch) => updateItem(selected.id, patch), (footprintMm(selected)[0] * footprintMm(selected)[1]) / 1e6)}
              {(selected.type === 'indoor' || selected.type === 'coilsection') && (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Rated airflow (L/s) — from the spec sheet</span>
                  <Input className="h-9" type="number" min="0" inputMode="numeric" value={selected.airflow ?? ''} placeholder={unitKw(selected) ? `≈${Math.round(unitKw(selected) * LPS_PER_KW)} (estimated from kW)` : 'Choose the model first'} onChange={(event) => updateItem(selected.id, { airflow: event.target.value === '' ? undefined : Number(event.target.value) })} />
                </label>
              )}
              {selected.type === 'outdoor' && (
                <div className="space-y-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Paired indoor unit</span>
                    <select
                      value={selected.pairedWith || ''}
                      onChange={(event) => {
                        const fcu = items.find((i) => i.id === event.target.value);
                        if (fcu && fcu.spec?.model && fcu.spec.model !== CHOOSE_MODEL) pairOutdoor(fcu, fcu.spec.model, selected);
                        else updateItem(selected.id, { pairedWith: event.target.value || undefined, suits: '' });
                      }}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Not paired</option>
                      {items.filter((i) => i.type === 'indoor' || i.type === 'splitindoor').map((i) => (
                        <option key={i.id} value={i.id}>
                          {`${tags[i.id]}${i.spec?.model && i.spec.model !== CHOOSE_MODEL ? ` – ${modelCodes(i.spec.model).indoor || i.spec.model}` : ' (no model yet)'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Outdoor model number</span>
                    <Input
                      className="h-9"
                      placeholder="Type from the spec sheet"
                      value={selected.outdoorModel || ''}
                      onChange={(event) => updateItem(selected.id, { outdoorModel: event.target.value.toUpperCase() })}
                    />
                  </label>
                </div>
              )}
              {(selected.type === 'indoor' || selected.type === 'outdoor') && selectedMm && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Footprint (mm) – check against the spec sheet</div>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" inputMode="numeric" className="h-9" aria-label="Width in mm" value={selectedMm[0]} onChange={(event) => updateSelectedDims('w', event.target.value)} />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input type="number" inputMode="numeric" className="h-9" aria-label="Depth in mm" value={selectedMm[1]} onChange={(event) => updateSelectedDims('d', event.target.value)} />
                  </div>
                  {selected.type === 'indoor' && (
                    <div className="text-[11px] text-muted-foreground">{indoorPreset(selected.spec?.model).series} outline · R/A at the rear, S/A at the front.</div>
                  )}
                </div>
              )}
              <StatusPicker noun="Part" value={statusOf(selected)} onChange={(patch) => updateItem(selected.id, patch)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={rotateSelected}>
                  <ApperIcon name="RotateCw" size={14} />
                  Rotate
                </Button>
                {selectedJoined && (
                  <Button variant="outline" size="sm" onClick={unjoinSelected}>
                    <ApperIcon name="Unlink" size={14} />
                    Unjoin
                  </Button>
                )}
                {selected.label && (
                  <Button variant="outline" size="sm" onClick={() => updateItem(selected.id, { label: undefined })}>
                    <ApperIcon name="Undo2" size={14} />
                    Reset label
                  </Button>
                )}
                <Button variant="destructive" size="sm" onClick={deleteSelectedItem}>
                  <ApperIcon name="Trash2" size={14} />
                  Delete
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Drag the icon to move it (joined parts move with it). Drop an edge against another part to join them. Drag its label to move just the label.</p>
            </div>
          )}
          {rightTab === 'selection' && !selected && selectedConn && isService(selectedConn) && (() => {
            const pipe = selectedConn.type === 'pipe';
            const power = selectedConn.type === 'power';
            const auto = pipe ? pipeCoil({ ...selectedConn, coil: 'auto' }).idx : null;
            const m = selectedRun?.metres;
            const pc = pipe ? pipeCalc(selectedConn, m) : null;
            const numField = (label, key, placeholder, step = '0.5') => (
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <Input className="h-9" type="number" min="0" step={step} inputMode="decimal" value={selectedConn[key] ?? ''} placeholder={String(placeholder ?? '')} onChange={(event) => updateSelectedConnection({ [key]: event.target.value === '' ? undefined : Number(event.target.value) })} />
              </label>
            );
            return (
              <div className="space-y-3">
                <div className="text-sm font-semibold">{pipe ? 'Refrigerant pipe run' : power ? 'Power cable run' : 'Condensate drain'}</div>
                <div className="text-xs text-muted-foreground">
                  {`${tags[selectedConn.from.itemId]} → ${tags[selectedConn.to.itemId]}${m != null ? ` · ${fmtM(m)} m drawn` : ''}`}
                </div>
                {power && (
                  <>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Circuit breaker</span>
                      <select value={selectedConn.breaker || BREAKERS[1]} onChange={(event) => updateSelectedConnection({ breaker: event.target.value, cable: undefined })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        {BREAKERS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Cable</span>
                      <Input className="h-9" value={selectedConn.cable ?? ''} placeholder={cableFor(selectedConn.breaker || BREAKERS[1])} onChange={(event) => updateSelectedConnection({ cable: event.target.value || undefined })} />
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!selectedConn.noBreaker} onChange={(event) => updateSelectedConnection({ noBreaker: !event.target.checked })} />
                      New breaker at the board on this run
                    </label>
                    <div className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs">
                      {m != null && showLoads
                        ? <><span className="font-semibold">{`Approx. ${approxCable(m)} m of cable`}</span><div className="text-[11px] text-muted-foreground">{`${fmtM(m)} m drawn + 20% for rises/drops + ${CABLE_TAILS} m terminations. Cable size is a guide only — confirm to AS/NZS 3000 for the run length and install method.`}</div></>
                        : 'Set the scale to get an approximate cable length.'}
                    </div>
                  </>
                )}
                {pipe && (
                  <>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Pair coil</span>
                      <select value={selectedConn.coil ?? 'auto'} onChange={(event) => updateSelectedConnection({ coil: event.target.value === 'auto' ? undefined : Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="auto">{auto != null ? `Auto from unit: ${coilShort(auto)}` : 'Auto (choose the indoor model first)'}</option>
                        {PAIR_COILS.map((c, i) => <option key={c} value={i}>{c}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Trunking</span>
                      <select value={selectedConn.trunking || 'None'} onChange={(event) => updateSelectedConnection({ trunking: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="None">None</option>
                        {COLORBOND.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    {selectedConn.trunking && selectedConn.trunking !== 'None' && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Trunking length (m) — blank uses the whole run</span>
                        <Input className="h-9" type="number" min="0" step="0.5" inputMode="decimal" value={selectedConn.trunkM ?? ''} placeholder={selectedRun?.metres != null ? fmtM(selectedRun.metres) : ''} onChange={(event) => updateSelectedConnection({ trunkM: event.target.value === '' ? undefined : Number(event.target.value) })} />
                      </label>
                    )}
                    {numField('Max pipe length (m)', 'maxLen', pc.max)}
                    {m != null && showLoads && (
                      <div className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${pc.over ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'border-border bg-muted/50'}`}>
                        {pc.over ? `${fmtM(m)} m — over the ${pc.max} m limit` : `${fmtM(m)} m of ${pc.max} m allowed`}
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!selectedConn.topUp} onChange={(event) => toggleTopUp(event.target.checked)} />
                      Include refrigerant top-up
                    </label>
                    {selectedConn.topUp && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Spec’d top-up (kg) — from the unit manual</span>
                        <Input className={`h-9 ${pc.kg ? '' : 'border-amber-500'}`} type="number" min="0" step="0.01" inputMode="decimal" value={selectedConn.topUpKg ?? ''} placeholder="e.g. 0.45" onChange={(event) => updateSelectedConnection({ topUpKg: event.target.value === '' ? undefined : Number(event.target.value) })} />
                      </label>
                    )}
                  </>
                )}
                <StatusPicker noun="Run" value={statusOf(selectedConn)} onChange={(patch) => updateSelectedConnection(patch)} />
                <p className="text-[11px] text-muted-foreground">Drag a round handle to slide a straight section sideways.</p>
                {selectedConn.bends?.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => updateSelectedConnection({ bends: undefined })}>
                    <ApperIcon name="Route" size={14} />
                    Auto route
                  </Button>
                )}
                <Button variant="destructive" size="sm" onClick={deleteSelectedConnection}>
                  <ApperIcon name="Trash2" size={14} />
                  Remove run
                </Button>
              </div>
            );
          })()}
          {rightTab === 'selection' && !selected && selectedConn && !isService(selectedConn) && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                {DUCT_TYPES.map((duct) => (
                  <button
                    key={duct.type}
                    type="button"
                    onClick={() => updateSelectedConnection({ type: duct.type })}
                    className={`flex items-center justify-center gap-1.5 px-1.5 py-1 rounded-md border text-[11px] ${selectedConn.type === duct.type ? 'border-primary bg-primary/10' : 'border-border'}`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: duct.color }} />
                    {duct.label.replace(' Duct', '')}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[['flex', 'Flex duct'], ['sheet', 'Sheet metal']].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => updateSelectedConnection(id === 'sheet' ? { material: 'sheet', shape: selectedConn.shape || 'rect', w: selectedConn.w || 300, h: selectedConn.h || 150 } : { material: undefined })}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${(selectedConn.material === 'sheet') === (id === 'sheet') ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isSheet(selectedConn) ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {[['rect', 'Rectangular'], ['round', 'Round']].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => updateSelectedConnection({ shape: id })} className={`rounded-md border px-2 py-1 text-[11px] ${(selectedConn.shape || 'rect') === id ? 'border-primary bg-primary/10' : 'border-border'}`}>{label}</button>
                    ))}
                  </div>
                  {isRect(selectedConn) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[['w', 'Width (mm)'], ['h', 'Height (mm)']].map(([k, label]) => (
                        <label key={k} className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <Input className="h-9" type="number" min="50" step="10" inputMode="numeric" value={selectedConn[k] ?? ''} placeholder={k === 'w' ? '300' : '150'} onChange={(event) => updateSelectedConnection({ [k]: event.target.value === '' ? undefined : Number(event.target.value) })} />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Diameter (mm)</span>
                      <Input className="h-9" type="number" min="50" step="10" inputMode="numeric" value={selectedConn.size ?? ''} placeholder="250" onChange={(event) => updateSelectedConnection({ size: event.target.value === '' ? undefined : Number(event.target.value) })} />
                    </label>
                  )}
                  <div className="text-[11px] text-muted-foreground">{isRect(selectedConn) ? `Equivalent to about ${ductRatingMm(selectedConn)}mm round · add transitions where it meets round spigots.` : 'Listed as sheet metal by the metre.'}</div>
                </div>
              ) : (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Size</span>
                  <select
                    value={sizeValue}
                    onChange={(event) => updateSelectedConnection({ size: Number(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {sizeOptions.map((s) => <option key={s.mm} value={s.mm}>{s.label}</option>)}
                  </select>
                </label>
              )}
              <div className="text-xs text-muted-foreground">
                {`${tags[selectedConn.from.itemId]} → ${tags[selectedConn.to.itemId]}`}
                {selectedRun?.metres != null ? ` · ${fmtM(selectedRun.metres)} m` : ''}
              </div>
              {selectedRun?.ends?.length > 0 && (
                selectedRun.mismatch.length ? (
                  <div className="rounded-md border border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 p-2 text-xs space-y-2">
                    <div className="font-semibold">Size doesn't match the spigot</div>
                    {selectedRun.mismatch.map((e) => (
                      <div key={e.tag}>{`${tags[e.tag]} spigot is ${sizeLabel(e.mm)}`}</div>
                    ))}
                    <Button size="sm" variant="outline" className="h-8 bg-card" onClick={() => updateSelectedConnection({ size: selectedRun.mismatch[0].mm })}>
                      <ApperIcon name="Wand2" size={14} />
                      {`Match spigot (${sizeLabel(selectedRun.mismatch[0].mm)})`}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                    <ApperIcon name="CircleCheck" size={14} />
                    Matches the spigot size
                  </div>
                )
              )}
              <p className="text-[11px] text-muted-foreground">Drag a round handle to slide that straight section sideways. The run stays square to the fittings.</p>
              <StatusPicker noun="Duct" value={statusOf(selectedConn)} onChange={(patch) => updateSelectedConnection(patch)} />
              <p className="hidden"></p>
              {selectedConn.bends?.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => updateSelectedConnection({ bends: undefined })}>
                  <ApperIcon name="Route" size={14} />
                  Auto route
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={deleteSelectedConnection}>
                <ApperIcon name="Trash2" size={14} />
                Remove duct
              </Button>
            </div>
          )}
          {rightTab === 'selection' && !selected && !selectedConn && selectedSketch && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">{{ wall: 'Wall', room: 'Room', dim: 'Measurement', smduct: `${SM_MATS[smMat(selectedSketch)]} run`, callout: 'Callout', pin: `Site note ${pinNo[selectedSketch.id] || ''}` }[selectedSketch.kind] || 'Text label'}</div>
              {selectedSketch.kind === 'dim' && (
                <div className="text-xs">
                  <span className="font-semibold">{`${(Math.hypot(selectedSketch.x2 - selectedSketch.x1, selectedSketch.y2 - selectedSketch.y1) / ppm).toFixed(2)} m`}</span>
                  {!scale && <div className="text-[11px] text-amber-700">Not to scale yet — set the scale for real metres.</div>}
                </div>
              )}
              {selectedSketch.kind === 'pin' && (() => {
                const url = photoUrl(selectedSketch.photo);
                return (
                  <>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Note</span>
                      <textarea
                        autoFocus
                        rows={3}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        placeholder="e.g. Manhole in hallway, trusses run N–S, tight over garage"
                        value={selectedSketch.text || ''}
                        onChange={(event) => updateSketch(selectedSketch.id, { text: event.target.value })}
                      />
                    </label>
                    {selectedSketch.photo && (
                      url
                        ? <a href={url} target="_blank" rel="noreferrer" className="block"><img src={url} alt={`Site note ${pinNo[selectedSketch.id]}`} className="w-full max-h-48 object-cover rounded-md border border-border" /></a>
                        : <p className="text-[11px] text-muted-foreground">Photo saved with the drawing (reopen to view).</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={photoBusy} onClick={() => photoInputRef.current?.click()}>
                        <ApperIcon name={photoBusy ? 'Loader' : 'Camera'} size={14} className={photoBusy ? 'animate-spin' : ''} />
                        {selectedSketch.photo ? 'Replace photo' : 'Add photo'}
                      </Button>
                      {selectedSketch.photo && (
                        <Button variant="outline" size="sm" onClick={() => removePhoto(selectedSketch)}>
                          <ApperIcon name="ImageOff" size={14} />
                          Remove photo
                        </Button>
                      )}
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; addPhoto(f, selectedSketch); }}
                    />
                  </>
                );
              })()}
              {selectedSketch.kind === 'wall' && (
                <div className="text-xs text-muted-foreground">{`Length ${fmtM(Math.hypot(selectedSketch.x2 - selectedSketch.x1, selectedSketch.y2 - selectedSketch.y1) / ppm)} m`}</div>
              )}
              {selectedSketch.kind === 'room' && (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Room name</span>
                    <Input className="h-9" placeholder="e.g. Bed 1" value={selectedSketch.name || ''} onChange={(event) => updateSketch(selectedSketch.id, { name: event.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[['w', 'Width (m)'], ['h', 'Depth (m)']].map(([k, label]) => (
                      <label key={`${selectedSketch.id}-${k}`} className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.1"
                          min="0.5"
                          inputMode="decimal"
                          defaultValue={Number(((k === 'w' ? selectedSketch.x2 - selectedSketch.x1 : selectedSketch.y2 - selectedSketch.y1) / ppm).toFixed(2))}
                          onChange={(event) => {
                            const m = Number(event.target.value);
                            if (!m || m <= 0) return;
                            const v = m * ppm;
                            updateSketch(selectedSketch.id, k === 'w' ? { x2: selectedSketch.x1 + v } : { y2: selectedSketch.y1 + v });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Type the room's real size and the box resizes to scale.</p>
                  {roomFields(selectedSketch, (patch) => updateSketch(selectedSketch.id, patch), ((selectedSketch.x2 - selectedSketch.x1) / ppm) * ((selectedSketch.y2 - selectedSketch.y1) / ppm))}
                </>
              )}
              {selectedSketch.kind === 'smduct' && (() => {
                const s = selectedSketch;
                const P = smPts(s, smCtx);
                const lenM = smLenOf(P) / ppm;
                const bends = smBends({ pts: P });
                const pieces = smPieces(smLayout(P, s, ppm / 1000).segs, ppm / 1000, s.sheetLen);
                const describe = (link) => {
                  if (!link) return 'Open end';
                  if (link.kind === 'port') return `Connected to ${tags[link.itemId] || 'a part'}`;
                  const t = sketch.find((x) => x.id === link.id);
                  const d = t ? `${smDims(t).w}×${smDims(t).h}` : 'a run';
                  return link.kind === 'side' ? `Branch off the ${d} run` : `Joined to the ${d} run`;
                };
                const net = smNetworks(smCtx).find((g) => g.runIds.includes(s.id));
                const netRuns = (net?.runIds || []).map((id) => sketch.find((x) => x.id === id)).filter(Boolean);
                const netLen = netRuns.reduce((n, r) => n + smLenOf(smPts(r, smCtx)), 0) / ppm;
                const fits = smEndFittings(s, smCtx);
                const linked = s.a || s.b || sketch.some((x) => x.kind === 'smduct' && ['a', 'b'].some((k) => x[k] && x[k].kind !== 'port' && x[k].id === s.id));
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {(smMat(s) === 'spiral' ? [['w', 'Diameter (mm)']] : [['w', 'Width (mm)'], ['h', 'Height (mm)']]).map(([k, label]) => (
                        <label key={`${s.id}-${k}`} className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <Input className="h-9" type="number" min="50" step="25" inputMode="numeric" value={s[k] ?? ''} onChange={(event) => updateSketch(s.id, { [k]: event.target.value === '' ? '' : Number(event.target.value) })} />
                        </label>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Air</span>
                        <select value={s.air || 'supply'} onChange={(event) => updateSketch(s.id, { air: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                          {DUCT_TYPES.filter((t) => t.type !== 'flex').map((t) => <option key={t.type} value={t.type}>{t.label.replace(' Duct', '')}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Sheet length (mm)</span>
                        <select value={Number(s.sheetLen) || SM_DEFAULT_SHEET} onChange={(event) => updateSketch(s.id, { sheetLen: Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                          {[1200, 1500, 2400].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Material</span>
                      <select value={smMat(s)} onChange={(event) => updateSketch(s.id, { mat: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        {Object.entries(SM_MATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[['a', 'capA', 'Start'], ['b', 'capB', 'End']].map(([k, c, label]) => (
                        <Button key={c} variant={s[c] && !s[k] ? 'default' : 'outline'} size="sm" disabled={!!s[k]} title={s[k] ? `${label} is joined` : `Cap the ${label.toLowerCase()} of the run`} onClick={() => updateSketch(s.id, { [c]: !s[c] })}>
                          <ApperIcon name="PanelRightClose" size={14} />
                          {`${s[c] && !s[k] ? 'Capped' : 'Cap'} ${label.toLowerCase()}`}
                        </Button>
                      ))}
                      <Button variant="outline" size="sm" disabled={!!(s.a && s.b)} onClick={() => addTransitionToRun(s)} title="Fit a transition on the open end (X)">
                        <HvacSymbol type="reducer" size={14} />
                        Transition
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {`${scale ? `Length ${fmtM(lenM)} m` : 'Set the scale for lengths'} · ${bends.b45} × 45° bend, ${bends.b90} × 90° bend`}
                    </div>
                    {scale && pieces.count > 0 && (
                      <div className="rounded-md bg-muted px-2 py-1.5 text-xs"><span className="text-muted-foreground">Straight pieces: </span><span className="font-medium">{smPiecesText(pieces.tally)}</span></div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Bends</span>
                        <select value={smIsRadius(s) ? 'radius' : 'square'} onChange={(event) => updateSketch(s.id, { bend: event.target.value, vanes: '' })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                          <option value="square">Square</option>
                          <option value="radius">Radius</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Radius</span>
                        <select disabled={!smIsRadius(s)} value={Number(s.bendR) || 1} onChange={(event) => updateSketch(s.id, { bendR: Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">
                          <option value={1}>1.0 × W</option>
                          <option value={1.5}>1.5 × W</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Vanes (90°)</span>
                        <select value={smVaneCount(s)} onChange={(event) => updateSketch(s.id, { vanes: Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                          {[0, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Airflow (L/s)</span>
                        <Input className="h-9" inputMode="numeric" placeholder="e.g. 450" value={s.ls ?? ''} onChange={(event) => updateSketch(s.id, { ls: event.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">Elevation tag</span>
                        <Input className="h-9" placeholder="e.g. U/S 2700" value={s.elev ?? ''} onChange={(event) => updateSketch(s.id, { elev: event.target.value })} />
                      </label>
                    </div>
                    {Number(s.ls) > 0 && (() => {
                      const { w, h } = smDims(s);
                      const rule = SM_SIZING[s.sizeBy] || SM_SIZING.standard;
                      const now = smAirflow(s.ls, w, h);
                      const sug = smSuggest(s.ls, s.sizeBy);
                      const same = sug.find((x) => x.h === h);
                      const others = sug.filter((x) => x.h !== h && x.w >= x.h).slice(0, 3);
                      const over = now && (now.v > rule.vmax || now.pa > rule.pa * 1.15);
                      const use = (x) => { updateSketch(s.id, { w: x.w, h: x.h }); toast.message(`Resized to ${x.w}/${x.h}`); };
                      return (
                        <div className={`rounded-md border p-2 space-y-2 text-xs ${over ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'border-border'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">Duct sizing</span>
                            <select value={s.sizeBy || 'standard'} onChange={(event) => updateSketch(s.id, { sizeBy: event.target.value })} className="h-7 rounded-md border border-input bg-background px-1 text-xs">
                              {Object.entries(SM_SIZING).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                            </select>
                          </div>
                          {now && <div>{`${w}/${h} at ${s.ls} L/s: `}<span className={over ? 'font-semibold text-red-700' : 'font-semibold'}>{`${now.v.toFixed(1)} m/s · ${now.pa.toFixed(2)} Pa/m`}</span>{over ? ' — too small' : ' — OK'}</div>}
                          {same && (same.w !== w) && (
                            <Button size="sm" className="h-8 w-full" onClick={() => use(same)}>{`Use ${same.w}/${same.h} (keeps ${h} deep) — ${same.v.toFixed(1)} m/s`}</Button>
                          )}
                          {same && same.w === w && <div className="text-muted-foreground">{`${w}/${h} is the smallest width at this depth.`}</div>}
                          {!same && <div className="text-muted-foreground">{`No width at ${h} deep stays within 4:1 — go deeper.`}</div>}
                          {others.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-muted-foreground self-center">Other depths:</span>
                              {others.map((x) => <Button key={x.h} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => use(x)}>{`${x.w}/${x.h}`}</Button>)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {fits.some((f) => f.type === 'transition') && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">Transition shape</span>
                          <select value={s.trKind || 'con'} onChange={(event) => updateSketch(s.id, { trKind: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="con">Concentric</option>
                            <option value="flatL">Flat one side (A)</option>
                            <option value="flatR">Flat one side (B)</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">Taper</span>
                          <select value={Number(s.taper) || 4} onChange={(event) => updateSketch(s.id, { taper: Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                            <option value={4}>1:4</option>
                            <option value={7}>1:7</option>
                          </select>
                        </label>
                      </div>
                    )}
                    <div className="rounded-md border border-border p-2 space-y-2">
                      <div className="text-xs font-medium">Add a reducer on this run</div>
                      <div className="grid grid-cols-3 gap-2">
                        {[['at', 'From start (m)', 'e.g. 3.6'], ['w', 'New W (mm)', '450'], ['h', 'New H (mm)', '250']].map(([key, label, ph]) => (
                          <label key={key} className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <Input className="h-9" inputMode="decimal" placeholder={ph} value={redForm[key]} onChange={(event) => setRedForm((f) => ({ ...f, [key]: event.target.value }))} />
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <select value={redForm.kind} onChange={(event) => setRedForm((f) => ({ ...f, kind: event.target.value }))} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                          <option value="con">Concentric</option>
                          <option value="flatL">Flat one side (A)</option>
                          <option value="flatR">Flat one side (B)</option>
                        </select>
                        <Button size="sm" className="h-9" onClick={() => addReducer(s)}>Add reducer</Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{`Measured from the start of the run (${describe(s.a).toLowerCase()}). The rest of the run takes the new size.`}</p>
                    </div>
                    <div className="rounded-md border border-border p-2 text-xs space-y-1">
                      <div><span className="text-muted-foreground">Start: </span>{describe(s.a)}</div>
                      <div><span className="text-muted-foreground">End: </span>{describe(s.b)}</div>
                      {fits.length > 0 && <div className="text-muted-foreground">{`Fittings: ${fits.map((f) => f.label.split(' — ')[0]).join(', ')}`}</div>}
                      {netRuns.length > 1 || net?.itemIds?.length ? (
                        <div className="text-muted-foreground">{`System: ${netRuns.length} run${netRuns.length === 1 ? '' : 's'}${scale ? `, ${fmtM(netLen)} m` : ''}${net?.itemIds?.length ? ` · ${net.itemIds.map((id) => tags[id]).filter(Boolean).join(', ')}` : ''}`}</div>
                      ) : null}
                    </div>
                    {linked && (
                      <Button variant="outline" size="sm" onClick={() => {
                        setSketch((current) => {
                          const c = { ...smCtx, sketch: current };
                          const me = current.find((x) => x.id === s.id);
                          return smDetachOthers(current, s.id, c).map((x) => (x.id === s.id && me ? smBake(me, c) : x));
                        });
                        markDirty();
                        toast.message('Run disconnected');
                      }}>
                        <ApperIcon name="Unlink" size={14} />
                        Disconnect this run
                      </Button>
                    )}
                    <p className="text-[11px] text-muted-foreground">Start or finish a run on a run end, a part's connection or the side of a run — joins, transitions and branch take-offs are added automatically. Ctrl + drag a run to pull it free.</p>
                  </>
                );
              })()}
              {selectedSketch.kind === 'callout' && (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Text</span>
                    <textarea autoFocus rows={3} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={selectedSketch.text || ''} onChange={(event) => updateSketch(selectedSketch.id, { text: event.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <select value={selectedSketch.size || 14} onChange={(event) => updateSketch(selectedSketch.id, { size: Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {[11, 14, 18, 24].map((n) => <option key={n} value={n}>{n === 11 ? 'Small' : n === 14 ? 'Medium' : n === 18 ? 'Large' : 'Extra large'}</option>)}
                    </select>
                  </label>
                </>
              )}
              {selectedSketch.kind === 'text' && (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Text</span>
                    <Input className="h-9" autoFocus value={selectedSketch.text || ''} onChange={(event) => updateSketch(selectedSketch.id, { text: event.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <select value={selectedSketch.size || 16} onChange={(event) => updateSketch(selectedSketch.id, { size: Number(event.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {[12, 16, 22, 30].map((n) => <option key={n} value={n}>{n === 12 ? 'Small' : n === 16 ? 'Medium' : n === 22 ? 'Large' : 'Extra large'}</option>)}
                    </select>
                  </label>
                </>
              )}
              <p className="text-[11px] text-muted-foreground">Drag it on the plan to move it.</p>
              <Button variant="destructive" size="sm" onClick={deleteSketch}>
                <ApperIcon name="Trash2" size={14} />
                Delete
              </Button>
            </div>
          )}
          {rightTab === 'selection' && !selected && !selectedConn && !selectedSketch && (
            <p className="text-xs text-muted-foreground">Select a component or duct run. Drag empty space to pan, pinch or scroll to zoom.</p>
          )}

          {rightTab === 'checks' && (
            <div className="space-y-3">
              {checks.length === 0 && <p className="text-xs text-muted-foreground">Add a unit, outlets and a return grille to run the design checks.</p>}
              {['Airflow', 'Duct sizing', 'Return air', 'Refrigerant', 'Heat load', 'Electrical'].map((grp) => {
                const rows = checks.filter((c) => c.group === grp);
                if (!rows.length) return null;
                return (
                  <div key={grp}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{grp}</div>
                    <div className="space-y-1.5">
                      {rows.map((c, i) => (
                        <button
                          key={`${grp}-${i}`}
                          type="button"
                          disabled={!c.itemId && !c.connId && !c.sketchId}
                          onClick={() => {
                            if (c.itemId) { setSelectedConnId(null); setSelectedId(c.itemId); }
                            else if (c.connId) { setSelectedId(null); setSelectedConnId(c.connId); }
                            else if (c.sketchId) { setSelectedId(null); setSelectedConnId(null); setSelectedSketchId(c.sketchId); setRightTab('selection'); }
                          }}
                          className={`w-full text-left rounded-md border px-2 py-1.5 text-xs ${c.level === 'warn' ? 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100' : c.level === 'ok' ? 'border-green-600/40 bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100' : 'border-border bg-muted/40'} ${c.itemId || c.connId || c.sketchId ? 'hover:ring-1 hover:ring-primary' : 'cursor-default'}`}
                        >
                          <div className="flex items-start gap-1.5 font-semibold">
                            <ApperIcon name={c.level === 'warn' ? 'TriangleAlert' : c.level === 'ok' ? 'CircleCheck' : 'Info'} size={13} className="mt-0.5 shrink-0" />
                            <span>{c.title}</span>
                          </div>
                          <div className="mt-0.5 opacity-80">{c.detail}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {rooms.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Load by room</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {rooms.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0">
                          <td className="py-1 pr-2">
                            <button type="button" className="text-left hover:text-primary" onClick={() => { if (r.kind === 'zone') setSelectedId(r.id); else { setSelectedId(null); setSelectedConnId(null); setSelectedSketchId(r.id); } setRightTab('selection'); }}>{r.name}</button>
                            <div className="text-[10px] text-muted-foreground">{`${r.area.toFixed(1)} m²`}</div>
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums">{`${r.kw.toFixed(1)} kW`}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-1 pr-2 font-semibold">Total</td>
                        <td className="py-1 text-right font-semibold tabular-nums">{`${rooms.reduce((n, r) => n + r.kw, 0).toFixed(1)} kW`}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">{`Rules of thumb: ${LPS_PER_KW} L/s per kW, outlets and branches at ${NECK_VELOCITY} m/s, return grilles ${RA_FACE_VELOCITY} m/s over ${Math.round(RA_FREE_AREA * 100)}% free area, heat load room by room (${CLIMATES[climate]?.label || 'climate'}) from roof, walls, glass, air leakage, people and appliances. A guide for quoting — confirm with manufacturer data.`}</p>
            </div>
          )}

          {rightTab === 'list' && (
          <div className="space-y-3">
            {fanSchedule.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Fan schedule</div>
                <div className="rounded-md border border-border divide-y divide-border text-xs">
                  {fanSchedule.map((f) => (
                    <div key={f.id} className="px-2 py-1.5">
                      <div className="font-semibold">{`${f.tag} · ${f.model}`}</div>
                      <div className="text-muted-foreground">{`${f.kind} · ${f.supplier} · ${f.duty}`}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {runs.some((r) => r.mismatch.length) && (
              <div className="mb-2 rounded-md border border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-2 py-1.5 text-xs">
                {`${runs.filter((r) => r.mismatch.length).length} duct run(s) don't match their spigot size — marked ! on the plan. Check before ordering.`}
              </div>
            )}
            {equipment.groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing drawn yet.</p>
            ) : (
              equipment.groups.map((g) => (
                <div key={g.name}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{g.name}</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.name} className="border-b border-border/60 last:border-0">
                          <td className="py-1 pr-2 align-top">
                            {r.swatch && <span className="inline-block size-2.5 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: r.swatch }} />}
                            {r.name}
                            {r.note && <div className="text-[10px] text-muted-foreground">{r.note}</div>}
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums align-top whitespace-nowrap">{r.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
            {equipment.site.map((g) => (
              <div key={g.name} className="rounded-md border border-dashed border-border p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{g.name}</div>
                <table className="w-full text-xs text-muted-foreground">
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.name} className="border-b border-border/60 last:border-0">
                        <td className="py-1 pr-2 align-top">{r.name}{r.note && <div className="text-[10px]">{r.note}</div>}</td>
                        <td className="py-1 text-right font-semibold tabular-nums align-top">{r.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {equipment.groups.length > 0 && (
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={copyEquipment}>
                  <ApperIcon name="Copy" size={14} />
                  Copy list
                </Button>
                <Button variant="outline" size="sm" onClick={downloadEquipment}>
                  <ApperIcon name="Download" size={14} />
                  CSV
                </Button>
              </div>
            )}
          </div>
          )}
        </aside>
        </div>
      </div>

      {/* Printed schedule (PDF page 2) / pick slip */}
      <div className={`dp-print-only text-black px-1 ${printMode === 'plan' ? 'dp-noprint' : ''}`}>
        {printMode === 'plan' && printHeader('Equipment schedule')}
        {printMode === 'plan' && printCustomer()}
        {equipment.groups.length === 0 ? (
          <p className="text-xs">Nothing drawn yet.</p>
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                {printMode === 'pick' && <th className="py-1 pr-2 w-8">Picked</th>}
                <th className="py-1 pr-2 w-12">Qty</th>
                <th className="py-1 pr-2">Item</th>
                <th className="py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {equipment.groups.map((g) => (
                <Fragment key={g.name}>
                  <tr>
                    <td colSpan={4} className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-wider">{g.name}</td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.name} className="border-b border-gray-300 align-top">
                      {printMode === 'pick' && (
                        <td className="py-1.5 pr-2"><span className="inline-block size-4 border-2 border-black align-middle" /></td>
                      )}
                      <td className="py-1.5 pr-2 font-bold">{r.qty}</td>
                      <td className="py-1.5 pr-2">{r.name}</td>
                      <td className="py-1.5 text-gray-600">{r.note || ''}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {printMode === 'plan' && checks.some((c) => c.level !== 'ok') && (
                <>
                  <tr>
                    <td colSpan={4} className="pt-4 pb-1 font-bold uppercase text-[10px] tracking-wider">Design checks (rules of thumb)</td>
                  </tr>
                  {checks.filter((c) => c.level !== 'ok').map((c, i) => (
                    <tr key={`chk-${i}`} className="border-b border-gray-300 align-top">
                      <td className="py-1.5 pr-2 font-bold">{c.level === 'warn' ? '!' : 'i'}</td>
                      <td className="py-1.5 pr-2">{c.title}</td>
                      <td className="py-1.5 text-gray-600">{c.detail}</td>
                    </tr>
                  ))}
                </>
              )}
              {printMode === 'plan' && equipment.site.map((g) => (
                <Fragment key={g.name}>
                  <tr>
                    <td colSpan={4} className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-wider text-gray-600">{g.name}</td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.name} className="border-b border-dashed border-gray-300 align-top text-gray-600">
                      <td className="py-1.5 pr-2 font-bold">{r.qty}</td>
                      <td className="py-1.5 pr-2">{r.name}</td>
                      <td className="py-1.5">{r.note || ''}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {printMode === 'pick' && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 mt-8 text-[11px]">
            {['Picked by', 'Date', 'Checked by', 'Date'].map((label, i) => (
              <div key={`${label}-${i}`} className="border-b border-black pb-1">{label}</div>
            ))}
          </div>
        )}
      </div>

      <AutoLayoutDialog
        open={autoOpen}
        onOpenChange={setAutoOpen}
        rooms={rooms}
        climate={climate}
        onClimate={(k) => { setClimate(k); markDirty(); }}
        onRoomPatch={patchRoom}
        zoneNames={ZONE_NAMES}
        fcuLabel={autoFcu ? `${tags[autoFcu.id] || 'FCU'} ${shortSpec(autoFcu)}`.trim() : ''}
        modelGroups={DUCTED_MODELS}
        kwOf={modelKw}
        onGenerate={generateAuto}
      />
      <Dialog open={printDialog} onOpenChange={setPrintDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export PDF</DialogTitle>
            <DialogDescription>Pick the sheet and scale. In the print window choose “Save as PDF”, scale 100% (not “Fit to page”) so it measures true.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sheet</span>
              <select value={printOpts.paper} onChange={(event) => setPrintOpts((o) => ({ ...o, paper: event.target.value }))} className="h-9 rounded-md border border-input bg-background px-2">
                <option value="A3">A3 landscape</option>
                <option value="A4">A4 landscape</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Scale</span>
              <select value={printOpts.scale} onChange={(event) => setPrintOpts((o) => ({ ...o, scale: event.target.value }))} className="h-9 rounded-md border border-input bg-background px-2">
                <option value="fit">Fit to sheet</option>
                {PRINT_SCALES.map((n) => <option key={n} value={String(n)} disabled={!scale}>{`1:${n}${scale ? '' : ' (set the plan scale first)'}`}</option>)}
              </select>
            </label>
          </div>
          {!scale && <p className="text-xs text-amber-700">Set the plan scale to print at 1:50, 1:100 etc.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialog(false)}>Cancel</Button>
            <Button onClick={() => { setPrintDialog(false); setTimeout(() => exportPdf('plan'), 50); }}>
              <ApperIcon name="FileDown" size={15} />
              Make PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={jobOpen} onOpenChange={setJobOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Job details</DialogTitle>
            <DialogDescription>Printed on the PDF and the pick slip.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveJob} className="space-y-3">
            {[['Name', 'Customer name'], ['address_c', 'Street address'], ['suburb_c', 'Suburb'], ['phone_c', 'Phone']].map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`job-${key}`}>{label}</Label>
                <Input
                  id={`job-${key}`}
                  type={key === 'phone_c' ? 'tel' : 'text'}
                  value={jobForm[key] || ''}
                  onChange={(event) => setJobForm((f) => ({ ...f, [key]: event.target.value }))}
                />
              </div>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setJobOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={jobSaving || !onSaveProject}>{jobSaving ? 'Saving…' : 'Save details'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="dp-noprint sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card p-3">
        <Button className="w-full h-12" onClick={save}>
          <ApperIcon name="Save" size={18} />
          Save drawing
        </Button>
      </div>
    </div>
  );
}
