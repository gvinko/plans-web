import type { Canvas, FabricObject, TPointerEventInfo, TPointerEvent } from 'fabric';
import type { CanvasEngine } from './CanvasEngine';
import { distance, distancePointToSegment, midpoint, type Vec2 } from './geometry';
import { getPlandroidData, getPlandroidId, setPlandroidId } from './plandroidData';
import { buildTracedRoomObject } from './wallTracing';
import { refreshAreaLabel } from './roomArea';

export interface WallEdgeSelection {
  objId: string;
  edgeIndex: number;
  currentLengthPx: number;
  midpointCanvas: Vec2;
  p1: Vec2;
  p2: Vec2;
}

/** Finds the nearest edge of `vertices` (a closed loop) to `point`, and how far away it is. */
function nearestEdge(point: Vec2, vertices: Vec2[]): { index: number; distance: number } {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const d = distancePointToSegment(point, a, b);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: bestDist };
}

/** Moves the far endpoint of the selected wall to hit newLengthPx (keeping its near endpoint and
 * direction fixed), then translates the immediately-following wall's far endpoint by the same delta
 * so that wall keeps its own original length and direction — the "attached perpendicular wall" from
 * the spec. Every other vertex in the loop is untouched: this is a local edit, not a whole-loop solve. */
export function applyWallLength(vertices: Vec2[], edgeIndex: number, newLengthPx: number): Vec2[] {
  const n = vertices.length;
  const p1Idx = edgeIndex;
  const p2Idx = (edgeIndex + 1) % n;
  const p3Idx = (edgeIndex + 2) % n;

  const p1 = vertices[p1Idx];
  const p2 = vertices[p2Idx];
  const p3 = vertices[p3Idx];

  const dir = { x: p2.x - p1.x, y: p2.y - p1.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const unit = { x: dir.x / len, y: dir.y / len };

  const p2New: Vec2 = { x: p1.x + unit.x * newLengthPx, y: p1.y + unit.y * newLengthPx };
  const nextDir = { x: p3.x - p2.x, y: p3.y - p2.y };
  const p3New: Vec2 = { x: p2New.x + nextDir.x, y: p2New.y + nextDir.y };

  const result = [...vertices];
  result[p2Idx] = p2New;
  if (p3Idx !== p1Idx) result[p3Idx] = p3New; // guards a degenerate 2-wall "loop"
  return result;
}

const EDGE_CLICK_THRESHOLD_SCREEN_PX = 20;

export function attachWallDimensionEdit(engine: CanvasEngine, onEdgeSelected: (sel: WallEdgeSelection) => void): () => void {
  const canvas = engine.canvas;
  function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    if (engine.getToolMode() !== 'select') return;
    const target = opt.target as FabricObject | undefined;
    if (!target || getPlandroidData(target)?.plandroidKind !== 'traced_room') return;

    const vertices = (target as unknown as { plandroidTraceVerticesPx?: Vec2[] }).plandroidTraceVerticesPx;
    if (!vertices || vertices.length < 2) return;

    const pointer = canvas.getPointer(opt.e);
    const { index: edgeIndex, distance: edgeDistance } = nearestEdge(pointer, vertices);
    // Only treat this as "editing a wall's dimension" if the click actually landed near an edge line —
    // otherwise a plain click deep inside the room (i.e. a normal select-to-assign-zone click) would
    // incorrectly also pop up the dimension editor. See zoneSelection.ts for the other popover.
    if (edgeDistance > EDGE_CLICK_THRESHOLD_SCREEN_PX / canvas.getZoom()) return;

    const a = vertices[edgeIndex];
    const b = vertices[(edgeIndex + 1) % vertices.length];

    onEdgeSelected({
      objId: getPlandroidId(target) ?? '',
      edgeIndex,
      currentLengthPx: distance(a, b),
      midpointCanvas: midpoint(a, b),
      p1: a,
      p2: b,
    });
  }

  canvas.on('mouse:down', onMouseDown);
  return () => canvas.off('mouse:down', onMouseDown);
}

export function getTraceVertices(canvas: Canvas, objId: string): Vec2[] | null {
  const obj = canvas.getObjects().find((o) => getPlandroidId(o) === objId);
  return (obj as unknown as { plandroidTraceVerticesPx?: Vec2[] } | undefined)?.plandroidTraceVerticesPx ?? null;
}

/** Rebuilds the room object in place (Fabric can't cheaply resize an existing Polygon's points array).
 * Carries over whatever zone the room was already assigned, if any, so a dimension edit never resets its color. */
export function rebuildTracedRoom(canvas: Canvas, objId: string, newVertices: Vec2[], pxPerMm: number | null): void {
  const old = canvas.getObjects().find((o) => getPlandroidId(o) === objId);
  const zoneId = old ? getPlandroidData(old)?.plandroidZoneId : undefined;
  const color = old && typeof old.stroke === 'string' ? old.stroke : undefined;
  if (old) canvas.remove(old);
  const rebuilt = buildTracedRoomObject(newVertices, zoneId && color ? { id: zoneId, color } : null);
  setPlandroidId(rebuilt, objId); // keep the same identity — CostItem/BOM refs, if any, stay stable
  canvas.add(rebuilt);
  refreshAreaLabel(canvas, objId, newVertices, pxPerMm);
  canvas.requestRenderAll();
}

/** Applies (or clears, if zone is null) a zone's color to an existing traced room without touching its geometry. */
export function applyZoneToRoom(canvas: Canvas, objId: string, zone: { id: string; color: string } | null, pxPerMm: number | null): void {
  const vertices = getTraceVertices(canvas, objId);
  if (!vertices) return;
  const old = canvas.getObjects().find((o) => getPlandroidId(o) === objId);
  if (old) canvas.remove(old);
  const rebuilt = buildTracedRoomObject(vertices, zone);
  setPlandroidId(rebuilt, objId);
  canvas.add(rebuilt);
  refreshAreaLabel(canvas, objId, vertices, pxPerMm);
  canvas.requestRenderAll();
}
