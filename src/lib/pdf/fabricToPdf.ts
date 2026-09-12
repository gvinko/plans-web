import { Point, util, type FabricObject, type Group, type Rect, type Circle, type Line, type FabricText, type Path, type Polygon, type FabricImage } from 'fabric';
import type { jsPDF } from 'jspdf';

export interface PageTransform {
  /** Maps a canvas-space point to page-mm coordinates (already scaled by the chosen print scale). */
  toPageMm: (p: { x: number; y: number }) => { x: number; y: number };
  /** Page-mm per canvas-px — used to scale stroke widths, radii, and font sizes consistently. */
  pxToMm: number;
}

const MM_PER_PT = 0.352778;

function mmToPt(mm: number): number {
  return mm / MM_PER_PT;
}

function hexToRgb(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string' || hex === 'transparent' || hex === '') return null;
  const m = hex.replace('#', '');
  if (m.length < 6) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function transformLocalPoint(obj: FabricObject, localX: number, localY: number, transform: PageTransform) {
  const matrix = obj.calcTransformMatrix();
  const canvasPt = util.transformPoint(new Point(localX, localY), matrix);
  return transform.toPageMm({ x: canvasPt.x, y: canvasPt.y });
}

/** Draws a closed path via jsPDF's relative-delta `lines()` API — works for any polygon, rotated or not. */
function drawClosedPathMm(doc: jsPDF, pointsMm: { x: number; y: number }[], style: 'S' | 'F' | 'FD', strokeWidthMm: number) {
  if (pointsMm.length < 2) return;
  doc.setLineWidth(Math.max(strokeWidthMm, 0.05));
  const deltas: [number, number][] = [];
  for (let i = 1; i < pointsMm.length; i++) {
    deltas.push([pointsMm[i].x - pointsMm[i - 1].x, pointsMm[i].y - pointsMm[i - 1].y]);
  }
  doc.lines(deltas, pointsMm[0].x, pointsMm[0].y, [1, 1], style, true);
}

function renderRect(doc: jsPDF, rect: Rect, transform: PageTransform) {
  const w = rect.width ?? 0;
  const h = rect.height ?? 0;
  const fillRgb = hexToRgb(rect.fill);
  const strokeRgb = hexToRgb(rect.stroke);
  if (!fillRgb && !strokeRgb) return;

  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ].map((c) => transformLocalPoint(rect, c.x, c.y, transform));

  if (fillRgb) doc.setFillColor(...fillRgb);
  if (strokeRgb) doc.setDrawColor(...strokeRgb);
  const style = fillRgb && strokeRgb ? 'FD' : fillRgb ? 'F' : 'S';
  drawClosedPathMm(doc, corners, style, (rect.strokeWidth ?? 1) * transform.pxToMm);
}

function renderCircle(doc: jsPDF, circle: Circle, transform: PageTransform) {
  const fillRgb = hexToRgb(circle.fill);
  const strokeRgb = hexToRgb(circle.stroke);
  if (!fillRgb && !strokeRgb) return;

  const center = transformLocalPoint(circle, 0, 0, transform);
  const edge = transformLocalPoint(circle, circle.radius ?? 0, 0, transform);
  const radiusMm = Math.hypot(edge.x - center.x, edge.y - center.y);

  if (fillRgb) doc.setFillColor(...fillRgb);
  if (strokeRgb) doc.setDrawColor(...strokeRgb);
  doc.setLineWidth(Math.max((circle.strokeWidth ?? 1) * transform.pxToMm, 0.05));
  doc.circle(center.x, center.y, radiusMm, fillRgb && strokeRgb ? 'FD' : fillRgb ? 'F' : 'S');
}

function renderLine(doc: jsPDF, line: Line, transform: PageTransform) {
  const p1 = transformLocalPoint(line, line.x1 ?? 0, line.y1 ?? 0, transform);
  const p2 = transformLocalPoint(line, line.x2 ?? 0, line.y2 ?? 0, transform);
  doc.setDrawColor(...(hexToRgb(line.stroke) ?? [148, 163, 184]));
  doc.setLineWidth(Math.max((line.strokeWidth ?? 1) * transform.pxToMm, 0.05));
  doc.line(p1.x, p1.y, p2.x, p2.y);
}

function renderText(doc: jsPDF, text: FabricText, transform: PageTransform) {
  const anchor = transformLocalPoint(text, 0, 0, transform);
  doc.setTextColor(...(hexToRgb(text.fill) ?? [226, 232, 240]));
  doc.setFontSize(Math.max(mmToPt((text.fontSize ?? 12) * transform.pxToMm), 4));
  doc.text(text.text ?? '', anchor.x, anchor.y, { align: 'center', baseline: 'middle' });
}

/** Our own Path objects only ever contain M/L commands (see ductGeometry.ts) — no curve parsing needed. */
function renderPath(doc: jsPDF, path: Path, transform: PageTransform) {
  const commands = (path.path ?? []) as unknown as [string, number, number][];
  doc.setDrawColor(...(hexToRgb(path.stroke) ?? [56, 189, 248]));
  doc.setLineWidth(Math.max((path.strokeWidth ?? 1) * transform.pxToMm, 0.05));

  let subpath: { x: number; y: number }[] = [];
  const flush = () => {
    for (let i = 1; i < subpath.length; i++) doc.line(subpath[i - 1].x, subpath[i - 1].y, subpath[i].x, subpath[i].y);
    subpath = [];
  };
  for (const [cmdType, x, y] of commands) {
    if (cmdType === 'M') {
      flush();
      subpath.push(transformLocalPoint(path, x, y, transform));
    } else if (cmdType === 'L') {
      subpath.push(transformLocalPoint(path, x, y, transform));
    }
  }
  flush();
}

function renderPolygon(doc: jsPDF, polygon: Polygon, transform: PageTransform) {
  const points = (polygon.points ?? []) as { x: number; y: number }[];
  if (points.length < 2) return;
  const pts = points.map((p) => transformLocalPoint(polygon, p.x, p.y, transform));
  const fillRgb = hexToRgb(polygon.fill);
  doc.setDrawColor(...(hexToRgb(polygon.stroke) ?? [56, 189, 248]));
  if (fillRgb) doc.setFillColor(...fillRgb);
  drawClosedPathMm(doc, pts, fillRgb ? 'FD' : 'S', (polygon.strokeWidth ?? 1) * transform.pxToMm);
}

/** Our background/sketch images are never rotated (always placed at angle 0), so a simple
 * axis-aligned top-left/bottom-right embed is sufficient — no arbitrary-rotation image math needed. */
function renderImage(doc: jsPDF, img: FabricImage, transform: PageTransform) {
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  const topLeft = transformLocalPoint(img, -w / 2, -h / 2, transform);
  const bottomRight = transformLocalPoint(img, w / 2, h / 2, transform);
  const element = img.getElement();
  if (!element) return;
  try {
    doc.addImage(element as HTMLImageElement, 'PNG', topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  } catch {
    // Raster embedding is the one non-vector step in this export — skip it rather than fail the whole PDF.
  }
}

export function renderFabricObjectToPdf(doc: jsPDF, obj: FabricObject, transform: PageTransform): void {
  if (obj.visible === false) return;
  switch (obj.type) {
    case 'group':
      for (const child of (obj as Group).getObjects()) renderFabricObjectToPdf(doc, child, transform);
      return;
    case 'rect':
      return renderRect(doc, obj as Rect, transform);
    case 'circle':
      return renderCircle(doc, obj as Circle, transform);
    case 'line':
      return renderLine(doc, obj as Line, transform);
    case 'textbox':
    case 'text':
    case 'i-text':
      return renderText(doc, obj as FabricText, transform);
    case 'path':
      return renderPath(doc, obj as Path, transform);
    case 'polygon':
    case 'polyline':
      return renderPolygon(doc, obj as Polygon, transform);
    case 'image':
      return renderImage(doc, obj as FabricImage, transform);
    default:
      return; // unhandled Fabric type — no such object exists in this app's model
  }
}
