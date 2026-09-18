import { Circle, type Canvas, type FabricObject } from 'fabric';
import { getPlandroidData, getPlandroidId, setPlandroidData } from './plandroidData';
import { findNearestPortToPoint } from './ports';
import type { PortKind } from '../catalog/types';
import { buildRigidDuctObject, buildFlexDuctObject } from './ductGeometry';

const HANDLE_RADIUS_SCREEN_PX = 7;
const SNAP_RADIUS_SCREEN_PX = 18;

/**
 * Makes placed ducts behave like connector lines: select a duct, then drag either endpoint.
 * We rebuild the visual geometry while preserving the same Fabric object identity so autosave,
 * selection and takeoff metadata continue to work.
 */
export function attachDuctConnectorEditing(canvas: Canvas, getPxPerMm: () => number | null): () => void {
  let handles: Circle[] = [];
  let activeDuct: FabricObject | null = null;

  function clearHandles() {
    handles.forEach((h) => canvas.remove(h));
    handles = [];
    activeDuct = null;
  }

  function isDuct(obj: FabricObject | undefined | null) {
    const kind = obj ? getPlandroidData(obj)?.plandroidKind : null;
    return kind === 'duct_rigid' || kind === 'duct_flex';
  }

  function makeHandle(which: 'start' | 'end', x: number, y: number) {
    const zoom = canvas.getZoom();
    const h = new Circle({
      left: x, top: y, radius: HANDLE_RADIUS_SCREEN_PX / zoom,
      originX: 'center', originY: 'center', fill: '#f8fafc', stroke: '#0284c7',
      strokeWidth: 2 / zoom, hasControls: false, hasBorders: false,
      selectable: true, evented: true, excludeFromExport: true,
    });
    (h as unknown as { connectorHandle?: 'start' | 'end' }).connectorHandle = which;
    h.on('moving', () => updateFromHandle(h, which));
    h.on('modified', () => canvas.fire('object:modified', { target: activeDuct ?? undefined }));
    canvas.add(h);
    handles.push(h);
  }

  function showHandles(obj: FabricObject) {
    clearHandles();
    const connector = getPlandroidData(obj)?.plandroidConnector;
    if (!connector) return;
    activeDuct = obj;
    makeHandle('start', connector.start.x, connector.start.y);
    makeHandle('end', connector.end.x, connector.end.y);
    handles.forEach((h) => canvas.bringObjectToFront(h));
  }

  function updateFromHandle(handle: Circle, which: 'start' | 'end') {
    if (!activeDuct) return;
    const pxPerMm = getPxPerMm();
    const data = getPlandroidData(activeDuct);
    const connector = data?.plandroidConnector;
    if (!pxPerMm || !data || !connector) return;

    const raw = { x: handle.left ?? 0, y: handle.top ?? 0 };
    const kind: PortKind = data.plandroidKind === 'duct_flex' ? 'duct_flex' : 'duct_rect';
    const match = findNearestPortToPoint(raw, canvas.getObjects().filter((o) => o !== activeDuct && !handles.includes(o as Circle)), kind, SNAP_RADIUS_SCREEN_PX / canvas.getZoom());
    const point = match ? { x: match.worldX, y: match.worldY } : raw;
    const targetId = match ? getPlandroidId(match.obj) : null;
    const binding = match && targetId ? { objId: targetId, portId: match.port.id } : undefined;
    handle.set({ left: point.x, top: point.y });
    const next = {
      ...connector,
      [which]: point,
      ...(which === 'start' ? { startBinding: binding } : { endBinding: binding }),
    };
    const fill = typeof activeDuct.fill === 'string' ? activeDuct.fill : '#22c55e';
    const stroke = typeof activeDuct.stroke === 'string' ? activeDuct.stroke : '#9ca3af';
    const rebuilt = data.plandroidKind === 'duct_rigid'
      ? buildRigidDuctObject(next.start, next.end, data.plandroidWidthMm ?? 400, data.plandroidDepthMm ?? 250, pxPerMm, fill).rect
      : buildFlexDuctObject(next.start, next.end, data.plandroidDiameterMm ?? 200, pxPerMm, stroke);

    const rebuiltData = getPlandroidData(rebuilt);
    activeDuct.set({
      left: rebuilt.left, top: rebuilt.top, width: rebuilt.width, height: rebuilt.height,
      angle: rebuilt.angle, path: (rebuilt as unknown as { path?: unknown }).path,
      fill: rebuilt.fill, stroke: rebuilt.stroke, strokeWidth: rebuilt.strokeWidth,
      rx: (rebuilt as unknown as { rx?: number }).rx, ry: (rebuilt as unknown as { ry?: number }).ry,
    } as never);
    if (rebuiltData) setPlandroidData(activeDuct, { ...data, ...rebuiltData, plandroidConnector: next });
    activeDuct.setCoords();
    canvas.requestRenderAll();
  }

  function onSelection(opt: { selected?: FabricObject[] }) {
    const obj = opt.selected?.[0];
    if (isDuct(obj)) showHandles(obj!); else clearHandles();
  }
  function onCleared() { clearHandles(); }

  canvas.on('selection:created', onSelection);
  canvas.on('selection:updated', onSelection);
  canvas.on('selection:cleared', onCleared);
  return () => {
    canvas.off('selection:created', onSelection);
    canvas.off('selection:updated', onSelection);
    canvas.off('selection:cleared', onCleared);
    clearHandles();
  };
}
