import { useState, type FormEvent } from 'react';

interface CalibrationModalProps {
  onConfirm: (mm: number) => void;
  onCancel: () => void;
}

export default function CalibrationModal({ onConfirm, onCancel }: CalibrationModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0) {
      setError('Enter a positive distance in millimeters.');
      return;
    }
    onConfirm(mm);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-600 rounded-lg p-5 w-80 shadow-xl"
      >
        <h2 className="text-sm font-mono mb-1">Calibrate Scale</h2>
        <p className="text-xs text-slate-400 mb-3">
          Enter the real-world distance between the two points you clicked.
        </p>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            min="0.1"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="6000"
            className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-sky-500"
          />
          <span className="text-xs text-slate-400">mm</span>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded border border-slate-600 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button type="submit" className="text-xs px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500">
            Set Scale
          </button>
        </div>
      </form>
    </div>
  );
}
