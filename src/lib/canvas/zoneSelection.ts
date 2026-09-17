import type { Canvas, FabricObject } from 'fabric';
import { getPlandroidData, getPlandroidId } from './plandroidData';

export interface RoomSelection {
  objId: string;
  currentZoneId: string | null;
  screenX: number;
  screenY: number;
}

function screenPositionOf(canvas: Canvas, obj: FabricObject): { x: number; y: number } {
  const rect = obj.getBoundingRect();
  const vpt = canvas.viewportTransform;
  return {
    x: (rect.left + rect.width / 2) * vpt[0] + vpt[4],
    y: rect.top * vpt[3] + vpt[5],
  };
}

export function attachZoneSelection(canvas: Canvas, onSelection: (sel: RoomSelection | null) => void): () => void {
  function report(target: FabricObject | undefined) {
    if (!target || getPlandroidData(target)?.plandroidKind !== 'traced_room') {
      onSelection(null);
      return;
    }
    const pos = screenPositionOf(canvas, target);
    onSelection({
      objId: getPlandroidId(target) ?? '',
      currentZoneId: getPlandroidData(target)?.plandroidZoneId ?? null,
      screenX: pos.x,
      screenY: pos.y,
    });
  }

  const onCreated = (opt: { selected?: FabricObject[] }) => report(opt.selected?.[0]);
  const onUpdated = (opt: { selected?: FabricObject[] }) => report(opt.selected?.[0]);
  const onCleared = () => onSelection(null);

  canvas.on('selection:created', onCreated);
  canvas.on('selection:updated', onUpdated);
  canvas.on('selection:cleared', onCleared);

  return () => {
    canvas.off('selection:created', onCreated);
    canvas.off('selection:updated', onUpdated);
    canvas.off('selection:cleared', onCleared);
  };
}
