import { useRef, useState, type DragEvent } from 'react';
import { parseCatalogFile } from '../lib/import/parseWorkbook';
import { importCatalogRows, clearImportedCatalog, type ImportSummary } from '../db/catalogRepository';

interface ExcelImporterDialogProps {
  onClose: () => void;
}

export default function ExcelImporterDialog({ onClose }: ExcelImporterDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ result: ImportSummary; skipped: number } | null>(null);

  async function handleFile(file: File) {
    setIsParsing(true);
    setError(null);
    setSummary(null);
    try {
      const { rows, skippedRowCount } = await parseCatalogFile(file);
      if (rows.length === 0) {
        setError('No usable rows found. Check that the sheet has Item Name/Model and Category columns.');
        return;
      }
      const result = await importCatalogRows(rows);
      setSummary({ result, skipped: skippedRowCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsParsing(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleClear() {
    if (!window.confirm('Clear the entire imported equipment and pricing catalog? This cannot be undone.')) return;
    await clearImportedCatalog();
    setSummary(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-mono">Import Equipment &amp; Pricing</h2>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer text-xs ${
              isDragOver ? 'border-sky-400 bg-sky-600/10' : 'border-slate-600 hover:border-slate-500'
            }`}
          >
            {isParsing ? 'Parsing\u2026' : 'Drop a .xlsx or .csv price book here, or click to browse'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />

          <p className="text-[11px] text-slate-500">
            Expected columns: Item Name/Model, Category (FCU, Condenser, Sheet Metal, Grille, \u2026), Dimensions
            (WxDxH or diameter), Airflow (L/s or CFM), Base Cost, Sell Price. Sheet-Metal rows price your duct
            runs by matching size \u2014 they aren\u2019t placed on the canvas. Everything else appears in the
            Components palette under &quot;Imported Price Book&quot;.
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {summary && (
            <div className="text-xs bg-slate-800 border border-slate-700 rounded p-3 space-y-1">
              <p>Imported {summary.result.equipment} equipment, {summary.result.ductwork} ductwork, {summary.result.fittings} fittings.</p>
              {summary.skipped > 0 && <p className="text-amber-400">{summary.skipped} row(s) skipped (missing Item Name or Category).</p>}
            </div>
          )}

          <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-300">
            Clear imported catalog
          </button>
        </div>
      </div>
    </div>
  );
}
