import { nanoid } from 'nanoid';
import type { TPointerEventInfo, TPointerEvent } from 'fabric';
import { CATALOG } from '../catalog/registry';
import { buildImportedCatalogSymbol } from '../catalog/importedSymbol';
import { findImportedItem } from '../../db/catalogRepository';
import { getPlandroidData, setPlandroidData, setPlandroidId } from './plandroidData';
import type { CanvasEngine } from './CanvasEngine';
import type { IconStyle } from '../catalog/types';
import { nextScheduleTag } from './scheduleTags';
import { cfmToLs } from '../units';

/** Active only while toolMode is 'place-component'. Handles both the built-in catalog (sync)
 * and imported price-book items (one Dexie lookup, since only their id is known synchronously). */
export function attachComponentPlacement(
  engine: CanvasEngine,
  getPendingComponentId: () => string | null,
  getIconStyle: () => IconStyle,
  onPlaced: () => void,
): () => void {
  const canvas = engine.canvas;

  async function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    if (engine.getToolMode() !== 'place-component') return;
    const componentId = getPendingComponentId();
    if (!componentId) return;

    const pointer = canvas.getPointer(opt.e);
    const style = getIconStyle();

    const builtIn = CATALOG.find((c) => c.id === componentId);
    const obj = builtIn ? builtIn.build(style) : await buildFromImported(componentId, style);
    if (!obj) return;

    obj.set({ left: pointer.x, top: pointer.y });
    setPlandroidId(obj, nanoid());

    // Only equipment/terminal placements get schedule tags — fittings (elbows, couplings) aren't scheduled items.
    const data = getPlandroidData(obj);
    if (data && (data.plandroidKind === 'equipment' || data.plandroidKind === 'terminal')) {
      const label = builtIn?.label ?? data.plandroidImportedMeta?.itemName ?? componentId;
      const tag = nextScheduleTag(canvas, componentId, label);
      const importedAirflow = data.plandroidImportedMeta;
      const airflowLs =
        importedAirflow?.airflowValue != null
          ? importedAirflow.airflowUnit === 'CFM'
            ? cfmToLs(importedAirflow.airflowValue)
            : importedAirflow.airflowValue
          : undefined;
      setPlandroidData(obj, { ...data, plandroidScheduleTag: tag, plandroidAirflowLs: airflowLs });
    }

    canvas.add(obj);
    canvas.setActiveObject(obj);
    engine.recordUndoGroup([obj]);
    canvas.requestRenderAll();
    onPlaced();
  }

  async function buildFromImported(id: string, style: IconStyle) {
    const item = await findImportedItem(id);
    return item ? buildImportedCatalogSymbol(item, style) : null;
  }

  canvas.on('mouse:down', onMouseDown);
  return () => canvas.off('mouse:down', onMouseDown);
}
