import type { Canvas, FabricObject, TPointerEventInfo, TPointerEvent } from 'fabric';
import type { CanvasEngine } from './CanvasEngine';
import { distance, distancePointToSegment, midpoint, type Vec2 } from './geometry';
import { getPlandroidData, getPlandroidId, setPlandroidId } from './plandroidData';
import { buildTracedRoomObject } from './wallTracing';

export interface WallEdgeSelection {
  objId: string;
  edgeIndex: number;
  currentLengthPx: number;
  midpointCanvas: Vec2;
  p1: Vec2;
  p2: Vec2;
}

/** Finds the nearest edge of `vertices` (a closed loop) to `point`. */
function nearestEdgeIndex(point: Vec2, vertices: Vec2[]): number {
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
  return bestIndex;
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

export function attachWallDimensionEdit(engine: CanvasEngine, onEdgeSelected: (sel: WallEdgeSelection) => void): () => void {
  const canvas = engine.canvas;
  function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    if (engine.getToolMode() !== 'select') return;
    const target = opt.target as FabricObject | undefined;
    if (!target || getPlandroidData(target)?.plandroidKind !== 'traced_room') return;

    const vertices = (target as unknown as { plandroidTraceVerticesPx?: Vec2[] }).plandroidTraceVerticesPx;
    if (!vertices || vertices.length < 2) return;

    const pointer = canvas.getPointer(opt.e);
    const edgeIndex = nearestEdgeIndex(pointer, vertices);
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

/** Rebuilds the room object in place (Fabric can't cheaply resize an existing Polygon's points array). */
export function rebuildTracedRoom(canvas: Canvas, objId: string, newVertices: Vec2[]): void {
  const old = canvas.getObjects().find((o) => getPlandroidId(o) === objId);
  if (old) canvas.remove(old);
  const rebuilt = buildTracedRoomObject(newVertices);
  setPlandroidId(rebuilt, objId); // keep the same identity — CostItem/BOM refs, if any, stay stable
  canvas.add(rebuilt);
  canvas.requestRenderAll();
}
