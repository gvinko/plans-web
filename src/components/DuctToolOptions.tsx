import type { DuctFunction } from '../lib/canvas/ductDrawing';
import { ROUND_DUCT_PRESETS } from '../lib/canvas/ductColors';

interface DuctToolOptionsProps {
  mode: 'duct-rigid' | 'duct-flex';
  widthMm: number;
  depthMm: number;
  diameterMm: number;
  ductFunction: DuctFunction;
  onChange: (next: { widthMm: number; depthMm: number; diameterMm: number; ductFunction: DuctFunction }) => void;
}

export default function DuctToolOptions({ mode, widthMm, depthMm, diameterMm, ductFunction, onChange }: DuctToolOptionsProps) {
  return (
    <div className="absolute top-3 left-3 z-10 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 flex items-center gap-3 text-xs font-mono shadow-lg">
      {mode === 'duct-rigid' ? (
        <>
          <div className="flex items-center gap-1">
            {(['supply', 'return'] as DuctFunction[]).map((fn) => (
              <button
                key={fn}
                type="button"
                onClick={() => onChange({ widthMm, depthMm, diameterMm, ductFunction: fn })}
                className={`px-2 py-0.5 rounded capitalize ${
                  ductFunction === fn ? (fn === 'supply' ? 'bg-green-600' : 'bg-red-600') : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                {fn}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1">
            W
            <input
              type="number"
              min={50}
              step={10}
              value={widthMm}
              onChange={(e) => onChange({ widthMm: Number(e.target.value), depthMm, diameterMm, ductFunction })}
              className="w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            D
            <input
              type="number"
              min={50}
              step={10}
              value={depthMm}
              onChange={(e) => onChange({ widthMm, depthMm: Number(e.target.value), diameterMm, ductFunction })}
              className="w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5"
            />
          </label>
          <span className="text-slate-500">mm</span>
        </>
      ) : (
        <div className="flex items-center gap-1">
          <span>Ø</span>
          {ROUND_DUCT_PRESETS.map((p) => (
            <button key={p.mm} type="button" title={`${p.mm} mm`} onClick={() => onChange({ widthMm, depthMm, diameterMm: p.mm, ductFunction })}
              className={`px-2 py-1 rounded border ${diameterMm === p.mm ? 'border-white' : 'border-slate-600'}`}
              style={{ backgroundColor: p.color, color: p.mm === 300 ? '#111827' : '#fff' }}>
              {p.mm}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
