export interface ImportedCatalogRow {
  itemName: string;
  category: string;
  dimensions: string | null;
  airflowValue: number | null;
  airflowUnit: 'L/s' | 'CFM' | null;
  baseCost: number;
  sellPrice: number;
}

type FieldKey = 'itemName' | 'category' | 'dimensions' | 'airflowValue' | 'baseCost' | 'sellPrice';

/** Header text is matched case-insensitively; "includes" as well as exact match, so
 * "Item Name/Model" matches both "item" and "model" aliases. */
const HEADER_ALIASES: Record<FieldKey, string[]> = {
  itemName: ['item name/model', 'item name', 'item/model', 'model', 'item', 'name'],
  category: ['category', 'type'],
  dimensions: ['dimensions', 'dimension', 'size', 'wxdxh', 'diameter'],
  airflowValue: ['airflow (l/s)', 'airflow (cfm)', 'airflow', 'flow', 'cfm', 'l/s'],
  baseCost: ['base cost', 'unit cost', 'cost'],
  sellPrice: ['sell price', 'sale price', 'price', 'sell'],
};

function normalize(h: string): string {
  return h.trim().toLowerCase();
}

function findField(row: Record<string, unknown>, aliases: string[]): { value: unknown; header: string } | null {
  for (const header of Object.keys(row)) {
    const nh = normalize(header);
    if (aliases.some((a) => nh === a || nh.includes(a))) {
      return { value: row[header], header: nh };
    }
  }
  return null;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Returns null for rows missing the two fields required to classify and label an item at all. */
export function parseCatalogRow(row: Record<string, unknown>): ImportedCatalogRow | null {
  const itemNameHit = findField(row, HEADER_ALIASES.itemName);
  const categoryHit = findField(row, HEADER_ALIASES.category);
  if (!itemNameHit || !categoryHit) return null;

  const itemName = String(itemNameHit.value ?? '').trim();
  if (!itemName) return null;

  const dimensionsHit = findField(row, HEADER_ALIASES.dimensions);
  const airflowHit = findField(row, HEADER_ALIASES.airflowValue);
  const baseCostHit = findField(row, HEADER_ALIASES.baseCost);
  const sellPriceHit = findField(row, HEADER_ALIASES.sellPrice);

  let airflowUnit: 'L/s' | 'CFM' | null = null;
  if (airflowHit) {
    if (airflowHit.header.includes('cfm')) airflowUnit = 'CFM';
    else if (airflowHit.header.includes('l/s')) airflowUnit = 'L/s';
  }

  return {
    itemName,
    category: String(categoryHit.value ?? '').trim(),
    dimensions: dimensionsHit ? String(dimensionsHit.value ?? '').trim() || null : null,
    airflowValue: airflowHit ? toNumberOrNull(airflowHit.value) : null,
    airflowUnit,
    baseCost: baseCostHit ? toNumberOrNull(baseCostHit.value) ?? 0 : 0,
    sellPrice: sellPriceHit ? toNumberOrNull(sellPriceHit.value) ?? 0 : 0,
  };
}

export type CatalogStoreName = 'equipmentCatalog' | 'ductworkCatalog' | 'fittingsCatalog';

/** Heuristic keyword match on the free-text Category column — sheets aren't standardized, so this
 * only needs to be right for the four example categories the spec gives plus common synonyms. */
export function classifyCategory(category: string): CatalogStoreName {
  const c = category.toLowerCase();
  if (/fcu|condenser|compressor|indoor|outdoor|package|equipment|unit/.test(c)) return 'equipmentCatalog';
  if (/duct|sheet\s*metal|plenum/.test(c)) return 'ductworkCatalog';
  return 'fittingsCatalog'; // grille, diffuser, damper, elbow, reducer, coupling, etc.
}
