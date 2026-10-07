import type { DuctFunction, DuctToolParams } from '../lib/canvas/ductDrawing';
import type { ApplicationMode } from '../store/appStore';
import { ROUND_DUCT_PRESETS } from '../lib/canvas/ductColors';

interface DuctToolOptionsProps {
  mode: 'duct-rigid' | 'duct-flex';
  widthMm: number;
  depthMm: number;
  diameterMm: number;
  ductFunction: DuctFunction;
  commercialStatus: DuctToolParams['commercialStatus'];
  applicationMode: ApplicationMode;
  onChange: (patch: Partial<DuctToolParams>) => void;
}

export default function DuctToolOptions({ mode, widthMm, depthMm, diameterMm, ductFunction, commercialStatus, applicationMode, onChange }: DuctToolOptionsProps) {
  return (
    <div className="absolute top-3 left-3 z-10 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 flex items-center gap-3 text-xs font-mono shadow-lg">
      {applicationMode === 'commercial' && (
        <>
          <select value={ductFunction} onChange={(e)=>onChange({ductFunction:e.target.value as DuctFunction})} className="bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5">
            <option value="supply">SA — Supply</option><option value="return">RA — Return</option><option value="outside-air">OA — Outside Air</option><option value="exhaust">EA — Exhaust</option><option value="toilet-exhaust">TE — Toilet Exhaust</option><option value="transfer-air">TA — Transfer Air</option>
          </select>
          <select value={commercialStatus} onChange={(e)=>onChange({commercialStatus:e.target.value as DuctToolParams['commercialStatus']})} className="bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5">
            <option value="new">New</option><option value="existing-retain">Existing — Retain</option><option value="existing-relocate">Existing — Relocate</option><option value="remove">Remove</option>
          </select>
        </>
      )}
      {mode === 'duct-rigid' ? (
        <>
          <div className="flex items-center gap-1">
            {applicationMode === 'domestic' && (['supply', 'return'] as DuctFunction[]).map((fn) => (
              <button
                key={fn}
                type="button"
                onClick={() => onChange({ ductFunction: fn })}
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
              onChange={(e) => onChange({ widthMm: Number(e.target.value) })}
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
              onChange={(e) => onChange({ depthMm: Number(e.target.value) })}
              className="w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5"
            />
          </label>
          <span className="text-slate-500">mm</span>
        </>
      ) : (
        <div className="flex items-center gap-1">
          <span>Ø</span>
          {ROUND_DUCT_PRESETS.map((p) => (
            <button key={p.mm} type="button" title={`${p.mm} mm`} onClick={() => onChange({ diameterMm: p.mm })}
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
