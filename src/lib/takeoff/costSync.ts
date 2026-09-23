import { nanoid } from 'nanoid';
import { db } from '../../db';
import type { CostItem } from '../../db/schema';
import type { TakeoffLine } from './takeoff';
import { parseDimensionsToPortSize, sizeMatches } from '../catalog/parseDimensions';

export const DEFAULT_MARGIN_PERCENT = 20;

/** Best-match price for a duct-run line from the imported ductwork price book, if any. */
async function findDuctworkUnitCost(line: TakeoffLine): Promise<number | null> {
  if ((line.category !== 'duct_rigid' && line.category !== 'duct_flex') || !line.sizeMm) return null;
  const entries = await db.ductworkCatalog.toArray();
  for (const entry of entries) {
    if (sizeMatches(parseDimensionsToPortSize(entry.dimensions), line.sizeMm)) {
      return entry.sellPrice || entry.baseCost || null;
    }
  }
  return null;
}

async function resolveDefaultUnitCost(line: TakeoffLine): Promise<number> {
  if (line.category === 'duct_rigid' || line.category === 'duct_flex') {
    return (await findDuctworkUnitCost(line)) ?? 0;
  }
  return line.defaultUnitCost ?? 0;
}

export async function syncCostItems(projectId: string, lines: TakeoffLine[]): Promise<CostItem[]> {
  const existing = await db.costItems.where({ projectId }).toArray();
  const existingByRef = new Map(existing.map((c) => [c.refType, c]));

  // Resolve prices for genuinely new lines up front — keeps the transaction itself synchronous-ish and narrow.
  const defaultCosts = new Map<string, number>();
  for (const line of lines) {
    if (!existingByRef.has(line.key)) {
      defaultCosts.set(line.key, await resolveDefaultUnitCost(line));
    }
  }

  const result: CostItem[] = [];

  await db.transaction('rw', db.costItems, async () => {
    for (const line of lines) {
      const current = existingByRef.get(line.key);

      if (current) {
        if (current.quantity !== line.quantity) {
          await db.costItems.update(current.id, { quantity: line.quantity });
        }
        result.push({ ...current, quantity: line.quantity });
      } else {
        const created: CostItem = {
          id: nanoid(),
          projectId,
          category: line.category,
          refType: line.key,
          description: line.itemLabel,
          unitCost: defaultCosts.get(line.key) ?? 0,
          marginPercent: DEFAULT_MARGIN_PERCENT,
          laborHoursPerUnit: 0,
          quantity: line.quantity,
          isManualOverride: false,
        };
        await db.costItems.add(created);
        result.push(created);
      }
    }

  });

  return result;
}
