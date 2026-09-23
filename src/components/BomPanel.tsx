import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { setUnitSystem } from '../db/repository';
import { collectProjectRecords } from '../lib/takeoff/collectRecords';
import { computeTakeoff } from '../lib/takeoff/takeoff';
import { syncCostItems, DEFAULT_MARGIN_PERCENT } from '../lib/takeoff/costSync';
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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasJsonRef = useRef(getLiveCanvasJson);
  const requestIdRef = useRef(0);
  useEffect(() => { canvasJsonRef.current = getLiveCanvasJson; }, [getLiveCanvasJson]);
  useEffect(() => () => { requestIdRef.current++; }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsRefreshing(true);
    setError(null);
    try {
      const records = await collectProjectRecords(projectId, activePlanPageId, canvasJsonRef.current());
      const lines = computeTakeoff(records);
      const items = await syncCostItems(projectId, lines);
      if (requestId !== requestIdRef.current) return;
      const itemsByRef = new Map(items.map((i) => [i.refType, i]));
      setRows(lines.map((line) => {
        const item = itemsByRef.get(line.key);
        return {
          costItemId: item?.id ?? line.key, key: line.key, category: line.category,
          itemLabel: line.itemLabel, sizeMm: line.sizeMm, quantity: line.quantity,
          unitLabel: line.unitLabel, unitCost: item?.unitCost ?? 0,
          marginPercent: item?.marginPercent ?? DEFAULT_MARGIN_PERCENT,
        };
      }));
      setHasLoaded(true);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err instanceof Error ? err.message : 'Takeoff failed');
    } finally {
      if (requestId === requestIdRef.current) setIsRefreshing(false);
    }
  }, [projectId, activePlanPageId]);

  // Recompute on open, and again shortly after every autosave of the active page (keeps the BOM "live" while it's open).
  useEffect(() => {
    const t = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, livePlanPage?.canvasJSON]);

  // If a cost value is edited elsewhere while this panel is open, reflect it without re-running the whole takeoff.
  useEffect(() => {
    if (!costItems) return;
    setRows((prev) =>
      prev.map((row) => {
        const item = new Map(costItems.map((c) => [c.refType, c])).get(row.key);
        return item ? { ...row, unitCost: item.unitCost, marginPercent: item.marginPercent, costItemId: item.id } : row;
      }),
    );
  }, [costItems]);

  async function handleChangeRow(costItemId: string, patch: { unitCost?: number; marginPercent?: number }) {
    const clean: { unitCost?: number; marginPercent?: number } = {};
    if (patch.unitCost !== undefined && Number.isFinite(patch.unitCost) && patch.unitCost >= 0) clean.unitCost = patch.unitCost;
    if (patch.marginPercent !== undefined && Number.isFinite(patch.marginPercent) && patch.marginPercent >= 0) clean.marginPercent = patch.marginPercent;
    try {
      const updated = await db.costItems.update(costItemId, clean);
      if (updated === 0) void refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
  }

  async function handleToggleUnitSystem() {
    if (!project) return;
    await setUnitSystem(projectId, project.unitSystem === 'metric' ? 'imperial' : 'metric');
  }

  function handleExportCsv() {
    if (!project || isRefreshing) return;
    const csv = buildBomCsv(rows, project.unitSystem);
    const safeName = project.name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || 'project';
    downloadCsv(`${safeName}_BOM.csv`, csv);
  }

  const system = project?.unitSystem ?? 'metric';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="bom-panel-title" className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-4xl max-h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-wrap gap-2">
          <h2 id="bom-panel-title" className="text-sm font-mono">Bill of Materials &amp; Costing</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleToggleUnitSystem} disabled={!project} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
              {system === 'metric' ? 'Metric (mm / L\u00B7s\u207B\u00B9 / m\u00B7s\u207B\u00B9)' : 'US Customary (in / CFM / FPM)'}
            </button>
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing\u2026' : 'Refresh'}
            </button>
            <button onClick={handleExportCsv} disabled={!project || isRefreshing || rows.length === 0} className="text-xs px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500">
              Export CSV
            </button>
            <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-xs text-red-400">Error: {error}</p>
          ) : !hasLoaded ? (
            <p className="text-xs text-slate-500">Calculating takeoff…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-500">No duct, fittings, or terminals placed yet.</p>
          ) : (
            <CostingTable rows={rows} system={system} onChangeRow={handleChangeRow} />
          )}
        </div>
      </div>
    </div>
  );
}
