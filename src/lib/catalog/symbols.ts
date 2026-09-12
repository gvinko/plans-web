import { Rect, Circle, Line, Polygon, Group, FabricText, type FabricObject } from 'fabric';
import type { PortDef } from './types';
import { setPlandroidData } from '../canvas/plandroidData';

function footprint(w: number, h: number): Rect {
  return new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h,
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: 'transparent',
    selectable: false,
    evented: false,
  });
}

export function buildFanCoilUnit(): Group {
  const w = 110;
  const h = 70;
  const body = new Rect({
    left: 0,
    top: -5,
    width: 100,
    height: 50,
    originX: 'center',
    originY: 'center',
    fill: '#1e293b',
    stroke: '#94a3b8',
    strokeWidth: 1.5,
    rx: 4,
    ry: 4,
  });
  const fanRing = new Circle({
    left: -15,
    top: -5,
    radius: 14,
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: '#38bdf8',
    strokeWidth: 1.5,
  });
  const bladeA = new Line([-25, -5, -5, -5], { stroke: '#38bdf8', strokeWidth: 1.5, originX: 'center', originY: 'center' });
  const bladeB = new Line([-15, -15, -15, 5], { stroke: '#38bdf8', strokeWidth: 1.5, originX: 'center', originY: 'center' });
  const label = new FabricText('FCU', { left: 20, top: -5, fontSize: 11, fill: '#e2e8f0', originX: 'center', originY: 'center' });

  const group = new Group([footprint(w, h), body, fanRing, bladeA, bladeB, label], {
    originX: 'center',
    originY: 'center',
  });

  const ports: PortDef[] = [
    { id: 'supply', x: 50, y: -15, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'return', x: 50, y: 15, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
  ];
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: 'fan-coil-unit', plandroidPorts: ports });
  return group;
}

export function buildPlenum(kind: 'supply' | 'return', branchCount = 3): Group {
  const w = 140;
  const h = 50;
  const body = new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h,
    originX: 'center',
    originY: 'center',
    fill: kind === 'supply' ? '#0c4a6e' : '#7c2d12',
    stroke: '#94a3b8',
    strokeWidth: 1.5,
  });
  const label = new FabricText(kind === 'supply' ? 'SUPPLY PLENUM' : 'RETURN PLENUM', {
    left: 0,
    top: 0,
    fontSize: 8,
    fill: '#e2e8f0',
    originX: 'center',
    originY: 'center',
  });

  const group = new Group([footprint(w + 20, h + 20), body, label], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'inlet', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 400, depth: 250 } },
  ];
  const spacing = w / (branchCount + 1);
  for (let i = 0; i < branchCount; i++) {
    ports.push({
      id: `branch-${i}`,
      x: -w / 2 + spacing * (i + 1),
      y: h / 2,
      angleDeg: 90,
      kind: 'duct_rect',
      sizeMm: { width: 200, depth: 150 },
    });
  }
  setPlandroidData(group, {
    plandroidKind: 'fitting',
    plandroidComponentId: `plenum-${kind}`,
    plandroidPorts: ports,
  });
  return group;
}

export type DiffuserType = 'supply4way' | 'swirl' | 'linearSlot';

export function buildDiffuser(type: DiffuserType): Group {
  const isSlot = type === 'linearSlot';
  const w = isSlot ? 90 : 50;
  const h = isSlot ? 18 : 50;

  const body: FabricObject = isSlot
    ? new Rect({ left: 0, top: 0, width: w, height: h, originX: 'center', originY: 'center', fill: '#1e293b', stroke: '#94a3b8', strokeWidth: 1.5 })
    : new Circle({ left: 0, top: 0, radius: w / 2, originX: 'center', originY: 'center', fill: '#1e293b', stroke: '#94a3b8', strokeWidth: 1.5 });

  const decorations: FabricObject[] = [];
  if (type === 'supply4way') {
    decorations.push(
      new Line([-18, 0, 18, 0], { stroke: '#f59e0b', strokeWidth: 1.2, originX: 'center', originY: 'center' }),
      new Line([0, -18, 0, 18], { stroke: '#f59e0b', strokeWidth: 1.2, originX: 'center', originY: 'center' }),
    );
  } else if (type === 'swirl') {
    decorations.push(
      new Circle({ left: 0, top: 0, radius: 10, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.2 }),
    );
  } else {
    decorations.push(
      new Line([-w / 2 + 8, 0, w / 2 - 8, 0], { stroke: '#f59e0b', strokeWidth: 1.2, originX: 'center', originY: 'center' }),
    );
  }

  const group = new Group([footprint(w + 10, h + 10), body, ...decorations], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    isSlot
      ? { id: 'neck', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 200, depth: 150 } }
      : { id: 'neck', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_round', sizeMm: { diameter: 200 } },
  ];
  setPlandroidData(group, {
    plandroidKind: 'terminal',
    plandroidComponentId: `diffuser-${type}`,
    plandroidPorts: ports,
  });
  return group;
}

export function buildFittingStraight(): Group {
  const w = 60;
  const h = 30;
  const body = new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h * 0.6,
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: '#94a3b8',
    strokeWidth: 1.5,
  });

  const group = new Group([footprint(w, h), body], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'a', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'b', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
  ];
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: 'fitting-straight', plandroidPorts: ports });
  return group;
}

export function buildFittingReducer(): Group {
  const w = 60;
  const hA = 34;
  const hB = 20;
  const trapezoid = new Polygon(
    [
      { x: -w / 2, y: -hA / 2 },
      { x: -w / 2, y: hA / 2 },
      { x: w / 2, y: hB / 2 },
      { x: w / 2, y: -hB / 2 },
    ],
    { fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1.5, originX: 'center', originY: 'center' },
  );

  const group = new Group([footprint(w, hA), trapezoid], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'in', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 400, depth: 250 } },
    { id: 'out', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 250, depth: 150 } },
  ];
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: 'fitting-reducer', plandroidPorts: ports });
  return group;
}

export function buildElbow(bendDeg: 90 | 45): Group {
  const legLen = 40;
  const bendRad = (bendDeg * Math.PI) / 180;
  const outX = Math.cos(bendRad) * legLen;
  const outY = Math.sin(bendRad) * legLen;

  const legA = new Line([-legLen, 0, 0, 0], { stroke: '#94a3b8', strokeWidth: 8, originX: 'center', originY: 'center' });
  const legB = new Line([0, 0, outX, outY], { stroke: '#94a3b8', strokeWidth: 8, originX: 'center', originY: 'center' });

  const span = legLen * 2 + 20;
  const group = new Group([footprint(span, span), legA, legB], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'in', x: -legLen, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'out', x: outX, y: outY, angleDeg: bendDeg, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
  ];
  setPlandroidData(group, {
    plandroidKind: 'fitting',
    plandroidComponentId: `fitting-elbow-${bendDeg}`,
    plandroidPorts: ports,
  });
  return group;
}
