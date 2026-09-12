import type { BomRow } from '../lib/takeoff/bomRow';
import { computeLineTotal } from '../lib/takeoff/bomRow';
import { formatSizeMm, formatQuantity, type UnitSystem } from '../lib/units';

interface CostingTableProps {
  rows: BomRow[];
  system: UnitSystem;
  onChangeRow: (costItemId: string, patch: { unitCost?: number; marginPercent?: number }) => void;
}

export default function CostingTable({ rows, system, onChangeRow }: CostingTableProps) {
  const grandTotal = rows.reduce((sum, r) => sum + computeLineTotal(r), 0);

  return (
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-700">
          <th className="py-1.5 pr-2">Item</th>
          <th className="py-1.5 pr-2">Size</th>
          <th className="py-1.5 pr-2 text-right">Qty</th>
          <th className="py-1.5 pr-2 text-right">Unit Cost</th>
          <th className="py-1.5 pr-2 text-right">Margin %</th>
          <th className="py-1.5 pr-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const qty = formatQuantity(row.quantity, row.unitLabel, system);
          return (
            <tr key={row.costItemId} className="border-b border-slate-800">
              <td className="py-1.5 pr-2">{row.itemLabel}</td>
              <td className="py-1.5 pr-2 text-slate-400">{formatSizeMm(row.sizeMm, system)}</td>
              <td className="py-1.5 pr-2 text-right">
                {qty.value.toFixed(qty.unit === 'ea' ? 0 : 1)} {qty.unit}
              </td>
              <td className="py-1.5 pr-2 text-right">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unitCost}
                  onChange={(e) => onChangeRow(row.costItemId, { unitCost: Number(e.target.value) })}
                  className="w-20 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right"
                />
              </td>
              <td className="py-1.5 pr-2 text-right">
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={row.marginPercent}
                  onChange={(e) => onChangeRow(row.costItemId, { marginPercent: Number(e.target.value) })}
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right"
                />
              </td>
              <td className="py-1.5 pr-2 text-right text-slate-200">{computeLineTotal(row).toFixed(2)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5} className="py-2 text-right text-slate-400">
            Grand Total
          </td>
          <td className="py-2 text-right font-bold">{grandTotal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
