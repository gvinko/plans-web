import { Circle, type Canvas, type FabricObject } from 'fabric';
import { getWorldPorts, findSnapMatch } from './ports';
import { getPorts, getPlandroidId, getPlandroidData, setPlandroidData } from './plandroidData';
import { normalizeDeg } from './geometry';

const SNAP_RADIUS_SCREEN_PX = 15;

export function attachSnapEngine(canvas: Canvas): () => void {
  let highlight: Circle | null = null;

  function clearHighlight() {
    if (highlight) {
      canvas.remove(highlight);
      highlight = null;
    }
  }

  function showHighlight(x: number, y: number) {
    const zoom = canvas.getZoom();
    const r = 8 / zoom;
    if (highlight) canvas.remove(highlight);
    highlight = new Circle({
      left: x,
      top: y,
      radius: r,
      originX: 'center',
      originY: 'center',
      fill: 'transparent',
      stroke: '#4ade80',
      strokeWidth: 2 / zoom,
      selectable: false,
      evented: false,
    });
    canvas.add(highlight);
    canvas.requestRenderAll();
  }

  function onMoving(opt: { target?: FabricObject }) {
    const target = opt.target;
    if (!target || getPorts(target).length === 0) {
      clearHighlight();
      return;
    }

    const zoom = canvas.getZoom();
    const radius = SNAP_RADIUS_SCREEN_PX / zoom;
    const match = findSnapMatch(getWorldPorts(target), canvas.getObjects(), target, radius);

    if (!match) {
      clearHighlight();
      const data = getPlandroidData(target);
      if (data?.plandroidSnappedTo) setPlandroidData(target, { ...data, plandroidSnappedTo: undefined });
      return;
    }

    const desiredWorldAngle = normalizeDeg(match.targetPort.worldAngleDeg + 180);
    const rotationDelta = desiredWorldAngle - match.movingPort.worldAngleDeg;
    const newAngle = normalizeDeg((target.angle ?? 0) + rotationDelta);
    target.set('angle', newAngle);
    target.setCoords();

    const rotatedMoving = getWorldPorts(target).find((p) => p.port.id === match.movingPort.port.id);
    if (rotatedMoving) {
      const dx = match.targetPort.worldX - rotatedMoving.worldX;
      const dy = match.targetPort.worldY - rotatedMoving.worldY;
      target.set({ left: (target.left ?? 0) + dx, top: (target.top ?? 0) + dy });
      target.setCoords();
    }

    showHighlight(match.targetPort.worldX, match.targetPort.worldY);

    const data = getPlandroidData(target);
    if (data) {
      setPlandroidData(target, {
        ...data,
        plandroidSnappedTo: { objId: getPlandroidId(match.targetPort.obj) ?? '', portId: match.targetPort.port.id },
      });
    }
  }

  function onModified() {
    clearHighlight();
  }

  canvas.on('object:moving', onMoving);
  canvas.on('object:modified', onModified);

  return () => {
    canvas.off('object:moving', onMoving);
    canvas.off('object:modified', onModified);
    clearHighlight();
  };
}
