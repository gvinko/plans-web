import { nanoid } from 'nanoid';
import { Circle, Polygon, Polyline, type TPointerEventInfo, type TPointerEvent } from 'fabric';
import type { CanvasEngine } from './CanvasEngine';
import type { Vec2 } from './geometry';
import { snapToOrtho } from './orthoSnap';
import { setPlandroidData, setPlandroidId, getPlandroidId } from './plandroidData';
import { refreshAreaLabel } from './roomArea';

const CLOSE_LOOP_RADIUS_SCREEN_PX = 20;
const NEUTRAL_FILL = 'rgba(56, 189, 248, 0.08)';
const NEUTRAL_STROKE = '#38bdf8';

export function buildTracedRoomObject(vertices: Vec2[], zone?: { id: string; color: string } | null): Polygon {
  const stroke = zone ? zone.color : NEUTRAL_STROKE;
  const fill = zone ? hexToRgba(zone.color, 0.12) : NEUTRAL_FILL;
  const poly = new Polygon(
    vertices.map((v) => ({ x: v.x, y: v.y })),
    {
      fill,
      stroke,
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      objectCaching: false,
    },
  );
  setPlandroidData(poly, { plandroidKind: 'traced_room', plandroidPorts: [], plandroidZoneId: zone?.id });
  (poly as unknown as { plandroidTraceVerticesPx: Vec2[] }).plandroidTraceVerticesPx = vertices;
  setPlandroidId(poly, nanoid());
  return poly;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function attachWallTracing(engine: CanvasEngine, getPxPerMm: () => number | null, onRoomTraced: () => void): () => void {
  const canvas = engine.canvas;
  let points: Vec2[] = [];
  let markers: Circle[] = [];
  let previewLine: Polyline | null = null;

  function clearDraft() {
    markers.forEach((m) => canvas.remove(m));
    markers = [];
    if (previewLine) {
      canvas.remove(previewLine);
      previewLine = null;
    }
    points = [];
  }

  function addMarker(p: Vec2) {
    const zoom = canvas.getZoom();
    const r = 4 / zoom;
    const marker = new Circle({
      left: p.x - r,
      top: p.y - r,
      radius: r,
      fill: '#38bdf8',
      selectable: false,
      evented: false,
    });
    canvas.add(marker);
    markers.push(marker);
  }

  function resolveClickPoint(rawPointer: Vec2): { point: Vec2; shouldClose: boolean } {
    if (points.length === 0) return { point: rawPointer, shouldClose: false };

    const last = points[points.length - 1];
    const ortho = snapToOrtho(last, rawPointer);

    if (points.length >= 2) {
      const first = points[0];
      const radius = CLOSE_LOOP_RADIUS_SCREEN_PX / canvas.getZoom();
      if (Math.hypot(ortho.x - first.x, ortho.y - first.y) <= radius) {
        return { point: first, shouldClose: true };
      }
    }
    return { point: ortho, shouldClose: false };
  }

  function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    if (engine.getToolMode() !== 'trace-wall') return;
    const rawPointer = canvas.getPointer(opt.e);
    const { point, shouldClose } = resolveClickPoint(rawPointer);

    if (shouldClose) {
      const finalVertices = [...points];
      clearDraft();
      const room = buildTracedRoomObject(finalVertices);
      canvas.add(room);
      const roomId = getPlandroidId(room);
      const label = roomId ? refreshAreaLabel(canvas, roomId, finalVertices, getPxPerMm()) : null;
      engine.recordUndoGroup(label ? [room, label] : [room]);
      canvas.requestRenderAll();
      onRoomTraced();
      return;
    }

    points.push(point);
    addMarker(point);
    canvas.requestRenderAll();
  }

  function onMouseMove(opt: TPointerEventInfo<TPointerEvent>) {
    if (engine.getToolMode() !== 'trace-wall' || points.length === 0) return;
    const rawPointer = canvas.getPointer(opt.e);
    const { point } = resolveClickPoint(rawPointer);

    if (previewLine) canvas.remove(previewLine);
    previewLine = new Polyline([...points, point], {
      stroke: '#38bdf8',
      strokeWidth: 1.5,
      fill: 'transparent',
      selectable: false,
      evented: false,
      strokeDashArray: [5, 4],
    });
    canvas.add(previewLine);
    canvas.requestRenderAll();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      clearDraft();
      canvas.requestRenderAll();
    }
  }

  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.off('mouse:down', onMouseDown);
    canvas.off('mouse:move', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    clearDraft();
  };
}
