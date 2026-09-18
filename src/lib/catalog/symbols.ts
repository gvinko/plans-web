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

export type DiffuserType = 'supply4way' | 'swirl' | 'linearSlot' | 'round';

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
    } else if (type === 'round') {
      // Plain round ceiling diffuser: concentric rings, no throw/swirl decoration — the common "basic" supply symbol.
      decorations.push(
        new Circle({ left: 0, top: 0, radius: 16, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1 }),
        new Circle({ left: 0, top: 0, radius: 9, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1 }),
      );
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
  } else if (type === 'round') {
    decorations.push(
      new Circle({ left: 0, top: 0, radius: 12, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.2 }),
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

export type GrilleType = 'wall' | 'linearBar' | 'returnAirEggcrate';

export function buildGrille(type: GrilleType, style: IconStyle = DEFAULT_STYLE): Group {
  const isBar = type === 'linearBar';
  const isEggcrate = type === 'returnAirEggcrate';
  const w = isBar ? 100 : isEggcrate ? 55 : 50;
  const h = isBar ? 14 : isEggcrate ? 45 : 35;

  const body = new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h,
    originX: 'center',
    originY: 'center',
    fill: '#1e293b',
    stroke: '#94a3b8',
    strokeWidth: 1.5,
  });

  const children: FabricObject[] = [footprint(w + 10, h + 10), body];
  const barColor = style === 'professional' ? '#f59e0b' : '#94a3b8';

  if (isEggcrate) {
    // Eggcrate core: a crosshatch grid, not parallel bars — the visual giveaway for a return air grille.
    const cols = 4;
    const rows = 4;
    const insetX = 6;
    const insetY = 6;
    for (let i = 1; i < cols; i++) {
      const xOffset = -w / 2 + insetX + ((w - insetX * 2) / cols) * i;
      children.push(new Line([xOffset, -h / 2 + insetY, xOffset, h / 2 - insetY], { stroke: barColor, strokeWidth: 0.6, originX: 'center', originY: 'center' }));
    }
    for (let i = 1; i < rows; i++) {
      const yOffset = -h / 2 + insetY + ((h - insetY * 2) / rows) * i;
      children.push(new Line([-w / 2 + insetX, yOffset, w / 2 - insetX, yOffset], { stroke: barColor, strokeWidth: 0.6, originX: 'center', originY: 'center' }));
    }
  } else {
    // Louver bars — closely spaced for a linear bar grille, more open for a standard wall grille.
    const barCount = isBar ? 8 : 5;
    const inset = 6;
    const spacing = (h - inset * 2) / (barCount - 1 || 1);
    for (let i = 0; i < barCount; i++) {
      const yOffset = -h / 2 + inset + spacing * i;
      children.push(new Line([-w / 2 + 5, yOffset, w / 2 - 5, yOffset], { stroke: barColor, strokeWidth: 0.8, originX: 'center', originY: 'center' }));
    }
  }

  const group = new Group(children, { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'neck', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: isBar ? 500 : 250, depth: 150 } },
  ];
  setPlandroidData(group, {
    plandroidKind: 'terminal',
    plandroidComponentId: `grille-${type}`,
    plandroidPorts: ports,
  });
  return group;
}

export function buildCondenser(style: IconStyle = DEFAULT_STYLE): Group {
  const w = 70;
  const h = 60;
  const body = new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h,
    originX: 'center',
    originY: 'center',
    fill: '#374151',
    stroke: '#94a3b8',
    strokeWidth: 1.5,
    rx: 3,
    ry: 3,
  });
  const fanRing = new Circle({ left: 0, top: 5, radius: 18, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1.5 });
  const blades: FabricObject[] =
    style === 'professional'
      ? [0, 120, 240].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return new Line([0, 5, Math.cos(rad) * 15, 5 + Math.sin(rad) * 15], { stroke: '#94a3b8', strokeWidth: 1.2, originX: 'center', originY: 'center' });
        })
      : [
          new Line([-15, 5, 15, 5], { stroke: '#94a3b8', strokeWidth: 1.2, originX: 'center', originY: 'center' }),
          new Line([0, -10, 0, 20], { stroke: '#94a3b8', strokeWidth: 1.2, originX: 'center', originY: 'center' }),
        ];
  const label = new FabricText('COND', { left: 0, top: -20, fontSize: 8, fill: '#e2e8f0', originX: 'center', originY: 'center' });

  const group = new Group([footprint(w + 10, h + 10), body, fanRing, ...blades, label], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [{ id: 'pipe', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_round', sizeMm: { diameter: 20 } }];
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: 'condenser', plandroidPorts: ports });
  return group;
}

/** Wall-mounted split indoor unit. Service-pipe connectors are intentionally deferred until
 * refrigerant/electrical line types exist, so this cannot incorrectly accept an air duct. */
export function buildWallSplitIndoor(style: IconStyle = DEFAULT_STYLE): Group {
  const w = 100;
  const h = 32;
  const body = new Rect({
    left: 0, top: 0, width: w, height: h, originX: 'center', originY: 'center',
    fill: '#e2e8f0', stroke: '#64748b', strokeWidth: 1.5, rx: 7, ry: 7,
  });
  const outlet = new Line([-w / 2 + 10, h / 2 - 7, w / 2 - 10, h / 2 - 7], {
    stroke: '#0284c7', strokeWidth: 2, originX: 'center', originY: 'center',
  });
  const indicator = new Circle({
    left: w / 2 - 13, top: -h / 2 + 8, radius: 2, originX: 'center', originY: 'center',
    fill: '#22c55e', stroke: 'transparent',
  });
  const children: FabricObject[] = [footprint(w + 10, h + 10), body, outlet, indicator];
  if (style === 'professional') {
    children.push(
      new Line([-w / 2 + 14, 2, w / 2 - 14, 2], { stroke: '#94a3b8', strokeWidth: 0.7, strokeDashArray: [4, 3], originX: 'center', originY: 'center' }),
      new Polygon([{ x: -10, y: 10 }, { x: 0, y: 15 }, { x: 10, y: 10 }], { fill: '#38bdf8', stroke: 'transparent', originX: 'center', originY: 'center' }),
    );
  }
  const group = new Group(children, { originX: 'center', originY: 'center' });
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: 'wall-split-indoor', plandroidPorts: [] });
  return group;
}

/** Four-way ceiling cassette shown as a clean top-down reflected-ceiling symbol. */
export function buildCeilingCassette(style: IconStyle = DEFAULT_STYLE): Group {
  const size = 64;
  const body = new Rect({
    left: 0, top: 0, width: size, height: size, originX: 'center', originY: 'center',
    fill: '#e2e8f0', stroke: '#64748b', strokeWidth: 1.5, rx: 3, ry: 3,
  });
  const centre = new Rect({
    left: 0, top: 0, width: 28, height: 28, originX: 'center', originY: 'center',
    fill: '#cbd5e1', stroke: '#64748b', strokeWidth: 1,
  });
  const children: FabricObject[] = [footprint(size + 8, size + 8), body, centre];
  const arrowColor = style === 'professional' ? '#0284c7' : '#38bdf8';
  children.push(
    new Line([-24, 0, -15, 0], { stroke: arrowColor, strokeWidth: 2, originX: 'center', originY: 'center' }),
    new Line([15, 0, 24, 0], { stroke: arrowColor, strokeWidth: 2, originX: 'center', originY: 'center' }),
    new Line([0, -24, 0, -15], { stroke: arrowColor, strokeWidth: 2, originX: 'center', originY: 'center' }),
    new Line([0, 15, 0, 24], { stroke: arrowColor, strokeWidth: 2, originX: 'center', originY: 'center' }),
  );
  if (style === 'professional') {
    children.push(
      new Line([-32, -32, 32, 32], { stroke: '#94a3b8', strokeWidth: 0.6, originX: 'center', originY: 'center' }),
      new Line([-32, 32, 32, -32], { stroke: '#94a3b8', strokeWidth: 0.6, originX: 'center', originY: 'center' }),
    );
  }
  const group = new Group(children, { originX: 'center', originY: 'center' });
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: 'ceiling-cassette', plandroidPorts: [] });
  return group;
}

/** Y-piece / wye branch fitting — three duct legs from a single junction: in, straight-through, and an angled branch. */
export function buildWye(style: IconStyle = DEFAULT_STYLE): Group {
  const legLen = 36;
  const branchRad = (35 * Math.PI) / 180;
  const branchX = Math.cos(branchRad) * legLen;
  const branchY = Math.sin(branchRad) * legLen;

  const span = legLen * 2 + 20;
  const children: FabricObject[] = [footprint(span, span)];

  if (style === 'professional') {
    children.push(ductLeg(-legLen, 0, 0, 0, 9), ductLeg(0, 0, legLen, 0, 9), ductLeg(0, 0, branchX, branchY, 7));
  } else {
    const opts = { stroke: '#94a3b8', originX: 'center' as const, originY: 'center' as const };
    children.push(
      new Line([-legLen, 0, 0, 0], { ...opts, strokeWidth: 8 }),
      new Line([0, 0, legLen, 0], { ...opts, strokeWidth: 8 }),
      new Line([0, 0, branchX, branchY], { ...opts, strokeWidth: 6 }),
    );
  }

  const group = new Group(children, { originX: 'center', originY: 'center' });
  const ports: PortDef[] = [
    { id: 'in', x: -legLen, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'through', x: legLen, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 250, depth: 200 } },
    { id: 'branch', x: branchX, y: branchY, angleDeg: 35, kind: 'duct_rect', sizeMm: { width: 200, depth: 150 } },
  ];
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: 'fitting-wye', plandroidPorts: ports });
  return group;
}

/** Branch damper — a straight duct coupling with a diagonal blade line and control-knob dot, the standard schematic marker for a manual/motorised damper. */
export function buildBranchDamper(style: IconStyle = DEFAULT_STYLE): Group {
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
  const blade = new Line([-2, -h * 0.32, 2, h * 0.32], {
    stroke: style === 'professional' ? '#f59e0b' : '#e2e8f0',
    strokeWidth: 2,
    originX: 'center',
    originY: 'center',
  });
  const knob = new Circle({ left: 0, top: -h * 0.32 - 4, radius: 2, originX: 'center', originY: 'center', fill: style === 'professional' ? '#f59e0b' : '#e2e8f0', stroke: 'transparent' });

  const group = new Group([footprint(w, h), body, blade, knob], { originX: 'center', originY: 'center' });
  const ports: PortDef[] = [
    { id: 'a', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
    { id: 'b', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: 300, depth: 200 } },
  ];
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: 'fitting-damper', plandroidPorts: ports });
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
