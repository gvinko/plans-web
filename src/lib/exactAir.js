// Advantage Air Exact Air Regulators (EAR) — the bodies Echo fits with MyPlace.
// Sizes and limits are from Advantage Air's data sheets (E-BEAR 1, E-MEAR 1, E-CEAR 1).
// Big body: three outlet faces. A face takes one large outlet (up to 16") or a
// pair of small ones (up to 12"), so 6 x 12" or 3 x 16" at most.

export const EAR_ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8'];
export const EAR_MANUAL = 'Manual damper';
export const EAR_OPEN = 'No damper';
const INCH = { 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 550: 22 };
export const earLabel = (mm) => `${INCH[mm]}" (${mm}mm)`;
export const earMm = (v) => Number(String(v || '').match(/\((\d+)mm\)/)?.[1]) || 0;
const SMALL_MAX = 300;

export const EAR = {
  earbig: { name: 'Big Exact Air Regulator (B-EAR)', code: 'B-EAR', inlet: [400, 350, 450, 500, 550, 300, 250, 200], out: [250, 200, 300, 350, 400, 150], maxOut: 6, defOut: 3, foot: [950, 765] },
  earmini: { name: 'Mini Exact Air Regulator (M-EAR)', code: 'M-EAR', inlet: [300, 250, 350, 400, 200], out: [250, 200, 300, 150], maxOut: 2, defOut: 2, foot: [420, 380] },
  earclip: { name: 'Clip-in Exact Air Regulator (C-EAR)', code: 'C-EAR', inlet: [250, 200, 300], out: [250, 200, 300], maxOut: 1, defOut: 1, foot: [300, 380] },
};

export function earCount(type, spec = {}) {
  const b = EAR[type];
  if (type !== 'earbig') return b.defOut;
  return Math.max(1, Math.min(b.maxOut, parseInt(spec.outs, 10) || b.defOut));
}

// Outlets in use: [{ i (1-based), mm, damper }]
export function earOuts(type, spec = {}) {
  const b = EAR[type];
  if (type === 'earclip') return [{ i: 1, mm: earMm(spec.outlet) || b.out[0], damper: spec.zone || EAR_ZONES[0] }];
  return Array.from({ length: earCount(type, spec) }, (_, k) => ({ i: k + 1, mm: earMm(spec[`o${k + 1}`]) || b.out[0], damper: spec[`d${k + 1}`] || EAR_ZONES[k] }));
}
export const earInletMm = (type, spec = {}) => earMm(spec.inlet) || EAR[type].inlet[0];

// Big body: which outlets share a face. Large outlets take a face each, small ones pair up.
export function earFaces(spec = {}) {
  const faces = [];
  earOuts('earbig', spec).forEach((o) => {
    const open = o.mm <= SMALL_MAX && faces.find((f) => f.small && f.outs.length === 1);
    if (open) open.outs.push(o);
    else faces.push({ small: o.mm <= SMALL_MAX, outs: [o] });
  });
  return faces;
}
export const earValid = (type, spec) => (type === 'earbig' && earFaces(spec).length > 3 ? 'Too many large outlets — the Big body takes 6 x 12" or 3 x 16".' : null);

// Keep a Big body orderable: shrink the last oversize outlets to 12" until it fits.
export function earNormalize(type, spec = {}) {
  if (type !== 'earbig') return spec;
  const next = { ...spec };
  for (let guard = 0; guard < 6 && earFaces(next).length > 3; guard += 1) {
    const big = earOuts(type, next).filter((o) => o.mm > SMALL_MAX).pop();
    if (!big) break;
    next[`o${big.i}`] = earLabel(SMALL_MAX);
  }
  return next;
}

// Sizes that can be picked for one field without making the body un-orderable.
export function earOptions(type, key, spec = {}) {
  const b = EAR[type];
  if (key === 'inlet') return b.inlet.map(earLabel);
  const all = b.out.map(earLabel);
  if (type !== 'earbig' || !/^o\d$/.test(key)) return all;
  return all.filter((v) => earMm(v) <= SMALL_MAX || earFaces({ ...spec, [key]: v }).length <= 3);
}

// Connection points in the part's own frame (fx/fy fractions, dir the duct leaves).
export function earPorts(type, spec = {}) {
  if (type === 'earclip') return [{ id: 'w', fx: 0, fy: 0.5, dir: 'w' }, { id: 'e', fx: 1, fy: 0.5, dir: 'e' }];
  const inlet = { id: 'in', fx: 0.5, fy: 0, dir: 'n' };
  if (type === 'earmini') return [inlet, { id: 'o1', fx: 0.27, fy: 1, dir: 's' }, { id: 'o2', fx: 0.73, fy: 1, dir: 's' }];
  const faces = earFaces(spec).slice(0, 3);
  const sides = faces.length === 1 ? ['s'] : faces.length === 2 ? ['w', 'e'] : ['w', 's', 'e'];
  const ports = [inlet];
  faces.forEach((f, k) => {
    const side = sides[k];
    f.outs.forEach((o, j) => {
      const t = f.outs.length === 1 ? 0.5 : j === 0 ? 0.28 : 0.72;
      if (side === 's') ports.push({ id: `o${o.i}`, fx: t, fy: 1, dir: 's' });
      else ports.push({ id: `o${o.i}`, fx: side === 'w' ? 0 : 1, fy: 0.2 + t * 0.7, dir: side });
    });
  });
  return ports;
}

export function earPortMm(type, spec = {}, portId) {
  if (portId === 'in' || (type === 'earclip' && portId === 'w')) return earInletMm(type, spec);
  if (type === 'earclip') return portId === 'e' ? earOuts(type, spec)[0].mm : null;
  const o = earOuts(type, spec).find((x) => `o${x.i}` === portId);
  return o ? o.mm : null;
}

export const earIsMotor = (damper) => EAR_ZONES.includes(damper);
export const earZones = (type, spec) => [...new Set(earOuts(type, spec).map((o) => o.damper).filter(earIsMotor))];

// Short tag text on the plan, e.g. 16/10·10·12
export const earShort = (type, spec) => `${INCH[earInletMm(type, spec)]}/${earOuts(type, spec).map((o) => INCH[o.mm]).join('·')}`;

// Parts-list lines for one regulator: [{ name, qty }]
export function earLines(type, spec = {}) {
  const b = EAR[type];
  const outs = earOuts(type, spec);
  const lines = new Map();
  const add = (name, qty = 1) => { if (qty > 0) lines.set(name, (lines.get(name) || 0) + qty); };
  add(`Advantage Air ${b.name} — body`);
  add(`Exact Air adaptor — ${earLabel(earInletMm(type, spec))}`);
  outs.forEach((o) => add(`Exact Air adaptor — ${earLabel(o.mm)}`));
  if (type === 'earbig') {
    const large = outs.filter((o) => o.mm > SMALL_MAX).length;
    add('Exact Air blank plate', 6 - large * 2 - (outs.length - large));
  }
  const motors = outs.filter((o) => earIsMotor(o.damper)).length;
  add('Exact Air damper motor (MyPlace)', motors);
  add('Exact Air manual damper handle', outs.filter((o) => o.damper === EAR_MANUAL).length);
  if (spec.cable && spec.cable !== 'None') add(`Zone Cable — ${spec.cable}`, motors);
  return [...lines.entries()].map(([name, qty]) => ({ name, qty }));
}

// Catalogue fields for the part panel. `show` hides outlets past the chosen count.
export function earSpecs(type) {
  const b = EAR[type];
  const dampers = [...EAR_ZONES, EAR_MANUAL, EAR_OPEN];
  const cable = { key: 'cable', label: 'Zone cable (per motor)', options: ['12m', '20m', 'None'], noTakeoff: true };
  const inlet = { key: 'inlet', label: 'Inlet', options: b.inlet.map(earLabel), noTakeoff: true, ear: true };
  if (type === 'earclip') {
    return [inlet, { key: 'outlet', label: 'Outlet', options: b.out.map(earLabel), noTakeoff: true }, { key: 'zone', label: 'Damper', options: dampers, noTakeoff: true }, cable];
  }
  const fields = [inlet];
  if (type === 'earbig') fields.push({ key: 'outs', label: 'Outlets', options: ['3 outlets', '2 outlets', '4 outlets', '5 outlets', '6 outlets', '1 outlet'], noTakeoff: true });
  for (let i = 1; i <= b.maxOut; i += 1) {
    const show = (spec) => i <= earCount(type, spec);
    fields.push({ key: `o${i}`, label: `Outlet ${i} size`, options: b.out.map(earLabel), noTakeoff: true, ear: true, show });
    fields.push({ key: `d${i}`, label: `Outlet ${i} damper`, options: dampers, def: EAR_ZONES[i - 1], noTakeoff: true, show });
  }
  fields.push(cable);
  return fields;
}
