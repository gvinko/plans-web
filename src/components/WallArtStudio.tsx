import { useMemo, useState } from 'react';
import type { PrinterProfile } from '../lib/printers/profiles';
import { createSplitPlan } from '../lib/printers/splitPlanner';
import { createRecessedPanelMesh } from '../lib/geometry/primitives';
import { exportBinaryStl } from '../lib/stl/stl';

interface WallArtStudioProps {
  printer: PrinterProfile;
  onClose: () => void;
}

export default function WallArtStudio({ printer, onClose }: WallArtStudioProps) {
  const [widthMm, setWidthMm] = useState(220);
  const [heightMm, setHeightMm] = useState(160);
  const [depthMm, setDepthMm] = useState(18);
  const [wallMm, setWallMm] = useState(3);
  const [backMm, setBackMm] = useState(2);
  const [status, setStatus] = useState('Configure a recessed wall panel or light box.');

  const mesh = useMemo(
    () => createRecessedPanelMesh(widthMm, heightMm, depthMm, wallMm, backMm, 'wall-art-panel'),
    [widthMm, heightMm, depthMm, wallMm, backMm],
  );

  const splitPlan = useMemo(
    () =>
      createSplitPlan(
        { x: mesh.bounds.size.x, y: mesh.bounds.size.y, z: mesh.bounds.size.z },
        printer,
      ),
    [mesh, printer],
  );

  function exportPanel() {
    const file = exportBinaryStl(mesh, 'wall-art-panel.stl');
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${file.name}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Wall Art / Light Box Studio</h2>
          <p className="text-[11px] text-slate-500">Generate a closed recessed panel with an internal cavity for lighting or inserts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportPanel} className="rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600">
            Export STL
          </button>
          <button onClick={onClose} className="rounded bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700">
            Close
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex flex-1 items-center justify-center overflow-auto p-6">
          <div
            className="relative border border-sky-500/70 bg-sky-950/20 shadow-2xl"
            style={{
              width: `${Math.max(220, Math.min(620, widthMm * 1.6))}px`,
              aspectRatio: `${widthMm} / ${heightMm}`,
            }}
          >
            <div
              className="absolute border border-violet-400/70 bg-slate-950/90"
              style={{
                left: `${(wallMm / widthMm) * 100}%`,
                right: `${(wallMm / widthMm) * 100}%`,
                top: `${(wallMm / heightMm) * 100}%`,
                bottom: `${(wallMm / heightMm) * 100}%`,
              }}
            >
              <div className="flex h-full items-center justify-center text-center text-xs text-slate-500">
                Recessed cavity<br />
                {Math.max(0, depthMm - backMm).toFixed(1)} mm usable depth
              </div>
            </div>
          </div>
        </section>

        <aside className="w-full overflow-y-auto border-t border-slate-800 bg-slate-900/80 p-4 lg:w-80 lg:border-l lg:border-t-0">
          <div className="rounded bg-slate-950 p-2 text-xs text-slate-400">{status}</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {([
              ['widthMm', 'Width mm', widthMm, setWidthMm],
              ['heightMm', 'Height mm', heightMm, setHeightMm],
              ['depthMm', 'Depth mm', depthMm, setDepthMm],
              ['wallMm', 'Wall mm', wallMm, setWallMm],
              ['backMm', 'Back mm', backMm, setBackMm],
            ] as const).map(([key, label, value, setter]) => (
              <label key={key} className={key === 'backMm' ? 'col-span-2' : ''}>
                <span className="mb-1 block text-[10px] text-slate-500">{label}</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={value}
                  onChange={(event) => setter(Math.max(0.5, Number(event.target.value) || 0.5))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-500">
            The exported mesh has a solid back, perimeter wall and recessed cavity. It is suitable as a starting light-box or wall-art shell. Cable exits, lettering and mounting features remain separate modelling operations.
          </div>

          <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Printer fit</div>
          <div className={`mt-2 rounded p-2 text-xs ${splitPlan.required ? 'bg-amber-950/60 text-amber-200' : 'bg-emerald-950/50 text-emerald-300'}`}>
            {splitPlan.required ? (
              <>
                Oversized for {printer.name}. Suggested split: {splitPlan.estimatedPartCount} parts.
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

          <div className="mt-4 text-[11px] text-slate-500">
            Mesh: {mesh.triangles.length} triangles · {mesh.bounds.size.x.toFixed(1)} × {mesh.bounds.size.y.toFixed(1)} × {mesh.bounds.size.z.toFixed(1)} mm
          </div>
        </aside>
      </div>
    </div>
  );
}
