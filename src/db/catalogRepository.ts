import { nanoid } from 'nanoid';
import { db } from './index';
import type { ImportedCatalogItem } from './schema';
import type { ImportedCatalogRow } from '../lib/import/excelSchema';
import { classifyCategory } from '../lib/import/excelSchema';

export interface ImportSummary {
  equipment: number;
  ductwork: number;
  fittings: number;
}

export async function importCatalogRows(rows: ImportedCatalogRow[]): Promise<ImportSummary> {
  const now = Date.now();
  const summary: ImportSummary = { equipment: 0, ductwork: 0, fittings: 0 };
  await db.transaction('rw', [db.equipmentCatalog, db.ductworkCatalog, db.fittingsCatalog], async () => {
    for (const row of rows) {
      const storeName = classifyCategory(row.category);
      const table = storeName === 'equipmentCatalog' ? db.equipmentCatalog : storeName === 'ductworkCatalog' ? db.ductworkCatalog : db.fittingsCatalog;
      const existing = (await table.toArray()).find((x) =>
        x.itemName.trim().toLowerCase() === row.itemName.trim().toLowerCase() &&
        x.category.trim().toLowerCase() === row.category.trim().toLowerCase()
      );
      const item: ImportedCatalogItem = { id: existing?.id ?? nanoid(), ...row, importedAt: now };
      await table.put(item);
      if (storeName === 'equipmentCatalog') summary.equipment++;
      else if (storeName === 'ductworkCatalog') summary.ductwork++;
      else summary.fittings++;
    }
  });
  return summary;
}

export async function clearImportedCatalog(): Promise<void> {
  await db.transaction('rw', [db.equipmentCatalog, db.ductworkCatalog, db.fittingsCatalog], async () => {
    await db.equipmentCatalog.clear();
    await db.ductworkCatalog.clear();
    await db.fittingsCatalog.clear();
  });
}

/** Looks an imported item up by id across all three catalog tables — used at placement time. */
export async function findImportedItem(id: string): Promise<ImportedCatalogItem | null> {
  return (
    (await db.equipmentCatalog.get(id)) ??
    (await db.ductworkCatalog.get(id)) ??
    (await db.fittingsCatalog.get(id)) ??
    null
  );
}
