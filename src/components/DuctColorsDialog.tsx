import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { setDuctColorOverride } from '../db/repository';
import { ROUND_DUCT_PRESETS, roundSizeKey, rectSizeKey } from '../lib/canvas/ductColors';
import { collectProjectRecords } from '../lib/takeoff/collectRecords';
import { computeTakeoff } from '../lib/takeoff/takeoff';

interface DuctColorsDialogProps {
  projectId: string;
  activePlanPageId: string | null;
  getLiveCanvasJson: () => unknown | null;
  onClose: () => void;
}

interface Row {
  key: string;
  label: string;
  defaultColor: string;
}

export default function DuctColorsDialog({ projectId, activePlanPageId, getLiveCanvasJson, onClose }: DuctColorsDialogProps) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const [rectRows, setRectRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const records = await collectProjectRecords(projectId, activePlanPageId, getLiveCanvasJson());
      const lines = computeTakeoff(records);
      const rows: Row[] = [];
      for (const line of lines) {
        if (line.category === 'duct_rigid' && line.sizeMm && 'width' in line.sizeMm) {
          rows.push({
            key: rectSizeKey(line.sizeMm.width, line.sizeMm.depth),
            label: `${line.sizeMm.width}\u00D7${line.sizeMm.depth} mm (rigid)`,
            defaultColor: '#94a3b8',
          });
        }
      }
      setRectRows(rows);
    })();
  }, [projectId, activePlanPageId, getLiveCanvasJson]);

  const overrides = project?.ductColorOverrides ?? {};

  async function handleChange(key: string, color: string) {
    await setDuctColorOverride(projectId, key, color);
  }

  async function handleReset(key: string) {
    await setDuctColorOverride(projectId, key, null);
  }

  const roundRows: Row[] = ROUND_DUCT_PRESETS.map((p) => ({
    key: roundSizeKey(p.mm),
    label: `\u00D8${p.inch}" (${p.mm} mm, flex)`,
    defaultColor: p.color,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-mono">Duct Colours</h2>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
            Close
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <h3 className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Standard Round Sizes</h3>
            <div className="space-y-1.5">
              {roundRows.map((row) => (
                <ColorRow
                  key={row.key}
                  row={row}
                  currentColor={overrides[row.key] ?? row.defaultColor}
                  isOverridden={Boolean(overrides[row.key])}
                  onChange={(c) => handleChange(row.key, c)}
                  onReset={() => handleReset(row.key)}
                />
              ))}
            </div>
          </div>

          {rectRows.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Rigid Duct Sizes In This Project</h3>
              <div className="space-y-1.5">
                {rectRows.map((row) => (
                  <ColorRow
                    key={row.key}
                    row={row}
                    currentColor={overrides[row.key] ?? row.defaultColor}
                    isOverridden={Boolean(overrides[row.key])}
                    onChange={(c) => handleChange(row.key, c)}
                    onReset={() => handleReset(row.key)}
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            Colours apply to duct drawn from now on \u2014 existing duct on the plan keeps whatever colour it was drawn with.
          </p>
        </div>
      </div>
    </div>
  );
}

function ColorRow({
  row,
  currentColor,
  isOverridden,
  onChange,
  onReset,
}: {
  row: Row;
  currentColor: string;
  isOverridden: boolean;
  onChange: (color: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={currentColor}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-slate-700 bg-slate-800 cursor-pointer"
      />
      <span className="flex-1 font-mono text-slate-300">{row.label}</span>
      {isOverridden && (
        <button onClick={onReset} className="text-slate-500 hover:text-slate-300 text-[11px]">
          Reset
        </button>
      )}
    </div>
  );
}
