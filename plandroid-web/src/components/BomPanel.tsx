import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { setUnitSystem } from '../db/repository';
import { collectProjectRecords } from '../lib/takeoff/collectRecords';
import { computeTakeoff } from '../lib/takeoff/takeoff';
import { syncCostItems } from '../lib/takeoff/costSync';
import { buildBomCsv, downloadCsv } from '../lib/takeoff/exportCsv';
import type { BomRow } from '../lib/takeoff/bomRow';
import CostingTable from './CostingTable';

interface BomPanelProps {
  projectId: string;
  activePlanPageId: string | null;
  getLiveCanvasJson: () => unknown | null;
  onClose: () => void;
}

export default function BomPanel({ projectId, activePlanPageId, getLiveCanvasJson, onClose }: BomPanelProps) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const costItems = useLiveQuery(() => db.costItems.where({ projectId }).toArray(), [projectId]);
  const livePlanPage = useLiveQuery(
    () => (activePlanPageId ? db.planPages.get(activePlanPageId) : undefined),
    [activePlanPageId],
  );

  const [rows, setRows] = useState<BomRow[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const records = await collectProjectRecords(projectId, activePlanPageId, getLiveCanvasJson());
      const lines = computeTakeoff(records);
      const items = await syncCostItems(projectId, lines);
      const itemsByRef = new Map(items.map((i) => [i.refType, i]));

      setRows(
        lines.map((line) => {
          const item = itemsByRef.get(line.key);
          return {
            costItemId: item?.id ?? line.key,
            key: line.key,
            category: line.category,
            itemLabel: line.itemLabel,
            sizeMm: line.sizeMm,
            quantity: line.quantity,
            unitLabel: line.unitLabel,
            unitCost: item?.unitCost ?? 0,
            marginPercent: item?.marginPercent ?? 20,
          };
        }),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, activePlanPageId, getLiveCanvasJson]);

  // Recompute on open, and again shortly after every autosave of the active page (keeps the BOM "live" while it's open).
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, livePlanPage?.canvasJSON]);

  // If a cost value is edited elsewhere while this panel is open, reflect it without re-running the whole takeoff.
  useEffect(() => {
    if (!costItems) return;
    setRows((prev) =>
      prev.map((row) => {
        const item = costItems.find((c) => c.refType === row.key);
        return item ? { ...row, unitCost: item.unitCost, marginPercent: item.marginPercent, costItemId: item.id } : row;
      }),
    );
  }, [costItems]);

  async function handleChangeRow(costItemId: string, patch: { unitCost?: number; marginPercent?: number }) {
    await db.costItems.update(costItemId, patch);
  }

  async function handleToggleUnitSystem() {
    if (!project) return;
    await setUnitSystem(projectId, project.unitSystem === 'metric' ? 'imperial' : 'metric');
  }

  function handleExportCsv() {
    if (!project) return;
    const csv = buildBomCsv(rows, project.unitSystem);
    downloadCsv(`${project.name.replace(/\s+/g, '_')}_BOM.csv`, csv);
  }

  const system = project?.unitSystem ?? 'metric';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-4xl max-h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-wrap gap-2">
          <h2 className="text-sm font-mono">Bill of Materials &amp; Costing</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleToggleUnitSystem} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
              {system === 'metric' ? 'Metric (mm / L\u00B7s\u207B\u00B9 / m\u00B7s\u207B\u00B9)' : 'US Customary (in / CFM / FPM)'}
            </button>
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing\u2026' : 'Refresh'}
            </button>
            <button onClick={handleExportCsv} className="text-xs px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500">
              Export CSV
            </button>
            <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="text-xs text-slate-500">No duct, fittings, or terminals placed yet.</p>
          ) : (
            <CostingTable rows={rows} system={system} onChangeRow={handleChangeRow} />
          )}
        </div>
      </div>
    </div>
  );
}
