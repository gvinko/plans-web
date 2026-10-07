import { Circle, FabricText, Group, Line, Rect } from 'fabric';
import type { PortDef } from './types';
import { setPlandroidData } from '../canvas/plandroidData';

export type CommercialSymbolKind = 'fcu' | 'supply-fan' | 'exhaust-fan' | 'toilet-exhaust-fan' | 'fire-damper' | 'motorised-damper' | 'outside-air-louvre' | 'transfer-grille' | 'exhaust-grille';

function baseBox(label: string, accent: string, ports: PortDef[], componentId: string, kind: 'equipment'|'fitting'|'terminal'): Group {
  const w = 72, h = 42;
  const footprint = new Rect({ left:0, top:0, width:w+12, height:h+12, originX:'center', originY:'center', fill:'transparent', stroke:'transparent', selectable:false, evented:false });
  const body = new Rect({ left:0, top:0, width:w, height:h, originX:'center', originY:'center', fill:'#0f172a', stroke:accent, strokeWidth:1.5, rx:2, ry:2 });
  const text = new FabricText(label, { left:0, top:0, fontSize:9, fontWeight:'bold', fill:'#e2e8f0', originX:'center', originY:'center' });
  const group = new Group([footprint, body, text], { originX:'center', originY:'center' });
  setPlandroidData(group, { plandroidKind:kind, plandroidComponentId:componentId, plandroidPorts:ports, plandroidCommercialStatus:'new' });
  return group;
}

export function buildCommercialSymbol(kind: CommercialSymbolKind): Group {
  if (kind === 'fcu') return baseBox('FCU', '#38bdf8', [{ id:'return', x:-36, y:0, angleDeg:180, kind:'duct_rect', sizeMm:{width:500, depth:300} }, { id:'supply', x:36, y:0, angleDeg:0, kind:'duct_rect', sizeMm:{width:500, depth:300} }], 'commercial-fcu', 'equipment');
  if (kind === 'supply-fan' || kind === 'exhaust-fan' || kind === 'toilet-exhaust-fan') {
    const id = 'commercial-' + kind; const label = kind === 'supply-fan' ? 'SAF' : kind === 'toilet-exhaust-fan' ? 'TEF' : 'EF';
    const group = baseBox(label, '#22d3ee', [{ id:'in', x:-36, y:0, angleDeg:180, kind:'duct_round', sizeMm:{diameter:250} }, { id:'out', x:36, y:0, angleDeg:0, kind:'duct_round', sizeMm:{diameter:250} }], id, 'equipment');
    group.add(new Circle({ left:0, top:0, radius:12, originX:'center', originY:'center', fill:'transparent', stroke:'#22d3ee', strokeWidth:1, selectable:false, evented:false })); return group;
  }
  if (kind === 'fire-damper' || kind === 'motorised-damper') {
    const motorised = kind === 'motorised-damper'; const id = 'commercial-' + kind; const accent = motorised ? '#fbbf24' : '#f87171';
    const group = baseBox(motorised ? 'MD' : 'FD', accent, [{ id:'in', x:-36, y:0, angleDeg:180, kind:'duct_rect', sizeMm:{width:400, depth:250} }, { id:'out', x:36, y:0, angleDeg:0, kind:'duct_rect', sizeMm:{width:400, depth:250} }], id, 'fitting');
    group.add(new Line([-12, 12, 12, -12], { stroke:accent, strokeWidth:2, originX:'center', originY:'center', selectable:false, evented:false })); return group;
  }
  const map = { 'outside-air-louvre':['OA','commercial-outside-air-louvre'], 'transfer-grille':['TA','commercial-transfer-grille'], 'exhaust-grille':['EA','commercial-exhaust-grille'] } as const;
  const item = map[kind as keyof typeof map];
  return baseBox(item[0], '#a78bfa', [{ id:'neck', x:-36, y:0, angleDeg:180, kind:'duct_round', sizeMm:{diameter:200} }], item[1], 'terminal');
}