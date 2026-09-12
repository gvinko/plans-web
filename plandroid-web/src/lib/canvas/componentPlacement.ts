import { nanoid } from 'nanoid';
import type { TPointerEventInfo, TPointerEvent } from 'fabric';
import { CATALOG } from '../catalog/registry';
import { buildImportedCatalogSymbol } from '../catalog/importedSymbol';
import { findImportedItem } from '../../db/catalogRepository';
import { setPlandroidId } from './plandroidData';
import type { CanvasEngine } from './CanvasEngine';

/** Active only while toolMode is 'place-component'. Handles both the built-in catalog (sync)
 * and imported price-book items (one Dexie lookup, since only their id is known synchronously). */
export function attachComponentPlacement(
  engine: CanvasEngine,
  getPendingComponentId: () => string | null,
  onPlaced: () => void,
): () => void {
  const canvas = engine.canvas;

  async function onMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    if (engine.getToolMode() !== 'place-component') return;
    const componentId = getPendingComponentId();
    if (!componentId) return;

    const pointer = canvas.getPointer(opt.e);

    const builtIn = CATALOG.find((c) => c.id === componentId);
    const obj = builtIn ? builtIn.build() : await buildFromImported(componentId);
    if (!obj) return;

    obj.set({ left: pointer.x, top: pointer.y });
    setPlandroidId(obj, nanoid());
    canvas.add(obj);
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    onPlaced();
  }

  async function buildFromImported(id: string) {
    const item = await findImportedItem(id);
    return item ? buildImportedCatalogSymbol(item) : null;
  }

  canvas.on('mouse:down', onMouseDown);
  return () => canvas.off('mouse:down', onMouseDown);
}
