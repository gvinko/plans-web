// Airflow stage 2: work out each sheet metal run's L/s from the outlets and grilles it feeds.
// The duct system is treated as a tree rooted at its unit (or fan). A run carries the sum of
// the terminals downstream of it — at its upstream end, which is what sizes the run.
// Pure functions, no React, so they can be tested on their own.

const TERMINAL = new Set(['supplyTerm', 'returnTerm', 'exhaustTerm']);
const ROOT_ROLES = new Set(['unit', 'section']);
const ROOT_TYPES = new Set(['exhfan']);

/**
 * @param {{ sketch:any[], items:any[], connections?:any[], joins?:any[] }} d
 * @param {{ roleOf:(type:string)=>string, roomLps?:(item:any)=>number|null }} o
 * @returns {{ runs: Map<string,{lps:number, outlets:number, missing:number, from:'auto'}>, terminals: Map<string,{lps:number, source:'typed'|'room'|null}> }}
 */
export function networkAirflow({ sketch, items, connections = [], joins = [] }, { roleOf, roomLps }) {
  const isService = (c) => c && (c.type === 'pipe' || c.type === 'drain' || c.type === 'power');
  const byId = new Map(items.map((i) => [i.id, i]));
  const adj = new Map();
  const link = (a, b) => {
    if (!a || !b || a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  const runs = sketch.filter((s) => s.kind === 'smduct');
  const runIds = new Set(runs.map((s) => s.id));
  runs.forEach((s) => {
    const r = `r:${s.id}`;
    if (!adj.has(r)) adj.set(r, new Set());
    ['a', 'b'].forEach((k) => {
      const l = s[k];
      if (!l) return;
      if (l.kind === 'port' && byId.has(l.itemId)) link(r, `i:${l.itemId}`);
      else if ((l.kind === 'run' || l.kind === 'side') && runIds.has(l.id)) link(r, `r:${l.id}`);
    });
  });
  items.forEach((it) => { if (it.onRun?.id && runIds.has(it.onRun.id)) link(`r:${it.onRun.id}`, `i:${it.id}`); });
  connections.forEach((c) => { if (!isService(c) && !c.remove) link(`i:${c.from?.itemId}`, `i:${c.to?.itemId}`); });
  joins.forEach((j) => link(`i:${j.a?.itemId}`, `i:${j.b?.itemId}`));

  // Each terminal's own airflow: typed on the part, else its share of the room's load.
  const terminals = new Map();
  items.forEach((it) => {
    if (it.remove || !TERMINAL.has(roleOf(it.type))) return;
    const typed = Number(it.airflow);
    if (typed > 0) { terminals.set(it.id, { lps: typed, source: 'typed' }); return; }
    const share = roleOf(it.type) === 'supplyTerm' && roomLps ? Number(roomLps(it)) : 0;
    terminals.set(it.id, share > 0 ? { lps: share, source: 'room' } : { lps: 0, source: null });
  });

  const out = new Map();
  const seen = new Set();
  // Walk each connected system once, from its root.
  const comps = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const q = [start];
    seen.add(start);
    while (q.length) {
      const n = q.shift();
      comp.push(n);
      adj.get(n).forEach((m) => { if (!seen.has(m)) { seen.add(m); q.push(m); } });
    }
    comps.push(comp);
  }
  comps.forEach((comp) => {
    if (!comp.some((n) => n.startsWith('r:'))) return;
    const isRoot = (n) => {
      if (!n.startsWith('i:')) return false;
      const it = byId.get(n.slice(2));
      return it && !it.remove && (ROOT_ROLES.has(roleOf(it.type)) || ROOT_TYPES.has(it.type));
    };
    const root = comp.find((n) => isRoot(n) && ROOT_ROLES.has(roleOf(byId.get(n.slice(2)).type))) || comp.find(isRoot);
    if (!root) return; // no unit or fan in this system: can't tell which way air flows
    const flowOf = (n) => (n.startsWith('i:') ? terminals.get(n.slice(2)) : null);
    const total = comp.reduce((t, n) => t + (flowOf(n)?.lps || 0), 0);
    // Depth-first from the root; subtree sums give each run's flow.
    const parent = new Map([[root, null]]);
    const order = [];
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      order.push(n);
      adj.get(n).forEach((m) => { if (!parent.has(m)) { parent.set(m, n); stack.push(m); } });
    }
    const sum = new Map();
    const count = new Map();
    const miss = new Map();
    const open = new Map(); // louvre / roof cowl downstream (discharge or intake)
    const isOpen = (n) => n.startsWith('i:') && roleOf(byId.get(n.slice(2))?.type) === 'anyTerm';
    for (let k = order.length - 1; k >= 0; k -= 1) {
      const n = order[k];
      const f = flowOf(n);
      let s = f?.lps || 0;
      let c = f ? 1 : 0;
      let m = f && !(f.lps > 0) ? 1 : 0;
      let o = isOpen(n) ? 1 : 0;
      adj.get(n).forEach((ch) => {
        if (parent.get(ch) !== n) return;
        s += sum.get(ch) || 0;
        c += count.get(ch) || 0;
        m += miss.get(ch) || 0;
        o += open.get(ch) || 0;
      });
      sum.set(n, s);
      count.set(n, c);
      miss.set(n, m);
      open.set(n, o);
      if (n.startsWith('r:')) {
        if (c) out.set(n.slice(2), { lps: Math.round(s), outlets: c, missing: m, from: 'auto' });
        // Past the last grille to a louvre or roof cowl (fan discharge, outside air): the whole system.
        else if (o && total > 0) out.set(n.slice(2), { lps: Math.round(total), outlets: comp.filter((x) => flowOf(x)).length, missing: 0, from: 'auto' });
      }
    }
  });
  return { runs: out, terminals };
}
