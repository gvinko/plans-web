interface DuctToolOptionsProps {
  mode: 'duct-rigid' | 'duct-flex';
  widthMm: number;
  depthMm: number;
  diameterMm: number;
  onChange: (next: { widthMm: number; depthMm: number; diameterMm: number }) => void;
}

export default function DuctToolOptions({ mode, widthMm, depthMm, diameterMm, onChange }: DuctToolOptionsProps) {
  return (
    <div className="absolute top-3 left-3 z-10 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 flex items-center gap-3 text-xs font-mono shadow-lg">
      {mode === 'duct-rigid' ? (
        <>
          <label className="flex items-center gap-1">
            W
            <input
              type="number"
              min={50}
              step={10}
              value={widthMm}
              onChange={(e) => onChange({ widthMm: Number(e.target.value), depthMm, diameterMm })}
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
              onChange={(e) => onChange({ widthMm, depthMm: Number(e.target.value), diameterMm })}
              className="w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5"
            />
          </label>
          <span className="text-slate-500">mm</span>
        </>
      ) : (
        <label className="flex items-center gap-1">
          Ø
          <input
            type="number"
            min={50}
            step={10}
            value={diameterMm}
            onChange={(e) => onChange({ widthMm, depthMm, diameterMm: Number(e.target.value) })}
            className="w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5"
          />
          <span className="text-slate-500">mm</span>
        </label>
      )}
    </div>
  );
}
