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

export function buildDuctedIndoorUnit(type: 'Standard Ducted' | 'Slimline' | 'Bulkhead' | 'Underfloor', brand: string, model: string, capacityKw?: number): Group {
  const dims = type === 'Bulkhead' ? { w: 92, h: 30 } : type === 'Slimline' ? { w: 112, h: 34 } : type === 'Underfloor' ? { w: 105, h: 44 } : { w: 120, h: 46 };
  const { w, h } = dims;
  const outline = new Rect({ left:0, top:0, width:w, height:h, originX:'center', originY:'center', fill:'#f8fafc', stroke:'#334155', strokeWidth:1.6, rx:2, ry:2 });
  const label = new FabricText(model, { left:0, top:0, fontSize:7, fontWeight:'bold', fill:'#0f172a', originX:'center', originY:'center' });
  const group = new Group([footprint(w+10,h+10),outline,label], { originX:'center', originY:'center' });
  const ports: PortDef[] = [
    { id:'return', x:-w/2, y:0, angleDeg:180, kind:'duct_rect', sizeMm:{width:400,depth:250} },
    { id:'supply', x:w/2, y:0, angleDeg:0, kind:'duct_rect', sizeMm:{width:400,depth:250} },
  ];
  setPlandroidData(group, { plandroidKind:'equipment', plandroidComponentId:`indoor-unit|${type}|${brand}|${model}|${capacityKw ?? ''}`, plandroidPorts:ports });
  return group;
}

export function buildFanCoilUnit(_style: IconStyle = DEFAULT_STYLE): Group {
  return buildDuctedIndoorUnit('Standard Ducted', 'Generic', 'FCU');
}

export function buildPlenum(kind: 'supply' | 'return', branchCount = 3, _style: IconStyle = DEFAULT_STYLE): Group {
  const stroke = '#334155';
  const fill = '#f8fafc';

  if (kind === 'return') {
    const w=108, h=38;
    const body=new Rect({left:0,top:4,width:w,height:h,originX:'center',originY:'center',fill,stroke,strokeWidth:1.6});
    const neck1=new Rect({left:18,top:-27,width:18,height:24,originX:'center',originY:'center',fill,stroke,strokeWidth:1.5});
    const neck2=new Rect({left:46,top:-27,width:18,height:24,originX:'center',originY:'center',fill,stroke,strokeWidth:1.5});
    const unitNeck=new Rect({left:-66,top:4,width:24,height:20,originX:'center',originY:'center',fill,stroke,strokeWidth:1.5});
    const ports:PortDef[]=[
      {id:'unit',x:-78,y:4,angleDeg:180,kind:'duct_rect',sizeMm:{width:400,depth:250}},
      {id:'return-1',x:18,y:-39,angleDeg:-90,kind:'duct_flex',sizeMm:{diameter:350}},
      {id:'return-2',x:46,y:-39,angleDeg:-90,kind:'duct_flex',sizeMm:{diameter:350}},
    ];
    const group=new Group([footprint(170,90),body,unitNeck,neck1,neck2],{originX:'center',originY:'center'});
    setPlandroidData(group,{plandroidKind:'fitting',plandroidComponentId:'plenum-return',plandroidPorts:ports});
    return group;
  }

  const three=branchCount>=3;
  const bodyW=three?96:86;
  const body=new Polygon(
    three
      ? [{x:-48,y:24},{x:-48,y:-8},{x:-30,y:-24},{x:-14,y:-14},{x:0,y:-24},{x:14,y:-14},{x:30,y:-24},{x:48,y:-8},{x:48,y:24}]
      : [{x:-43,y:24},{x:-43,y:-8},{x:-22,y:-26},{x:0,y:-14},{x:22,y:-26},{x:43,y:-8},{x:43,y:24}],
    {fill,stroke,strokeWidth:1.6,originX:'center',originY:'center'}
  );
  const unitNeck=new Rect({left:0,top:36,width:30,height:24,originX:'center',originY:'center',fill,stroke,strokeWidth:1.5});
  const outletXs=three?[-31,0,31]:[-28,28];
  const outletAngles=three?[-35,0,35]:[-35,35];
  const necks:FabricObject[]=[];
  const ports:PortDef[]=[{id:'unit',x:0,y:48,angleDeg:90,kind:'duct_rect',sizeMm:{width:400,depth:250}}];
  outletXs.forEach((x,i)=>{
    const angle=outletAngles[i];
    const y=-38;
    necks.push(new Rect({left:x,top:y,width:18,height:30,angle,originX:'center',originY:'center',fill,stroke,strokeWidth:1.5}));
    ports.push({id:`branch-${i+1}`,x:x,y:-54,angleDeg:-90+angle,kind:'duct_flex',sizeMm:{diameter:350}});
  });
  const group=new Group([footprint(bodyW+50,125),body,unitNeck,...necks],{originX:'center',originY:'center'});
  setPlandroidData(group,{plandroidKind:'fitting',plandroidComponentId:`plenum-supply-${branchCount}way`,plandroidPorts:ports});
  return group;
}

export function buildExactAir(outletCount = 6): Group {
  const count = Math.max(2, Math.min(8, outletCount));
  const stroke = '#334155', fill = '#f8fafc';
  const w = 104, h = 72;
  const body = new Rect({ left:0, top:0, width:w, height:h, rx:8, ry:8, originX:'center', originY:'center', fill, stroke, strokeWidth:1.6 });
  const inlet = new Rect({ left:0, top:h/2+12, width:30, height:24, originX:'center', originY:'center', fill, stroke, strokeWidth:1.5 });
  const children: FabricObject[] = [footprint(150,130), body, inlet];
  const ports: PortDef[] = [{ id:'inlet', x:0, y:h/2+24, angleDeg:90, kind:'duct_flex', sizeMm:{diameter:400} }];
  const leftCount = Math.ceil(count/2);
  const rightCount = count-leftCount;
  const addSide=(side:-1|1,n:number,offset:number)=>{
    for(let i=0;i<n;i++){
      const y=-h/2+16+(i*(h-32)/Math.max(1,n-1));
      const x=side*(w/2+12);
      children.push(new Rect({left:x,top:y,width:24,height:16,originX:'center',originY:'center',fill,stroke,strokeWidth:1.4}));
      ports.push({id:`outlet-${offset+i+1}`,x:side*(w/2+24),y,angleDeg:side<0?180:0,kind:'duct_flex',sizeMm:{diameter:300}});
    }
  };
  addSide(-1,leftCount,0); addSide(1,rightCount,leftCount);
  children.push(new FabricText('EXACT AIR',{left:0,top:0,fontSize:9,fontWeight:'bold',fill:'#334155',originX:'center',originY:'center'}));
  const group=new Group(children,{originX:'center',originY:'center'});
  setPlandroidData(group,{plandroidKind:'fitting',plandroidComponentId:`exact-air-${count}`,plandroidPorts:ports});
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

const inchToMm = (inch: number) => Math.round(inch * 25.4);

/** Round branch take-off using the exact nominal sizes carried in Echo's domestic cost sheet. */
export function buildBto(sizeLabel: string, style: IconStyle = DEFAULT_STYLE): Group {
  const sizes = sizeLabel.split('/').map((value) => Number(value.trim())).filter(Number.isFinite);
  const inlet = sizes[0] ?? 14;
  const branches = sizes.slice(1);
  const span = 86;
  const children: FabricObject[] = [footprint(112, 84)];
  const stroke = style === 'professional' ? '#dbeafe' : '#94a3b8';
  children.push(
    new Circle({ left: -span / 2, top: 0, radius: 10, originX: 'center', originY: 'center', fill: '#172554', stroke, strokeWidth: 1.4 }),
    new Line([-span / 2 + 10, 0, -8, 0], { stroke, strokeWidth: 7, originX: 'center', originY: 'center' }),
    new Circle({ left: -3, top: 0, radius: 8, originX: 'center', originY: 'center', fill: '#1d4ed8', stroke, strokeWidth: 1.2 }),
  );
  const ports: PortDef[] = [{ id: 'inlet', x: -span / 2, y: 0, angleDeg: 180, kind: 'duct_round', sizeMm: { diameter: inchToMm(inlet) } }];
  const branchAngle = branches.length === 3 ? 48 : 34;
  branches.forEach((branch, index) => {
    const angle = branches.length === 2 ? (index === 0 ? -branchAngle : branchAngle) : -branchAngle + index * branchAngle;
    const radians = (angle * Math.PI) / 180;
    const x = 39 * Math.cos(radians);
    const y = 39 * Math.sin(radians);
    children.push(
      new Line([2, 0, x, y], { stroke, strokeWidth: 6, originX: 'center', originY: 'center' }),
      new Circle({ left: x, top: y, radius: 7, originX: 'center', originY: 'center', fill: '#0f766e', stroke, strokeWidth: 1.2 }),
    );
    ports.push({ id: `branch-${index + 1}`, x, y, angleDeg: angle, kind: 'duct_round', sizeMm: { diameter: inchToMm(branch) } });
  });
  children.push(new FabricText(`${branches.length === 3 ? 'DBTO' : 'BTO'}\n${sizeLabel.replace(/ /g, '')}`, { left: 2, top: 30, fontSize: 8, fill: '#e2e8f0', textAlign: 'center', originX: 'center', originY: 'center' }));
  const group = new Group(children, { originX: 'center', originY: 'center' });
  setPlandroidData(group, { plandroidKind: 'fitting', plandroidComponentId: `bto-${sizeLabel.replace(/ /g, '').replace(/\//g, '-')}`, plandroidPorts: ports });
  return group;
}

/** Motorised round zone damper. Nominal diameter is chosen before placement. */
export function buildZoneMotor(diameterMm: number, style: IconStyle = DEFAULT_STYLE): Group {
  const w = 68;
  const h = 42;
  const accent = style === 'professional' ? '#fde68a' : '#fbbf24';
  const body = new Rect({ left: 0, top: 0, width: w, height: 16, originX: 'center', originY: 'center', fill: '#422006', stroke: accent, strokeWidth: 1.4, rx: 3, ry: 3 });
  const blade = new Line([0, -15, 0, 15], { stroke: '#fbbf24', strokeWidth: 2, originX: 'center', originY: 'center' });
  const actuator = new Rect({ left: 0, top: -18, width: 28, height: 12, originX: 'center', originY: 'center', fill: '#92400e', stroke: '#fde68a', strokeWidth: 1, rx: 2, ry: 2 });
  const label = new FabricText(`ZM Ø${diameterMm}`, { left: 0, top: 19, fontSize: 8, fill: '#fef3c7', originX: 'center', originY: 'center' });
  const group = new Group([footprint(w + 10, h + 12), body, blade, actuator, label], { originX: 'center', originY: 'center' });
  const ports: PortDef[] = [
    { id: 'in', x: -w / 2, y: 0, angleDeg: 180, kind: 'duct_flex', sizeMm: { diameter: diameterMm } },
    { id: 'out', x: w / 2, y: 0, angleDeg: 0, kind: 'duct_flex', sizeMm: { diameter: diameterMm } },
  ];
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: `zone-motor-${diameterMm}`, plandroidPorts: ports });
  return group;
}

/** Small wall temperature / zone sensor symbol for plan placement. */
export function buildWallSensor(style: IconStyle = DEFAULT_STYLE): Group {
  const accent = style === 'professional' ? '#93c5fd' : '#60a5fa';
  const body = new Rect({ left: 0, top: 0, width: 24, height: 24, originX: 'center', originY: 'center', fill: '#f8fafc', stroke: accent, strokeWidth: 1.5, rx: 3, ry: 3 });
  const dot = new Circle({ left: 0, top: -3, radius: 2.5, originX: 'center', originY: 'center', fill: accent, stroke: 'transparent' });
  const label = new FabricText('WS', { left: 0, top: 6, fontSize: 7, fontWeight: 'bold', fill: '#1e3a8a', originX: 'center', originY: 'center' });
  const group = new Group([footprint(34, 34), body, dot, label], { originX: 'center', originY: 'center' });
  setPlandroidData(group, { plandroidKind: 'equipment', plandroidComponentId: 'wall-sensor', plandroidPorts: [] });
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

export function buildOutdoorUnit(fans: 1 | 2): Group {
  const w = fans === 1 ? 64 : 100, h = 52;
  const body = new Rect({left:0,top:0,width:w,height:h,originX:'center',originY:'center',fill:'#f8fafc',stroke:'#334155',strokeWidth:1.5,rx:3,ry:3});
  const children: FabricObject[]=[footprint(w+10,h+10),body];
  const xs=fans===1?[0]:[-25,25];
  xs.forEach(x=>{children.push(new Circle({left:x,top:0,radius:17,originX:'center',originY:'center',fill:'transparent',stroke:'#475569',strokeWidth:1.2})); [0,120,240].forEach(d=>{const r=d*Math.PI/180;children.push(new Line([x,0,x+Math.cos(r)*14,Math.sin(r)*14],{stroke:'#475569',strokeWidth:1,originX:'center',originY:'center'}));});});
  const g=new Group(children,{originX:'center',originY:'center'});
  setPlandroidData(g,{plandroidKind:'equipment',plandroidComponentId:`condenser-${fans}fan`,plandroidPorts:[{id:'pipe',x:w/2,y:0,angleDeg:0,kind:'duct_round',sizeMm:{diameter:20}}]}); return g;
}
export function buildRoomIndoorUnit(kind:'split'|'cassette'|'ceiling-console'|'floor-console'): Group {
  const square=kind==='cassette'; const w=square?52:kind==='split'?82:68; const h=square?52:kind==='floor-console'?34:26;
  const body=new Rect({left:0,top:0,width:w,height:h,originX:'center',originY:'center',fill:'#f8fafc',stroke:'#334155',strokeWidth:1.5,rx:3,ry:3});
  const children: FabricObject[]=[footprint(w+10,h+10),body];
  if(square){children.push(new Line([-20,-20,20,20],{stroke:'#64748b',strokeWidth:1}),new Line([-20,20,20,-20],{stroke:'#64748b',strokeWidth:1}));}
  else for(let y=-5;y<=5;y+=5) children.push(new Line([-w/2+8,y,w/2-8,y],{stroke:'#64748b',strokeWidth:.8}));
  const g=new Group(children,{originX:'center',originY:'center'});
  setPlandroidData(g,{plandroidKind:'equipment',plandroidComponentId:`indoor-${kind}`,plandroidPorts:[]}); return g;
}
export function buildWallControl(kind:'controller'|'sensor'): Group {
  const body=new Rect({left:0,top:0,width:30,height:22,originX:'center',originY:'center',fill:'#fff',stroke:'#334155',strokeWidth:1.5,rx:2,ry:2});
  const label=new FabricText(kind==='controller'?'WC':'WS',{left:0,top:0,fontSize:7,fontWeight:'bold',fill:'#0f172a',originX:'center',originY:'center'});
  const g=new Group([footprint(36,28),body,label],{originX:'center',originY:'center'}); setPlandroidData(g,{plandroidKind:'equipment',plandroidComponentId:`wall-${kind}`,plandroidPorts:[]}); return g;
}
export function buildPipeDrain(kind:'pipes'|'drain'): Group {
  const children: FabricObject[]=[footprint(100,20)];
  if(kind==='pipes'){children.push(new Line([-45,-3,45,-3],{stroke:'#dc2626',strokeWidth:2}),new Line([-45,3,45,3],{stroke:'#f97316',strokeWidth:2}));}
  else children.push(new Line([-45,0,45,0],{stroke:'#16a34a',strokeWidth:2,strokeDashArray:[7,5]}));
  const g=new Group(children,{originX:'center',originY:'center'}); setPlandroidData(g,{plandroidKind:'equipment',plandroidComponentId:kind,plandroidPorts:[]}); return g;
}
