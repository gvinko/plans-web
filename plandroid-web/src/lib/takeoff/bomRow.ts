import type { PortSize } from '../catalog/types';
import type { TakeoffCategory } from './takeoff';

export interface BomRow {
  costItemId: string;
  key: string;
  category: TakeoffCategory;
  itemLabel: string;
  sizeMm: PortSize | null;
  quantity: number;
  unitLabel: 'm' | 'ea';
  unitCost: number;
  marginPercent: number;
}

export function computeLineTotal(row: BomRow): number {
  return row.quantity * row.unitCost * (1 + row.marginPercent / 100);
}
