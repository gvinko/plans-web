import { CATALOG } from '../catalog/registry';
import { classifyCategory } from '../import/excelSchema';
import type { PortSize } from '../catalog/types';
import type { PlandroidData } from '../canvas/plandroidData';

export type TakeoffCategory = 'duct_rigid' | 'duct_flex' | 'equipment' | 'fitting' | 'terminal';

export interface TakeoffLine {
  /** Stable grouping key, also used as CostItem.refType — e.g. "duct_rigid:400x250" or "fitting-elbow-90". */
  key: string;
  category: TakeoffCategory;
  itemLabel: string;
  sizeMm: PortSize | null;
  /** Meters for duct rows, item count for component rows. */
  quantity: number;
  unitLabel: 'm' | 'ea';
  /** Only set for rows backed by an imported catalog price (built-in catalog items default via CostItem instead). */
  defaultUnitCost?: number;
}

/** Shape of a plain (deserialized) Fabric object entry — only the field we attached ourselves matters here. */
export interface PlandroidRecordLike {
  plandroid?: PlandroidData;
}

const IMPORTED_CATEGORY_TO_TAKEOFF: Record<string, TakeoffCategory> = {
  equipmentCatalog: 'equipment',
  ductworkCatalog: 'fitting', // ductwork rows aren't placed as blocks — see costSync.ts for duct pricing instead
  fittingsCatalog: 'fitting',
};

export function computeTakeoff(records: PlandroidRecordLike[]): TakeoffLine[] {
  const rigidMmBySize = new Map<string, number>();
  const flexMmByDiameter = new Map<number, number>();
  const componentCounts = new Map<
    string,
    { count: number; sizeMm: PortSize | null; importedMeta?: PlandroidData['plandroidImportedMeta'] }
  >();

  for (const rec of records) {
    const d = rec.plandroid;
    if (!d) continue;

    if (d.plandroidKind === 'duct_rigid' && d.plandroidWidthMm && d.plandroidDepthMm && d.plandroidLengthMm) {
      const key = `${d.plandroidWidthMm}x${d.plandroidDepthMm}`;
      rigidMmBySize.set(key, (rigidMmBySize.get(key) ?? 0) + d.plandroidLengthMm);
      continue;
    }
    if (d.plandroidKind === 'duct_flex' && d.plandroidDiameterMm && d.plandroidLengthMm) {
      flexMmByDiameter.set(d.plandroidDiameterMm, (flexMmByDiameter.get(d.plandroidDiameterMm) ?? 0) + d.plandroidLengthMm);
      continue;
    }
    if (d.plandroidComponentId) {
      const existing = componentCounts.get(d.plandroidComponentId);
      const sizeMm = d.plandroidPorts?.[0]?.sizeMm ?? null;
      componentCounts.set(d.plandroidComponentId, {
        count: (existing?.count ?? 0) + 1,
        sizeMm,
        importedMeta: d.plandroidImportedMeta ?? existing?.importedMeta,
      });
    }
  }

  const lines: TakeoffLine[] = [];

  for (const [sizeKey, totalMm] of rigidMmBySize) {
    const [width, depth] = sizeKey.split('x').map(Number);
    lines.push({
      key: `duct_rigid:${sizeKey}`,
      category: 'duct_rigid',
      itemLabel: 'Rigid Sheet Metal Duct',
      sizeMm: { width, depth },
      quantity: totalMm / 1000,
      unitLabel: 'm',
    });
  }

  for (const [diameter, totalMm] of flexMmByDiameter) {
    lines.push({
      key: `duct_flex:${diameter}`,
      category: 'duct_flex',
      itemLabel: 'Flexible Duct',
      sizeMm: { diameter },
      quantity: totalMm / 1000,
      unitLabel: 'm',
    });
  }

  for (const [componentId, { count, sizeMm, importedMeta }] of componentCounts) {
    const def = CATALOG.find((c) => c.id === componentId);
    const category = def?.category ?? (importedMeta ? IMPORTED_CATEGORY_TO_TAKEOFF[classifyCategory(importedMeta.category)] : 'fitting');
    lines.push({
      key: componentId,
      category,
      itemLabel: def?.label ?? importedMeta?.itemName ?? componentId,
      sizeMm,
      quantity: count,
      unitLabel: 'ea',
      defaultUnitCost: importedMeta?.unitCost,
    });
  }

  return lines.sort((a, b) => a.itemLabel.localeCompare(b.itemLabel));
}
