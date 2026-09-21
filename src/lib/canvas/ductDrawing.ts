import { nanoid } from 'nanoid';
import { Circle, type FabricObject, type TPointerEventInfo, type TPointerEvent } from 'fabric';
import type { CanvasEngine } from './CanvasEngine';
import type { Vec2 } from './geometry';
import { buildRigidDuctObject, buildFlexDuctObject } from './ductGeometry';
import { setPlandroidId } from './plandroidData';
import { findNearestPortToPoint } from './ports';
import type { PortKind } from '../catalog/types';
import { resolveRoundDuctColor, resolveRectDuctColor, DEFAULT_SUPPLY_COLOR, DEFAULT_RETURN_COLOR, DEFAULT_FLEX_COLOR } from './ductColors';

export type DuctFunction = 'supply' | 'return';

export interface DuctToolParams {
  widthMm: number;
  depthMm: number;
  diameterMm: number;
  ductFunction: DuctFunction;
}

const CLICK_SNAP_RADIUS_SCREEN_PX = 15;
const JOINT_MARKER_RADIUS_PX = 5;

function buildJointMarker(p: Vec2, color: string): Circle {
  return new Circle({
    left: p.x,
    top: p.y,
    radius: JOINT_MARKER_RADIUS_PX,
    originX: 'center',
    originY: 'center',
    fill: color,
    stroke: 'transparent',
    selectable: false,
    evented: false,
  });
}

export function attachDuctDrawing(
  engine: CanvasEngine,
  getPxPerMm: () => number | null,
  getParams: () => DuctToolParams,
  getDuctColorOverrides: () => Record<string, string>,
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

  /** Called whenever we observe the tool mode isn't ours anymore — clears any in-progress draft so
   * switching away mid-draw (e.g. clicking "Select" in the toolbar after only one click) can never
   * leave a stale start point that gets reused if the user re-enters a duct tool later. This is the
   * duct-drawing equivalent of the trace-wall "stuck" bug — state surviving an external mode switch. */
  function resetIfToolChanged() {
    const mode = engine.getToolMode();
    if (mode !== 'duct-rigid' && mode !== 'duct-flex' && (startPoint || previewObj)) {
      startPoint = null;
      clearPreview();
      canvas.requestRenderAll();
    }
    return mode;
  }

  function resolveClickPoint(rawPointer: Vec2, mode: 'duct-rigid' | 'duct-flex'): Vec2 {
    const kind: PortKind = mode === 'duct-rigid' ? 'duct_rect' : 'duct_flex';
    const radius = CLICK_SNAP_RADIUS_SCREEN_PX / canvas.getZoom();
    const match = findNearestPortToPoint(rawPointer, canvas.getObjects(), kind, radius);
    return match ? { x: match.worldX, y: match.worldY } : rawPointer;
  }

  function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    const mode = resetIfToolChanged();
    if (mode !== 'duct-rigid' && mode !== 'duct-flex') return;

    // Allow duct sketching before calibration so site plans can be drawn immediately.
    // Once calibrated, the real px/mm scale is used; before that we use a sensible visual sketch scale.
    const pxPerMm = getPxPerMm() ?? 0.1;

    const point = resolveClickPoint(canvas.getPointer(opt.e), mode);

    if (!startPoint) {
      startPoint = point;
      return;
    }

    const params = getParams();
    const overrides = getDuctColorOverrides();
    if (mode === 'duct-rigid') {
      const functionFallback = params.ductFunction === 'return' ? DEFAULT_RETURN_COLOR : DEFAULT_SUPPLY_COLOR;
      const color = resolveRectDuctColor(params.widthMm, params.depthMm, overrides, functionFallback);
      const { rect, label } = buildRigidDuctObject(startPoint, point, params.widthMm, params.depthMm, pxPerMm, color);
      setPlandroidId(rect, nanoid());
      const jointA = buildJointMarker(startPoint, color);
      const jointB = buildJointMarker(point, color);
      canvas.add(rect, label, jointA, jointB);
      engine.recordUndoGroup([rect, label, jointA, jointB]);
    } else {
      const color = resolveRoundDuctColor(params.diameterMm, overrides, DEFAULT_FLEX_COLOR);
      const path = buildFlexDuctObject(startPoint, point, params.diameterMm, pxPerMm, color);
      setPlandroidId(path, nanoid());
      // Flex is intentionally editable after placement: drag it, stretch it from its
      // end/side handles, or snap either end to a compatible flex connection.
      path.set({
        selectable: true,
        evented: true,
        hasControls: true,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false,
        transparentCorners: false,
        cornerSize: 12,
      });
      canvas.add(path);
      canvas.setActiveObject(path);
      engine.recordUndoGroup([path]);
    }
    clearPreview();
    startPoint = null;
    canvas.requestRenderAll();
    onSegmentCommitted();
  }

  function onMouseMove(opt: TPointerEventInfo<TPointerEvent>) {
    const mode = resetIfToolChanged();
    if ((mode !== 'duct-rigid' && mode !== 'duct-flex') || !startPoint) return;
    const pxPerMm = getPxPerMm() ?? 0.1;

    const point = resolveClickPoint(canvas.getPointer(opt.e), mode);
    const params = getParams();
    const overrides = getDuctColorOverrides();

    clearPreview();
    if (mode === 'duct-rigid') {
      const functionFallback = params.ductFunction === 'return' ? DEFAULT_RETURN_COLOR : DEFAULT_SUPPLY_COLOR;
      const color = resolveRectDuctColor(params.widthMm, params.depthMm, overrides, functionFallback);
      const { rect } = buildRigidDuctObject(startPoint, point, params.widthMm, params.depthMm, pxPerMm, color);
      rect.set({ opacity: 0.5, selectable: false, evented: false });
      previewObj = rect;
    } else {
      const color = resolveRoundDuctColor(params.diameterMm, overrides, DEFAULT_FLEX_COLOR);
      const path = buildFlexDuctObject(startPoint, point, params.diameterMm, pxPerMm, color);
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
