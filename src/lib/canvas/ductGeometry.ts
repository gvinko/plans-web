import { Rect, FabricText, Path } from 'fabric';
import { distance, angleDeg, midpoint, unitNormal, toLocal, normalizeDeg, type Vec2 } from './geometry';
import { setPlandroidData } from './plandroidData';
import type { PortDef } from '../catalog/types';

export interface RigidDuctResult {
  rect: Rect;
  label: FabricText;
}

export function buildRigidDuctObject(
  p1: Vec2,
  p2: Vec2,
  widthMm: number,
  depthMm: number,
  pxPerMm: number,
  fillColor = '#22c55e',
): RigidDuctResult {
  const lengthPx = distance(p1, p2);
  const lengthMm = lengthPx / pxPerMm;
  const thicknessPx = Math.max(widthMm * pxPerMm, 6);
  const ang = angleDeg(p1, p2);
  const mid = midpoint(p1, p2);
  const normal = unitNormal(p1, p2);

  // Solid, rounded (capsule-ended) colored line — reads as a real pipe/duct run on a printed
  // drawing, matching common site-drawing convention, rather than a hollow technical double-line.
  const rect = new Rect({
    left: mid.x,
    top: mid.y,
    width: lengthPx,
    height: thicknessPx,
    rx: thicknessPx / 2,
    ry: thicknessPx / 2,
    originX: 'center',
    originY: 'center',
    angle: ang,
    fill: fillColor,
    stroke: 'transparent',
  });

  const labelOffset = thicknessPx / 2 + 10;
  const label = new FabricText(`${widthMm}\u00D7${depthMm}`, {
    left: mid.x + normal.x * labelOffset,
    top: mid.y + normal.y * labelOffset,
    fontSize: 11,
    fill: '#cbd5e1',
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  });

  const ports: PortDef[] = [
    { id: 'start', x: -lengthPx / 2, y: 0, angleDeg: 180, kind: 'duct_rect', sizeMm: { width: widthMm, depth: depthMm } },
    { id: 'end', x: lengthPx / 2, y: 0, angleDeg: 0, kind: 'duct_rect', sizeMm: { width: widthMm, depth: depthMm } },
  ];
  setPlandroidData(rect, {
    plandroidKind: 'duct_rigid',
    plandroidPorts: ports,
    plandroidWidthMm: widthMm,
    plandroidDepthMm: depthMm,
    plandroidLengthMm: lengthMm,
  });

  return { rect, label };
}

/** Bulge fraction for the flex duct's bezier control point — a gentle, consistent curve rather than a straight line. */
const FLEX_CURVE_BULGE = 0.15;
const FLEX_RIB_INTERVAL = 3; // every Nth sample gets a connecting "accordion fold" line

export function buildFlexDuctObject(
  p1: Vec2,
  p2: Vec2,
  diameterMm: number,
  pxPerMm: number,
  strokeColor = '#9ca3af',
): Path {
  const lengthPx = distance(p1, p2);
  const lengthMm = lengthPx / pxPerMm;
  const diameterPx = Math.min(Math.max(diameterMm * pxPerMm, 8), 40);

  const n = unitNormal(p1, p2);
  const bulge = lengthPx * FLEX_CURVE_BULGE;
  const control: Vec2 = { x: (p1.x + p2.x) / 2 + n.x * bulge, y: (p1.y + p2.y) / 2 + n.y * bulge };

  const steps = Math.max(12, Math.round(lengthPx / 10));
  const centerPts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    centerPts.push({
      x: mt * mt * p1.x + 2 * mt * t * control.x + t * t * p2.x,
      y: mt * mt * p1.y + 2 * mt * t * control.y + t * t * p2.y,
    });
  }

  const railA: Vec2[] = [];
  const railB: Vec2[] = [];
  const ribs: [Vec2, Vec2][] = [];
  for (let i = 0; i < centerPts.length; i++) {
    const prev = centerPts[Math.max(0, i - 1)];
    const next = centerPts[Math.min(centerPts.length - 1, i + 1)];
    const localNormal = unitNormal(prev, next);
    const c = centerPts[i];
    const a: Vec2 = { x: c.x + (localNormal.x * diameterPx) / 2, y: c.y + (localNormal.y * diameterPx) / 2 };
    const b: Vec2 = { x: c.x - (localNormal.x * diameterPx) / 2, y: c.y - (localNormal.y * diameterPx) / 2 };
    railA.push(a);
    railB.push(b);
    if (i % FLEX_RIB_INTERVAL === 0) ribs.push([a, b]);
  }

  // Filled envelope between the two rails (a solid grey "pipe" body) plus periodic rib lines for
  // the corrugated-flex-duct texture — closer to how flex reads on a real site drawing than a hollow outline.
  const envelopePath = [...railA, ...[...railB].reverse()]
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const ribsPath = ribs.map(([a, b]) => `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join(' ');
  const d = `${envelopePath} Z ${ribsPath}`;

  const path = new Path(d, {
    fill: strokeColor + '33', // translucent fill of the same color for a solid-pipe look
    stroke: strokeColor,
    strokeWidth: 1.25,
    originX: 'center',
    originY: 'center',
  });
  path.setCoords();
  const center = path.getCenterPoint();

  const startAngle = normalizeDeg(angleDeg(centerPts[1], centerPts[0]));
  const endAngle = normalizeDeg(angleDeg(centerPts[centerPts.length - 2], centerPts[centerPts.length - 1]));
  const localStart = toLocal(p1, center);
  const localEnd = toLocal(p2, center);

  const ports: PortDef[] = [
    { id: 'start', x: localStart.x, y: localStart.y, angleDeg: startAngle, kind: 'duct_flex', sizeMm: { diameter: diameterMm } },
    { id: 'end', x: localEnd.x, y: localEnd.y, angleDeg: endAngle, kind: 'duct_flex', sizeMm: { diameter: diameterMm } },
  ];
  setPlandroidData(path, {
    plandroidKind: 'duct_flex',
    plandroidPorts: ports,
    plandroidDiameterMm: diameterMm,
    plandroidLengthMm: lengthMm,
  });

  return path;
}
