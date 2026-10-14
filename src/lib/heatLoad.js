// Room-by-room residential cooling / heating load estimate.
// Simplified component method (roof, walls, glass, air leakage, people, appliances)
// tuned for NSW housing. A quoting guide, not an AS/NZS or AIRAH design calc.

export const CLIMATES = {
  coastal: { label: 'Sydney coastal / Illawarra', dtCool: 8, dtHeat: 14, solar: 1.0 },
  west: { label: 'Western Sydney / Macarthur', dtCool: 12, dtHeat: 17, solar: 1.1 },
  inland: { label: 'Inland NSW (hot summers)', dtCool: 14, dtHeat: 18, solar: 1.2 },
  highlands: { label: 'Southern Highlands / Tablelands', dtCool: 8, dtHeat: 22, solar: 1.0 },
};
export const DEFAULT_CLIMATE = 'west';

export const ROOM_TYPES = {
  living: { label: 'Living / Family', people: 4, internal: 300 },
  kitchen: { label: 'Kitchen / Meals', people: 3, internal: 900 },
  master: { label: 'Main bedroom', people: 2, internal: 150 },
  bed: { label: 'Bedroom', people: 2, internal: 100 },
  study: { label: 'Study / Office', people: 1, internal: 250 },
  media: { label: 'Media / Rumpus', people: 5, internal: 400 },
  hall: { label: 'Hall / Entry (return)', people: 0, internal: 50 },
  other: { label: 'Other', people: 2, internal: 100 },
};

// Peak solar gain through clear glass, W per m² of glass, by the way the window faces.
export const ORIENTS = {
  mixed: { label: 'Mixed / not sure', solar: 250 },
  N: { label: 'North', solar: 230 },
  NE: { label: 'North-east', solar: 300 },
  E: { label: 'East', solar: 380 },
  SE: { label: 'South-east', solar: 200 },
  S: { label: 'South', solar: 120 },
  SW: { label: 'South-west', solar: 300 },
  W: { label: 'West', solar: 480 },
  NW: { label: 'North-west', solar: 380 },
  none: { label: 'No windows', solar: 0 },
};

export const SHADING = {
  none: { label: 'No shading', factor: 1 },
  eaves: { label: 'Eaves / awning', factor: 0.7 },
  blinds: { label: 'Eaves + blinds', factor: 0.5 },
  lowe: { label: 'Tinted / Low-E glass', factor: 0.6 },
};

export const CEILINGS = {
  insulated: { label: 'Roof above, insulated', cool: 22, u: 0.35 },
  uninsulated: { label: 'Roof above, no insulation', cool: 55, u: 2.5 },
  floor: { label: 'Another floor above', cool: 5, u: 0 },
};

const AIR_CHANGES = 0.7;
const GLASS_U = 5.8;
const WALL_U = 0.6;
const WALL_SOLAR = 4;
const PERSON_W = 130;

export function defaultRoomType(name) {
  const n = String(name || '').toLowerCase();
  if (/kitch|meal/.test(n)) return 'kitchen';
  if (/master|main bed|ensuite|mbr/.test(n)) return 'master';
  if (/bed|br\s?\d/.test(n)) return 'bed';
  if (/study|office/.test(n)) return 'study';
  if (/media|rumpus|games|theatre|theater/.test(n)) return 'media';
  if (/hall|entry|foyer|corridor|landing/.test(n)) return 'hall';
  if (/liv|lounge|family|dining/.test(n)) return 'living';
  return 'other';
}

// Fill in anything not entered yet with sensible defaults.
export function roomInputs(hl = {}, areaM2 = 0, name = '') {
  const type = hl.type || defaultRoomType(name);
  const t = ROOM_TYPES[type] || ROOM_TYPES.other;
  return {
    type,
    orient: hl.orient || 'mixed',
    glass: hl.glass != null && hl.glass !== '' ? Number(hl.glass) : Math.round(areaM2 * 0.15 * 10) / 10,
    shading: hl.shading || 'eaves',
    walls: hl.walls != null && hl.walls !== '' ? Number(hl.walls) : 1,
    ceiling: hl.ceiling || 'insulated',
    height: Number(hl.height) || 2.4,
    people: hl.people != null && hl.people !== '' ? Number(hl.people) : t.people,
  };
}

export function calcRoomLoad(hl, areaM2, climateKey = DEFAULT_CLIMATE, name = '') {
  const area = Math.max(0, Number(areaM2) || 0);
  const c = CLIMATES[climateKey] || CLIMATES[DEFAULT_CLIMATE];
  const r = roomInputs(hl, area, name);
  const type = ROOM_TYPES[r.type] || ROOM_TYPES.other;
  const ceil = CEILINGS[r.ceiling] || CEILINGS.insulated;
  const vol = area * r.height;
  const glass = Math.max(0, r.glass);
  const wallArea = Math.max(0, r.walls * Math.sqrt(area) * r.height - glass);
  const solar = (ORIENTS[r.orient] || ORIENTS.mixed).solar * (SHADING[r.shading] || SHADING.none).factor;

  const cool = {
    roof: area * ceil.cool * c.solar,
    walls: wallArea * (WALL_U * c.dtCool + WALL_SOLAR),
    glass: glass * (solar * c.solar + GLASS_U * c.dtCool),
    air: 0.33 * AIR_CHANGES * vol * c.dtCool,
    people: r.people * PERSON_W,
    internal: type.internal,
  };
  const heat = {
    roof: area * ceil.u * c.dtHeat,
    walls: wallArea * WALL_U * c.dtHeat,
    glass: glass * GLASS_U * c.dtHeat,
    air: 0.33 * AIR_CHANGES * vol * c.dtHeat,
  };
  const coolW = Object.values(cool).reduce((n, v) => n + v, 0);
  const heatW = Object.values(heat).reduce((n, v) => n + v, 0);
  return {
    inputs: r,
    cool,
    coolW,
    heatW,
    coolKw: coolW / 1000,
    heatKw: heatW / 1000,
    wPerM2: area ? coolW / area : 0,
  };
}
