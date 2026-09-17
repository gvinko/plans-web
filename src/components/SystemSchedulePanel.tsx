import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Canvas, FabricObject } from 'fabric';
import { db } from '../db';
import { getPlandroidData, getPlandroidId, setPlandroidData } from '../lib/canvas/plandroidData';
import { CATALOG } from '../lib/catalog/registry';

interface ScheduleRow {
  objId: string;
  tag: string;
  item: string;
  airflowLs: number | null;
  zoneId: string | null;
  notes: string;
}

interface SystemSchedulePanelProps {
  projectId: string;
  getCanvas: () => Canvas | null;
  onClose: () => void;
}

function readRows(canvas: Canvas): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const obj of canvas.getObjects()) {
    const data = getPlandroidData(obj);
    if (!data || (data.plandroidKind !== 'equipment' && data.plandroidKind !== 'terminal')) continue;
    const objId = getPlandroidId(obj);
    if (!objId) continue;
    const builtIn = CATALOG.find((c) => c.id === data.plandroidComponentId);
    rows.push({
      objId,
      tag: data.plandroidScheduleTag ?? '\u2014',
      item: builtIn?.label ?? data.plandroidImportedMeta?.itemName ?? data.plandroidComponentId ?? '\u2014',
      airflowLs: data.plandroidAirflowLs ?? null,
      zoneId: data.plandroidZoneId ?? null,
      notes: data.plandroidScheduleNotes ?? '',
    });
  }
  return rows.sort((a, b) => a.tag.localeCompare(b.tag));
}

export default function SystemSchedulePanel({ projectId, getCanvas, onClose }: SystemSchedulePanelProps) {
  const zones = useLiveQuery(() => db.zones.where({ projectId }).toArray(), [projectId]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);

  const refresh = useCallback(() => {
    const canvas = getCanvas();
    if (canvas) setRows(readRows(canvas));
  }, [getCanvas]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(objId: string, patch: Partial<Pick<ScheduleRow, 'tag' | 'airflowLs' | 'zoneId' | 'notes'>>) {
    const canvas = getCanvas();
    if (!canvas) return;
    const obj = canvas.getObjects().find((o) => getPlandroidId(o) === objId);
    if (!obj) return;
    const data = getPlandroidData(obj);
    if (!data) return;

    setPlandroidData(obj, {
      ...data,
      plandroidScheduleTag: patch.tag ?? data.plandroidScheduleTag,
      plandroidAirflowLs: patch.airflowLs !== undefined ? patch.airflowLs ?? undefined : data.plandroidAirflowLs,
      plandroidZoneId: patch.zoneId !== undefined ? patch.zoneId ?? undefined : data.plandroidZoneId,
      plandroidScheduleNotes: patch.notes ?? data.plandroidScheduleNotes,
    });
    // Editing custom data doesn't fire Fabric's own change events, so autosave needs a manual nudge.
    canvas.fire('object:modified', { target: obj as FabricObject });
    setRows((prev) => prev.map((r) => (r.objId === objId ? { ...r, ...patch } : r)));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-3xl max-h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-mono">System Schedule \u2014 This Page</h2>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
              Refresh
            </button>
            <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="text-xs text-slate-500">No equipment or terminals placed on this page yet.</p>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="py-1.5 pr-2">Tag</th>
                  <th className="py-1.5 pr-2">Item</th>
                  <th className="py-1.5 pr-2 text-right">Airflow (L/s)</th>
                  <th className="py-1.5 pr-2">Zone</th>
                  <th className="py-1.5 pr-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.objId} className="border-b border-slate-800">
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.tag}
                        onChange={(e) => updateField(row.objId, { tag: e.target.value })}
                        className="w-20 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-slate-300">{row.item}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.airflowLs ?? ''}
                        onChange={(e) => updateField(row.objId, { airflowLs: e.target.value ? Number(e.target.value) : null })}
                        placeholder="\u2014"
                        className="w-20 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={row.zoneId ?? ''}
                        onChange={(e) => updateField(row.objId, { zoneId: e.target.value || null })}
                        className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5"
                      >
                        <option value="">\u2014</option>
                        {zones?.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.notes}
                        onChange={(e) => updateField(row.objId, { notes: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
