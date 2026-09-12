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
  const equipment: ImportedCatalogItem[] = [];
  const ductwork: ImportedCatalogItem[] = [];
  const fittings: ImportedCatalogItem[] = [];

  for (const row of rows) {
    const item: ImportedCatalogItem = { id: nanoid(), ...row, importedAt: now };
    const store = classifyCategory(row.category);
    if (store === 'equipmentCatalog') equipment.push(item);
    else if (store === 'ductworkCatalog') ductwork.push(item);
    else fittings.push(item);
  }

  await db.transaction('rw', [db.equipmentCatalog, db.ductworkCatalog, db.fittingsCatalog], async () => {
    if (equipment.length) await db.equipmentCatalog.bulkAdd(equipment);
    if (ductwork.length) await db.ductworkCatalog.bulkAdd(ductwork);
    if (fittings.length) await db.fittingsCatalog.bulkAdd(fittings);
  });

  return { equipment: equipment.length, ductwork: ductwork.length, fittings: fittings.length };
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
