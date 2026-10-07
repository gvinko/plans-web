import { useEffect, useMemo, useRef, useState } from 'react';
import { createPhotoReliefMesh, type ReliefOptions } from '../lib/geometry/photoRelief';
import { exportBinaryStl, type StlMesh } from '../lib/stl/stl';
import type { PrinterProfile } from '../lib/printers/profiles';
import { createSplitPlan } from '../lib/printers/splitPlanner';

interface PhotoReliefStudioProps {
  printer: PrinterProfile;
  onClose: () => void;
}

const DEFAULT_OPTIONS: ReliefOptions = {
  widthMm: 120,
  baseThicknessMm: 1.2,
  reliefDepthMm: 2.8,
  resolution: 96,
  invert: false,
};

export default function PhotoReliefStudio({ printer, onClose }: PhotoReliefStudioProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<ReliefOptions>(DEFAULT_OPTIONS);
  const [mesh, setMesh] = useState<StlMesh | null>(null);
  const [status, setStatus] = useState('Choose a photo to create a printable relief.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const splitPlan = useMemo(() => {
    if (!mesh) return null;
    return createSplitPlan(
      { x: mesh.bounds.size.x, y: mesh.bounds.size.y, z: mesh.bounds.size.z },
      printer,
    );
  }, [mesh, printer]);

  async function generate() {
    if (!file) {
      setStatus('Choose an image first.');
      return;
    }
    setBusy(true);
    setStatus('Generating printable relief mesh…');
    try {
      const next = await createPhotoReliefMesh(file, options);
      setMesh(next);
      setStatus(
        `Generated ${next.triangles.length.toLocaleString()} triangles · ${next.bounds.size.x.toFixed(1)} × ${next.bounds.size.y.toFixed(1)} × ${next.bounds.size.z.toFixed(1)} mm`,
      );
    } catch (error) {
      setMesh(null);
      setStatus(error instanceof Error ? error.message : 'Could not generate relief.');
    } finally {
      setBusy(false);
    }
  }

  function exportMesh() {
    if (!mesh) return;
    const fileOut = exportBinaryStl(mesh, `${mesh.name}-relief.stl`);
    const url = URL.createObjectURL(fileOut);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileOut.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${fileOut.name}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Photo Relief / Lithophane Studio</h2>
          <p className="text-[11px] text-slate-500">Generate a closed printable height-map mesh from a photo</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded bg-sky-700 px-3 py-1.5 text-xs hover:bg-sky-600"
          >
            Choose photo
          </button>
          <button
            disabled={!file || busy}
            onClick={() => void generate()}
            className="rounded bg-violet-700 px-3 py-1.5 text-xs hover:bg-violet-600 disabled:opacity-40"
          >
            Generate
          </button>
          <button
            disabled={!mesh}
            onClick={exportMesh}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600 disabled:opacity-40"
          >
            Export STL
          </button>
          <button onClick={onClose} className="rounded bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700">
            Close
          </button>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setFile(next);
          setMesh(null);
          if (next) {
            const url = URL.createObjectURL(next);
            setPreviewUrl(url);
            setStatus(`Ready: ${next.name}`);
          } else {
            setPreviewUrl(null);
          }
          event.currentTarget.value = '';
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-[320px] flex-1 items-center justify-center overflow-auto bg-slate-950 p-5">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Relief source"
              className="max-h-full max-w-full rounded border border-slate-800 object-contain shadow-2xl"
            />
          ) : (
            <div className="rounded border border-dashed border-slate-700 px-8 py-12 text-center text-sm text-slate-500">
              Choose a photo to begin.
            </div>
          )}
        </section>

        <aside className="w-full overflow-y-auto border-t border-slate-800 bg-slate-900/80 p-4 lg:w-80 lg:border-l lg:border-t-0">
          <div className="rounded bg-slate-950 p-2 text-xs text-slate-400">{status}</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {([
              ['widthMm', 'Width mm', 1],
              ['baseThicknessMm', 'Base mm', 0.1],
              ['reliefDepthMm', 'Relief mm', 0.1],
              ['resolution', 'Resolution', 1],
            ] as const).map(([key, label, step]) => (
              <label key={key} className="text-[10px] text-slate-500">
                {label}
                <input
                  type="number"
                  min={key === 'resolution' ? 16 : 0.1}
                  max={key === 'resolution' ? 180 : undefined}
                  step={step}
                  value={options[key]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setOptions({ ...options, [key]: value });
                    setMesh(null);
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                />
              </label>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={options.invert}
              onChange={(event) => {
                setOptions({ ...options, invert: event.target.checked });
                setMesh(null);
              }}
            />
            Invert light/dark height
          </label>

          <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-500">
            Higher resolution gives more detail but creates larger STL files. The mesh includes a flat backing and closed perimeter walls so the exported object is a printable solid.
          </div>

          {mesh && (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Printer fit</div>
              <div className={`mt-2 rounded p-2 text-xs ${splitPlan?.required ? 'bg-amber-950/60 text-amber-200' : 'bg-emerald-950/50 text-emerald-300'}`}>
                {splitPlan?.required ? (
                  <>
                    Oversized for {printer.name}. Estimated split requirement: {splitPlan.estimatedPartCount} parts.
                    {splitPlan.axes.map((axis) => (
                      <div key={axis.axis} className="mt-1">
                        {axis.axis.toUpperCase()}: {axis.partCount} sections ≈ {axis.targetPartSizeMm.toFixed(1)} mm
                      </div>
                    ))}
                  </>
                ) : (
                  <>Fits {printer.name} build volume.</>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
