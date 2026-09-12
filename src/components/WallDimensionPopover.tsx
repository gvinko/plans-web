import { useState, type FormEvent } from 'react';

interface WallDimensionPopoverProps {
  screenX: number;
  screenY: number;
  currentLengthPx: number;
  pxPerMm: number | null;
  onConfirm: (mm: number) => void;
  onCancel: () => void;
}

export default function WallDimensionPopover({
  screenX,
  screenY,
  currentLengthPx,
  pxPerMm,
  onConfirm,
  onCancel,
}: WallDimensionPopoverProps) {
  const currentMm = pxPerMm ? currentLengthPx / pxPerMm : null;
  const [value, setValue] = useState(currentMm ? Math.round(currentMm).toString() : '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0) {
      setError('Enter a positive length in mm.');
      return;
    }
    onConfirm(mm);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ left: screenX, top: screenY }}
      className="absolute z-20 -translate-x-1/2 -translate-y-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-mono shadow-xl"
    >
      <input
        autoFocus
        type="number"
        min="1"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="5400"
        className="w-20 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5"
      />
      <span className="text-slate-400">mm</span>
      <button type="submit" className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500">
        Set
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
        \u2715
      </button>
      {error && <span className="text-red-400">{error}</span>}
      {!pxPerMm && <span className="text-amber-400">Unscaled sketch \u2014 length applies directly</span>}
    </form>
  );
}
