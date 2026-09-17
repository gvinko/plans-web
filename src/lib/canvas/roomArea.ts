import { FabricText, type Canvas } from 'fabric';
import type { Vec2 } from './geometry';

/** Shoelace formula. Returns null if the page isn't calibrated — area is meaningless in raw pixels. */
export function computeAreaM2(vertices: Vec2[], pxPerMm: number | null): number | null {
  if (!pxPerMm || vertices.length < 3) return null;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.y - b.x * a.y;
  }
  const areaPx2 = Math.abs(sum) / 2;
  const areaMm2 = areaPx2 / (pxPerMm * pxPerMm);
  return areaMm2 / 1_000_000;
}

function centroid(vertices: Vec2[]): Vec2 {
  const sum = vertices.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
  return { x: sum.x / vertices.length, y: sum.y / vertices.length };
}

function findAreaLabel(canvas: Canvas, roomId: string) {
  return canvas.getObjects().find((o) => (o as unknown as { plandroidAreaLabelFor?: string }).plandroidAreaLabelFor === roomId);
}

export function removeAreaLabel(canvas: Canvas, roomId: string): void {
  const existing = findAreaLabel(canvas, roomId);
  if (existing) canvas.remove(existing);
}

/** Removes any existing area label for this room and draws a fresh one at the current centroid —
 * called after tracing completes and after any dimension/zone edit that might move the room. */
export function refreshAreaLabel(canvas: Canvas, roomId: string, vertices: Vec2[], pxPerMm: number | null): void {
  removeAreaLabel(canvas, roomId);
  const areaM2 = computeAreaM2(vertices, pxPerMm);
  const c = centroid(vertices);
  const label = new FabricText(areaM2 !== null ? `${areaM2.toFixed(1)} m\u00B2` : '\u2014', {
    left: c.x,
    top: c.y,
    fontSize: 12,
    fill: '#e2e8f0',
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  });
  (label as unknown as { plandroidAreaLabelFor: string }).plandroidAreaLabelFor = roomId;
  canvas.add(label);
}
