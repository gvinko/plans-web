import { Rect, Circle, Line, Polygon, Group, FabricText, type FabricObject } from 'fabric';
import type { PortDef, IconStyle } from './types';
import { setPlandroidData } from '../canvas/plandroidData';

const DEFAULT_STYLE: IconStyle = 'simple';

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

/** A short duct-style leg drawn as a thin double-line (stroked) rectangle between two points — used by the 'professional' fitting variants so they read as sheet metal rather than a single thick line. */
function ductLeg(x1: number, y1: number, x2: number, y2: number, thickness: number, color = '#94a3b8'): Rect {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return new Rect({
    left: (x1 + x2) / 2,
    top: (y1 + y2) / 2,
    width: length,
    height: thickness,
    angle,
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: color,
    strokeWidth: 1.2,
  });
}

function dashedCenterline(x1: number, y1: number, x2: number, y2: number): Line {
  return new Line([x1, y1, x2, y2], {
    stroke: '#64748b',
    strokeWidth: 0.75,
    strokeDashArray: [4, 3],
    originX: 'center',
    originY: 'center',
  });
}

export function buildFanCoilUnit(style: IconStyle = DEFAULT_STYLE): Group {
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
  const label = new FabricText('FCU', { left: 20, top: -5, fontSize: 11, fill: '#e2e8f0', originX: 'center', originY: 'center' });

  const children: FabricObject[] = [footprint(w, h), body, fanRing, label];

  if (style === 'professional') {
    const casingLiner = new Rect({
      left: 0,
      top: -5,
      width: 92,
      height: 42,
      originX: 'center',
      originY: 'center',
      fill: 'transparent',
      stroke: '#475569',
      strokeWidth: 0.75,
      strokeDashArray: [3, 2],
    });
    // Standard 3-blade fan glyph instead of a plain crosshair.
    const blades: Line[] = [0, 120, 240].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return new Line([-15, -5, -15 + Math.cos(rad) * 12, -5 + Math.sin(rad) * 12], {
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        originX: 'center',
        originY: 'center',
      });
    });
    const airflowArrow = new Polygon(
      [
        { x: 46, y: -15 },
        { x: 54, y: -10 },
        { x: 46, y: -5 },
      ],
      { fill: '#38bdf8', stroke: 'transparent', originX: 'center', originY: 'center' },
    );
    children.push(casingLiner, ...blades, airflowArrow);
  } else {
    children.push(
      new Line([-25, -5, -5, -5], { stroke: '#38bdf8', strokeWidth: 1.5, originX: 'center', originY: 'center' }),
      new Line([-15, -15, -15, 5], { stroke: '#38bdf8', strokeWidth: 1.5, originX: 'center', originY: 'center' }),
    );
  }

  const group = new Group(children, { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'supply', x: 50, y: -15, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'return', x: 50, y: 15, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
  ];
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: 'fan-coil-unit', plandroidPorts: ports });
  return group;
}

export function buildPlenum(kind: 'supply' | 'return', branchCount = 3, style: IconStyle = DEFAULT_STYLE): Group {
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

  const children: FabricObject[] = [footprint(w + 20, h + 20), body, label];

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

  if (style === 'professional') {
    const liner = new Rect({
      left: 0,
      top: 0,
      width: w - 8,
      height: h - 8,
      originX: 'center',
      originY: 'center',
      fill: 'transparent',
      stroke: '#475569',
      strokeWidth: 0.75,
      strokeDashArray: [3, 2],
    });
    // Spigot stubs at each branch — small trapezoids reading as real sheet-metal takeoffs.
    const spigots = ports.slice(1).map(
      (p) =>
        new Polygon(
          [
            { x: p.x - 10, y: h / 2 },
            { x: p.x + 10, y: h / 2 },
            { x: p.x + 6, y: h / 2 + 12 },
            { x: p.x - 6, y: h / 2 + 12 },
          ],
          { fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, originX: 'center', originY: 'center' },
        ),
    );
    const inletStub = ductLeg(-w / 2 - 14, 0, -w / 2, 0, 14);
    children.push(liner, inletStub, ...spigots);
  }

  const group = new Group(children, { originX: 'center', originY: 'center' });
  setPlandroidData(group, {
    plandroidKind: 'fitting',
    plandroidComponentId: `plenum-${kind}`,
    plandroidPorts: ports,
  });
  return group;
}

export type DiffuserType = 'supply4way' | 'swirl' | 'linearSlot';

export function buildDiffuser(type: DiffuserType, style: IconStyle = DEFAULT_STYLE): Group {
  const isSlot = type === 'linearSlot';
  const w = isSlot ? 90 : 50;
  const h = isSlot ? 18 : 50;

  const body: FabricObject = isSlot
    ? new Rect({ left: 0, top: 0, width: w, height: h, originX: 'center', originY: 'center', fill: '#1e293b', stroke: '#94a3b8', strokeWidth: 1.5 })
    : new Circle({ left: 0, top: 0, radius: w / 2, originX: 'center', originY: 'center', fill: '#1e293b', stroke: '#94a3b8', strokeWidth: 1.5 });

  const decorations: FabricObject[] = [];

  if (style === 'professional') {
    if (type === 'supply4way') {
      // Standard 4-way throw symbol: square with corner-to-corner diagonals inside the round neck.
      const square = new Rect({ left: 0, top: 0, width: 30, height: 30, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.2 });
      const diag1 = new Line([-15, -15, 15, 15], { stroke: '#f59e0b', strokeWidth: 1, originX: 'center', originY: 'center' });
      const diag2 = new Line([-15, 15, 15, -15], { stroke: '#f59e0b', strokeWidth: 1, originX: 'center', originY: 'center' });
      decorations.push(square, diag1, diag2);
    } else if (type === 'swirl') {
      // Four rotated blade strokes suggesting a swirl pattern, plus a small hub circle.
      const hub = new Circle({ left: 0, top: 0, radius: 4, originX: 'center', originY: 'center', fill: '#f59e0b', stroke: 'transparent' });
      const blades: Line[] = [45, 135, 225, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return new Line([0, 0, Math.cos(rad) * 16, Math.sin(rad) * 16], {
          stroke: '#f59e0b',
          strokeWidth: 1.5,
          originX: 'center',
          originY: 'center',
        });
      });
      decorations.push(hub, ...blades);
    } else {
      const slots = [-4, 0, 4].map(
        (yOffset) =>
          new Line([-w / 2 + 8, yOffset, w / 2 - 8, yOffset], {
            stroke: '#f59e0b',
            strokeWidth: 0.9,
            originX: 'center',
            originY: 'center',
          }),
      );
      decorations.push(...slots);
    }
  } else if (type === 'supply4way') {
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

export function buildFittingStraight(style: IconStyle = DEFAULT_STYLE): Group {
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

  const children: FabricObject[] = [footprint(w, h), body];
  if (style === 'professional') children.push(dashedCenterline(-w / 2 + 4, 0, w / 2 - 4, 0));

  const group = new Group(children, { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'a', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'b', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
  ];
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: 'fitting-straight', plandroidPorts: ports });
  return group;
}

export function buildFittingReducer(style: IconStyle = DEFAULT_STYLE): Group {
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

  const children: FabricObject[] = [footprint(w, hA), trapezoid];
  if (style === 'professional') children.push(dashedCenterline(-w / 2 + 4, 0, w / 2 - 4, 0));

  const group = new Group(children, { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'in', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 400, depth: 250 } },
    { id: 'out', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 250, depth: 150 } },
  ];
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: 'fitting-reducer', plandroidPorts: ports });
  return group;
}

export function buildElbow(bendDeg: 90 | 45, style: IconStyle = DEFAULT_STYLE): Group {
  const legLen = 40;
  const bendRad = (bendDeg * Math.PI) / 180;
  const outX = Math.cos(bendRad) * legLen;
  const outY = Math.sin(bendRad) * legLen;

  const span = legLen * 2 + 20;
  const children: FabricObject[] = [footprint(span, span)];

  if (style === 'professional') {
    // Two double-line duct legs instead of one thick stroke — reads as real sheet metal, matching the drawn-duct rendering elsewhere in the app.
    children.push(ductLeg(-legLen, 0, 0, 0, 10), ductLeg(0, 0, outX, outY, 10));
  } else {
    children.push(
      new Line([-legLen, 0, 0, 0], { stroke: '#94a3b8', strokeWidth: 8, originX: 'center', originY: 'center' }),
      new Line([0, 0, outX, outY], { stroke: '#94a3b8', strokeWidth: 8, originX: 'center', originY: 'center' }),
    );
  }

  const group = new Group(children, { originX: 'center', originY: 'center' });

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
