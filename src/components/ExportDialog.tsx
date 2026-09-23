import { useState } from 'react';
import type { Canvas } from 'fabric';
import { exportDrawingToPdf } from '../lib/pdf/exportDrawing';
import { STANDARD_SCALES, type PaperSize } from '../lib/pdf/pageLayout';
import { collectProjectRecords } from '../lib/takeoff/collectRecords';
import { computeTakeoff } from '../lib/takeoff/takeoff';
import { getAppSettings } from '../db/appSettingsRepository';
import { loadImageFromBlob } from '../lib/pdf/loadImage';
import type { UnitSystem } from '../lib/units';
import { SERIALIZED_PROPS } from '../lib/canvas/plandroidData';

interface ExportDialogProps {
  projectId: string;
  projectName: string;
  designer: string;
  revision: string;
  unitSystem: UnitSystem;
  pxPerMm: number | null;
  activePlanPageId: string | null;
  getCanvas: () => Canvas | null;
  onClose: () => void;
}

export default function ExportDialog({
  projectId,
  projectName,
  designer,
  revision,
  unitSystem,
  pxPerMm,
  activePlanPageId,
  getCanvas,
  onClose,
}: ExportDialogProps) {
  const [paper, setPaper] = useState<PaperSize>('a3');
  const [autoScale, setAutoScale] = useState(true);
  const [manualScale, setManualScale] = useState(100);
  const [client, setClient] = useState('');
  const [address, setAddress] = useState('');
  const [systemType, setSystemType] = useState('');
  const [drawingNumber, setDrawingNumber] = useState('M01');
  const [notes, setNotes] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    const canvas = getCanvas();
    if (!canvas) return;
    if (!pxPerMm) {
      setError('Calibrate the plan before exporting a scaled drawing.');
      return;
    }

    setIsExporting(true);
    setError(null);
    try {
      const canvasJson = canvas.toObject([...SERIALIZED_PROPS]);
      const records = await collectProjectRecords(projectId, activePlanPageId, canvasJson);
      const takeoffLines = computeTakeoff(records);
      const appSettings = await getAppSettings();
      const logoImage = appSettings.logoImage ? await loadImageFromBlob(appSettings.logoImage).catch(() => null) : null;

      const doc = exportDrawingToPdf({
        canvas,
        pxPerMm,
        paper,
        unitSystem,
        takeoffLines,
        manualScaleDenominator: autoScale ? undefined : manualScale,
        titleBlockInfo: {
          projectName,
          designer,
          client,
          address,
          systemType,
          date: new Date().toLocaleDateString(),
          revision,
          notes,
          drawingNumber,
          companyName: appSettings.companyName,
          contactName: appSettings.contactName,
          contactPhone: appSettings.contactPhone,
          contactEmail: appSettings.contactEmail,
          logoImage,
        },
      });

      doc.save(`${projectName.replace(/\s+/g, '_')}_${paper.toUpperCase()}.pdf`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-mono">Export Drawing (PDF)</h2>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
            Close
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          {!pxPerMm && (
            <p className="text-amber-400">This plan isn\u2019t calibrated yet \u2014 export needs a real-world scale.</p>
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="radio" checked={paper === 'a3'} onChange={() => setPaper('a3')} /> A3
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={paper === 'a4'} onChange={() => setPaper('a4')} /> A4
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="radio" checked={autoScale} onChange={() => setAutoScale(true)} /> Auto-fit scale
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={!autoScale} onChange={() => setAutoScale(false)} /> 1:
              <select
                value={manualScale}
                onChange={(e) => setManualScale(Number(e.target.value))}
                disabled={autoScale}
                className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 disabled:opacity-50"
              >
                {STANDARD_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Client"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <input
            value={systemType}
            onChange={(e) => setSystemType(e.target.value)}
            placeholder="System Type (e.g. Ducted Split A/C)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <input
            value={drawingNumber}
            onChange={(e) => setDrawingNumber(e.target.value)}
            placeholder="Drawing No. (e.g. M01)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />

          {error && <p className="text-red-400">{error}</p>}

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full text-center px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50"
          >
            {isExporting ? 'Generating\u2026' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
