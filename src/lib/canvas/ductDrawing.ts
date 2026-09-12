import { nanoid } from 'nanoid';
import type { FabricObject, TPointerEventInfo, TPointerEvent } from 'fabric';
import type { CanvasEngine } from './CanvasEngine';
import type { Vec2 } from './geometry';
import { buildRigidDuctObject, buildFlexDuctObject } from './ductGeometry';
import { setPlandroidId } from './plandroidData';
import { findNearestPortToPoint } from './ports';
import type { PortKind } from '../catalog/types';

export interface DuctToolParams {
  widthMm: number;
  depthMm: number;
  diameterMm: number;
}

const CLICK_SNAP_RADIUS_SCREEN_PX = 15;

export function attachDuctDrawing(
  engine: CanvasEngine,
  getPxPerMm: () => number | null,
  getParams: () => DuctToolParams,
  onSegmentCommitted: () => void,
): () => void {
  const canvas = engine.canvas;
  let startPoint: Vec2 | null = null;
  let previewObj: FabricObject | null = null;

  function clearPreview() {
    if (previewObj) {
      canvas.remove(previewObj);
      previewObj = null;
    }
  }

  function resolveClickPoint(rawPointer: Vec2, mode: 'duct-rigid' | 'duct-flex'): Vec2 {
    const kind: PortKind = mode === 'duct-rigid' ? 'duct_rect' : 'duct_flex';
    const radius = CLICK_SNAP_RADIUS_SCREEN_PX / canvas.getZoom();
    const match = findNearestPortToPoint(rawPointer, canvas.getObjects(), kind, radius);
    return match ? { x: match.worldX, y: match.worldY } : rawPointer;
  }

  function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    const mode = engine.getToolMode();
    if (mode !== 'duct-rigid' && mode !== 'duct-flex') return;

    const pxPerMm = getPxPerMm();
    if (!pxPerMm) return; // duct dimensions are only meaningful once the plan is calibrated

    const point = resolveClickPoint(canvas.getPointer(opt.e), mode);

    if (!startPoint) {
      startPoint = point;
      return;
    }

    const params = getParams();
    if (mode === 'duct-rigid') {
      const { rect, label } = buildRigidDuctObject(startPoint, point, params.widthMm, params.depthMm, pxPerMm);
      setPlandroidId(rect, nanoid());
      canvas.add(rect, label);
    } else {
      const path = buildFlexDuctObject(startPoint, point, params.diameterMm, pxPerMm);
      setPlandroidId(path, nanoid());
      canvas.add(path);
    }
    clearPreview();
    startPoint = null;
    canvas.requestRenderAll();
    onSegmentCommitted();
  }

  function onMouseMove(opt: TPointerEventInfo<TPointerEvent>) {
    const mode = engine.getToolMode();
    if ((mode !== 'duct-rigid' && mode !== 'duct-flex') || !startPoint) return;
    const pxPerMm = getPxPerMm();
    if (!pxPerMm) return;

    const point = resolveClickPoint(canvas.getPointer(opt.e), mode);
    const params = getParams();

    clearPreview();
    if (mode === 'duct-rigid') {
      const { rect } = buildRigidDuctObject(startPoint, point, params.widthMm, params.depthMm, pxPerMm);
      rect.set({ opacity: 0.5, strokeDashArray: [4, 4], selectable: false, evented: false });
      previewObj = rect;
    } else {
      const path = buildFlexDuctObject(startPoint, point, params.diameterMm, pxPerMm);
      path.set({ opacity: 0.5, selectable: false, evented: false });
      previewObj = path;
    }
    canvas.add(previewObj);
    canvas.requestRenderAll();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      startPoint = null;
      clearPreview();
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
    clearPreview();
  };
}
