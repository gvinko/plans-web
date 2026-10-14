// Automatic ducted layout scenarios.
// Builds FCU (if needed) -> S/A plenum -> zone motors -> BTO chain -> outlets,
// plus a return air grille, from rooms that have a heat load and a zone.
// Everything comes back as normal drawing parts so it can be edited after "Select".

const INCH_FROM_MM = { 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18 };
const ROUND_SIZES = [150, 200, 250, 300, 350, 400, 450];
const DUCT_VELOCITY = 4; // m/s in flex runs
const NECK_VELOCITY = 2.5; // m/s through an outlet neck
const RA_FACE_VELOCITY = 2.5;
const RA_FREE_AREA = 0.75;
const MAX_ZONES = 6;

const pad2 = (n) => String(n).padStart(2, '0');
const neckLps = (mm) => (Math.PI * (mm / 1000) ** 2) / 4 * NECK_VELOCITY * 1000;

export function ductMmFor(lps, min = 150) {
  const area = lps / 1000 / DUCT_VELOCITY;
  const dia = Math.sqrt((4 * area) / Math.PI) * 1000;
  return ROUND_SIZES.find((s) => s >= dia && s >= min) || 450;
}

function zoneSize(lps) {
  const mm = Math.max(250, Math.min(400, ductMmFor(lps, 250)));
  return { 250: '10" (250mm)', 300: '12" (300mm)', 350: '14" (350mm)', 400: '16" (400mm)' }[mm];
}

function btoSize(inMm, throughMm, branchMm, valid) {
  const i = Math.max(10, Math.min(18, INCH_FROM_MM[inMm] || 14));
  const a = Math.max(8, Math.min(i, INCH_FROM_MM[Math.max(throughMm, branchMm)] || 10));
  const b = Math.max(6, Math.min(a, INCH_FROM_MM[Math.min(throughMm, branchMm)] || 8));
  const want = `${pad2(i)} / ${pad2(a)} / ${pad2(b)}`;
  if (valid.includes(want)) return want;
  const nums = (s) => s.split(' / ').map(Number);
  const target = [i, a, b];
  return valid.reduce((best, s) => {
    const d = nums(s).reduce((n, v, k) => n + Math.abs(v - target[k]), 0);
    return d < best.d ? { s, d } : best;
  }, { s: valid[0], d: Infinity }).s;
}

function plenumSize(spigots, spigotLps) {
  const inch = spigotLps > 330 ? 16 : 14;
  const mm = inch === 16 ? 400 : 350;
  return `${spigots} x ${inch}" (${mm}mm)`;
}

function raGrilleFor(lps, grilles) {
  const need = lps / 1000 / (RA_FACE_VELOCITY * RA_FREE_AREA);
  const sized = grilles
    .map((g) => {
      const m = g.match(/(\d+)\s*x\s*(\d+)/);
      return m ? { g, area: (Number(m[1]) * Number(m[2])) / 1e6 } : null;
    })
    .filter(Boolean)
    .sort((x, y) => x.area - y.area);
  return (sized.find((s) => s.area >= need) || { g: 'Full Tile' }).g;
}

// Split one room rectangle into n outlet spots along its long side.
function outletSpots(room, n) {
  const w = room.x2 - room.x1;
  const h = room.y2 - room.y1;
  const cx = (room.x1 + room.x2) / 2;
  const cy = (room.y1 + room.y2) / 2;
  return Array.from({ length: n }, (_, i) => (w >= h
    ? { x: room.x1 + (w * (i + 0.5)) / n, y: cy }
    : { x: cx, y: room.y1 + (h * (i + 0.5)) / n }));
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * rooms: [{ id, name, zone, x1, y1, x2, y2, coolW, type }]  (world units, normalised)
 * opts: { option: 'comfort' | 'economy', fcu, model, unitKw, ppm, ctx }
 * ctx: { newItem(type, spec, at, extra), portInfo(item, portId), itemBox(item), btoSizes, raGrilles }
 */
export function buildLayout(rooms, opts) {
  const { option, ppm, ctx } = opts;
  const notes = [];
  const items = [];
  const connections = [];
  const joins = [];
  const id = () => crypto.randomUUID();

  const used = rooms.filter((r) => r.coolW > 0);
  if (!used.length) return { error: 'Add at least one room with a heat load.' };
  const totalW = used.reduce((n, r) => n + r.coolW, 0);

  // 1. Indoor unit — reuse the one on the plan, or drop the chosen model in.
  let fcu = opts.fcu;
  if (!fcu) {
    if (!opts.model) return { error: 'Pick an indoor unit model.' };
    const cx = used.reduce((n, r) => n + ((r.x1 + r.x2) / 2) * r.coolW, 0) / totalW;
    const cy = used.reduce((n, r) => n + ((r.y1 + r.y2) / 2) * r.coolW, 0) / totalW;
    fcu = ctx.newItem('indoor', { model: opts.model }, { x: cx, y: cy - 1.5 * ppm });
    items.push(fcu);
  }
  const unitKw = opts.unitKw || totalW / 1000;
  const unitLps = Number(fcu.airflow) > 0 ? Number(fcu.airflow) : Math.round(unitKw * 50);

  // 2. Zones — rooms grouped by zone name, kept to what one plenum can feed.
  const zoneMap = new Map();
  used.forEach((r) => {
    const z = r.zone && r.zone !== 'None' ? r.zone : 'Zone 1';
    if (!zoneMap.has(z)) zoneMap.set(z, []);
    zoneMap.get(z).push(r);
  });
  let zones = [...zoneMap.entries()].map(([name, list]) => ({ name, rooms: list }));
  if (zones.length > MAX_ZONES) {
    notes.push(`Only ${MAX_ZONES} zones are laid out automatically — the rest were merged into ${zones[MAX_ZONES - 1].name}.`);
    const extra = zones.slice(MAX_ZONES - 1).flatMap((z) => z.rooms);
    zones = [...zones.slice(0, MAX_ZONES - 1), { name: zones[MAX_ZONES - 1].name, rooms: extra }];
  }
  zones.forEach((z) => {
    z.coolW = z.rooms.reduce((n, r) => n + r.coolW, 0);
    z.lps = (unitLps * z.coolW) / totalW;
  });

  // 3. S/A plenum bolted to the FCU supply face.
  const spigots = Math.min(3, zones.length);
  const perSpigot = Array.from({ length: spigots }, () => []);
  zones.forEach((z, i) => perSpigot[i % spigots].push(z));
  const maxSpigotLps = Math.max(...perSpigot.map((g) => g.reduce((n, z) => n + z.lps, 0)));
  const sa = ctx.portInfo(fcu, 'sa');
  const plenumDraft = ctx.newItem('saplenum', { size: plenumSize(spigots, maxSpigotLps) }, { x: sa.x, y: sa.y }, { rot: fcu.rot || 0 });
  const pBox = ctx.itemBox(plenumDraft);
  const [dx, dy] = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[sa.dir] || [0, 1];
  const plenum = { ...plenumDraft, cx: sa.x + (dx * pBox.uh) / 2, cy: sa.y + (dy * pBox.uh) / 2 };
  items.push(plenum);
  joins.push({ id: id(), a: { itemId: fcu.id, portId: 'sa' }, b: { itemId: plenum.id, portId: 'in' } });

  // 4. Zone motors in a row past the plenum, then outlets in each room.
  const rowY = plenum.cy + pBox.h / 2 + 1.3 * ppm;
  const zoneCount = zones.length;
  let flexWorld = 0;
  const link = (fromItem, fromPort, toItem, toPort, size, type = 'flex') => {
    const a = ctx.portInfo(fromItem, fromPort);
    const b = ctx.portInfo(toItem, toPort);
    flexWorld += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    connections.push({ id: id(), type, size, from: { itemId: fromItem.id, portId: fromPort }, to: { itemId: toItem.id, portId: toPort }, auto: true });
  };

  const outletCap = option === 'economy' ? neckLps(300) : neckLps(250);
  const neckChoices = option === 'economy' ? [200, 250, 300] : [150, 200, 250];
  let outletCount = 0;
  const zoneMotors = [];

  zones.forEach((z, zi) => {
    const x = plenum.cx + (zi - (zoneCount - 1) / 2) * 1.1 * ppm;
    const motor = ctx.newItem('zone', { size: zoneSize(z.lps), cable: '12m', zone: z.name }, { x, y: rowY });
    items.push(motor);
    zoneMotors.push({ zone: z, motor });

    // Outlets for every room in this zone.
    const outlets = [];
    z.rooms.forEach((r) => {
      if (r.type === 'hall' && z.rooms.length > 1) return; // halls take the return, not supply
      const roomLps = (unitLps * r.coolW) / totalW;
      const n = Math.max(1, Math.ceil(roomLps / outletCap));
      const each = roomLps / n;
      const neck = neckChoices.find((mm) => neckLps(mm) >= each) || neckChoices[neckChoices.length - 1];
      outletSpots(r, n).forEach((p) => {
        const d = ctx.newItem('supply', { neck: `${neck}mm` }, p);
        items.push(d);
        outlets.push({ item: d, lps: each, mm: neck, room: r });
        outletCount += 1;
      });
    });
    if (!outlets.length) return;

    // Nearest outlet first along a chain of BTOs: branch to an outlet, run on to the next.
    const motorPt = { x: motor.cx, y: motor.cy };
    outlets.sort((a, b) => dist(motorPt, { x: a.item.cx, y: a.item.cy }) - dist(motorPt, { x: b.item.cx, y: b.item.cy }));
    let feed = { item: motor, port: 'e' };
    let remaining = outlets.reduce((n, o) => n + o.lps, 0);
    outlets.forEach((o, k) => {
      const runMm = ductMmFor(remaining, 200);
      if (k === outlets.length - 1) {
        link(feed.item, feed.port, o.item, 'n', o.mm);
        return;
      }
      const next = outlets[k + 1].item;
      const at = { x: (o.item.cx + next.cx) / 2, y: Math.min(o.item.cy, next.cy) - 0.6 * ppm };
      const throughMm = ductMmFor(remaining - o.lps, 200);
      const bto = ctx.newItem('bto', { size: btoSize(runMm, throughMm, o.mm, ctx.btoSizes) }, at);
      items.push(bto);
      link(feed.item, feed.port, bto, 'w', runMm);
      link(bto, 's', o.item, 'n', o.mm);
      feed = { item: bto, port: 'e' };
      remaining -= o.lps;
    });
  });

  // 5. Plenum spigots to the zone motors (a BTO splits a spigot shared by two zones).
  perSpigot.forEach((group, si) => {
    const portId = `sa${si + 1}`;
    if (!group.length) return;
    const motors = group.map((z) => zoneMotors.find((m) => m.zone === z)?.motor).filter(Boolean);
    const lps = group.reduce((n, z) => n + z.lps, 0);
    const mm = ductMmFor(lps, 250);
    if (motors.length === 1) {
      link(plenum, portId, motors[0], 'w', mm);
      return;
    }
    let feed = { item: plenum, port: portId };
    let left = lps;
    motors.forEach((m, k) => {
      const zLps = group[k].lps;
      const zMm = ductMmFor(zLps, 250);
      if (k === motors.length - 1) {
        link(feed.item, feed.port, m, 'w', zMm);
        return;
      }
      const at = { x: m.cx - 0.7 * ppm, y: (plenum.cy + m.cy) / 2 };
      const bto = ctx.newItem('bto', { size: btoSize(ductMmFor(left, 250), ductMmFor(left - zLps, 250), zMm, ctx.btoSizes) }, at);
      items.push(bto);
      link(feed.item, feed.port, bto, 'w', ductMmFor(left, 250));
      link(bto, 's', m, 'w', zMm);
      feed = { item: bto, port: 'e' };
      left -= zLps;
    });
  });

  // 6. Return air: hallway if there is one, else the room nearest the unit.
  const fcuPt = { x: fcu.cx, y: fcu.cy };
  const raRoom = rooms.find((r) => r.type === 'hall')
    || [...used].sort((a, b) => dist({ x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 }, fcuPt) - dist({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }, fcuPt))[0];
  const grille = raGrilleFor(unitLps, ctx.raGrilles);
  const ra = ctx.newItem('return', { size: grille, box: 'None' }, { x: (raRoom.x1 + raRoom.x2) / 2, y: (raRoom.y1 + raRoom.y2) / 2 });
  items.push(ra);
  const raMm = ductMmFor(unitLps, 350);
  if (unitLps / 1000 / ((Math.PI * 0.45 ** 2) / 4) > 5.5) notes.push('Return air is above 5.5 m/s in one 450 duct — consider a second return grille.');
  link(ra, 'ra1', fcu, 'ra', raMm, 'return');

  const flexM = Math.ceil((flexWorld / ppm) * 1.15);
  notes.push('Add the zone controller and sensors, then check outlet positions against lights and trusses.');
  return {
    items,
    connections,
    joins,
    summary: {
      option,
      title: option === 'economy' ? 'Fewer, larger outlets' : 'More, smaller outlets',
      zones: zones.length,
      outlets: outletCount,
      btos: items.filter((i) => i.type === 'bto').length,
      flexM,
      unitKw,
      loadKw: totalW / 1000,
      unitLps,
      grille,
      newFcu: !opts.fcu,
      notes,
    },
  };
}

// Smallest model in a list whose kW covers the load.
export function suggestModel(models, needKw, kwOf) {
  const sized = models.map((m) => ({ m, kw: kwOf(m) })).filter((x) => x.kw > 0).sort((a, b) => a.kw - b.kw);
  return (sized.find((x) => x.kw >= needKw) || sized[sized.length - 1] || {}).m || '';
}
