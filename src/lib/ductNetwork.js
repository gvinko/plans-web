// Remap graph attachments without moving their physical location.
export function mergeAttachment(link, { xId, yId, nX, nY, xRev, yRev }) {
  if (!link || link.kind === 'port' || (link.id !== xId && link.id !== yId)) return link;
  const isX = link.id === xId;
  const rev = isX ? xRev : yRev;
  const offset = isX ? 0 : nX - 1;
  const n = isX ? nX : nY;
  if (link.end) {
    const end = rev ? (link.end === 'start' ? 'end' : 'start') : link.end;
    if ((isX && end === 'end') || (!isX && end === 'start')) return null;
    return { ...link, id: xId, end };
  }
  if (!Number.isInteger(link.seg)) return null;
  return { ...link, id: xId, seg: offset + (rev ? n - 2 - link.seg : link.seg), t: rev ? 1 - link.t : link.t,
    ...(rev && link.side != null ? { side: -link.side } : {}) };
}

export function splitSegmentAttachment(link, id, seg, t) {
  if (!link || link.id !== id || !Number.isInteger(link.seg)) return link;
  if (link.seg < seg) return link;
  if (link.seg > seg) return { ...link, seg: link.seg + 1 };
  return link.t <= t ? { ...link, t: link.t / t } : { ...link, seg: seg + 1, t: (link.t - t) / (1 - t) };
}

export function networkIssues(sketch, items) {
  const runs = new Map(sketch.filter(r => r.kind === 'smduct').map(r => [r.id, r]));
  const itemIds = new Set(items.map(i => i.id));
  const valid = link => {
    if (!link) return true;
    if (link.kind === 'port') return itemIds.has(link.itemId);
    const target = runs.get(link.id);
    if (!target || target.pts?.length < 2) return false;
    if (link.end) return ['start','end'].includes(link.end);
    return Number.isInteger(link.seg) && link.seg >= 0 && link.seg < target.pts.length - 1 && Number.isFinite(link.t) && link.t >= 0 && link.t <= 1;
  };
  const problems = [];
  for (const r of runs.values()) {
    if ([r.a,r.b].some(l => l && (l.id === r.id || !valid(l)))) problems.push({ sketchId:r.id, title:'Duct has a broken connection', detail:'Reconnect the affected end or branch.' });
    if (!r.pts || r.pts.length < 2 || r.pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) problems.push({ sketchId:r.id, title:'Invalid duct geometry', detail:'Inspect or redraw this run.' });
  }
  for (const i of items) if (i.onRun && !valid(i.onRun)) problems.push({ itemId:i.id, title:'Fitting has a broken duct link', detail:'Reseat the fitting on its duct run.' });
  return problems;
}
