import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { createStlAsset, deleteStlAsset, updateStlAssetTransform } from '../db/repository';
import type { StlAsset } from '../db/schema';
import type { PrinterProfile } from '../lib/printers/profiles';
import { createSplitPlan } from '../lib/printers/splitPlanner';
import {
  exportBinaryStl,
  parseStlFile,
  transformMesh,
  type MeshTransform,
  type StlMesh,
  type Vec3,
} from '../lib/stl/stl';

interface StlStudioProps {
  projectId: string;
  printer: PrinterProfile;
  onClose: () => void;
}

const DEFAULT_TRANSFORM: MeshTransform = {
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  rotateXDeg: 0,
  rotateYDeg: 0,
  rotateZDeg: 0,
};

function rotateForView(point: Vec3, pitchDeg: number, yawDeg: number): Vec3 {
  let { x, y, z } = point;
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;

  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  [x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY];

  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];

  return { x, y, z };
}

export default function StlStudio({ projectId, printer, onClose }: StlStudioProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const saveTransformTimerRef = useRef<number | null>(null);

  const [mesh, setMesh] = useState<StlMesh | null>(null);
  const [transform, setTransform] = useState<MeshTransform>(DEFAULT_TRANSFORM);
  const [pitch, setPitch] = useState(-25);
  const [yaw, setYaw] = useState(35);
  const [status, setStatus] = useState('Import an STL to inspect and transform it.');
  const [loading, setLoading] = useState(false);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const assets = useLiveQuery(
    () => db.stlAssets.where({ projectId }).sortBy('updatedAt'),
    [projectId],
  );

  const transformed = useMemo(
    () => (mesh ? transformMesh(mesh, transform) : null),
    [mesh, transform],
  );
  const splitPlan = transformed
    ? createSplitPlan(
        {
          x: transformed.bounds.size.x,
          y: transformed.bounds.size.y,
          z: transformed.bounds.size.z,
        },
        printer,
      )
    : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(280, rect.height);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!transformed || transformed.triangles.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No STL loaded', width / 2, height / 2);
      return;
    }

    const center = {
      x: (transformed.bounds.min.x + transformed.bounds.max.x) / 2,
      y: (transformed.bounds.min.y + transformed.bounds.max.y) / 2,
      z: (transformed.bounds.min.z + transformed.bounds.max.z) / 2,
    };
    const projectedBounds = transformed.bounds.size;
    const largest = Math.max(projectedBounds.x, projectedBounds.y, projectedBounds.z, 1);
    const scale = (Math.min(width, height) * 0.78) / largest;

    const project = (point: Vec3) => {
      const local = {
        x: point.x - center.x,
        y: point.y - center.y,
        z: point.z - center.z,
      };
      const rotated = rotateForView(local, pitch, yaw);
      return {
        x: width / 2 + rotated.x * scale,
        y: height / 2 - rotated.y * scale,
        depth: rotated.z,
      };
    };

    const stride = Math.max(1, Math.ceil(transformed.triangles.length / 12000));
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.68;

    for (let index = 0; index < transformed.triangles.length; index += stride) {
      const triangle = transformed.triangles[index];
      const a = project(triangle.a);
      const b = project(triangle.b);
      const c = project(triangle.c);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${transformed.triangles.length.toLocaleString()} triangles`, 12, height - 12);
  }, [transformed, pitch, yaw]);

  async function importFile(file: File) {
    setLoading(true);
    setStatus('Reading STL…');
    try {
      const parsed = await parseStlFile(file);
      const asset = await createStlAsset(projectId, file);
      setActiveAssetId(asset.id);
      setMesh(parsed);
      setTransform(DEFAULT_TRANSFORM);
      setPitch(-25);
      setYaw(35);
      setStatus(`Saved ${parsed.name} to this project · ${parsed.triangles.length.toLocaleString()} triangles`);
    } catch (error) {
      setMesh(null);
      setStatus(error instanceof Error ? error.message : 'Could not read this STL.');
    } finally {
      setLoading(false);
    }
  }

  async function openAsset(asset: StlAsset) {
    setLoading(true);
    setStatus(`Opening ${asset.name}…`);
    try {
      const file = new File([asset.sourceFile], `${asset.name}.stl`, { type: 'model/stl' });
      const parsed = await parseStlFile(file);
      setActiveAssetId(asset.id);
      setMesh(parsed);
      setTransform(asset.transform);
      setPitch(-25);
      setYaw(35);
      setStatus(`Opened ${asset.name} · saved in this project`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not reopen this STL.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAssetId || !mesh) return;
    if (saveTransformTimerRef.current) window.clearTimeout(saveTransformTimerRef.current);
    saveTransformTimerRef.current = window.setTimeout(() => {
      void updateStlAssetTransform(activeAssetId, transform)
        .then(() => setStatus(`Saved edits for ${mesh.name}`))
        .catch((error) => setStatus(error instanceof Error ? error.message : 'Could not save STL edits.'));
    }, 650);
    return () => {
      if (saveTransformTimerRef.current) window.clearTimeout(saveTransformTimerRef.current);
    };
  }, [activeAssetId, mesh, transform]);

  function setView(name: 'top' | 'front' | 'side' | 'iso') {
    if (name === 'top') {
      setPitch(-90);
      setYaw(0);
    } else if (name === 'front') {
      setPitch(0);
      setYaw(0);
    } else if (name === 'side') {
      setPitch(0);
      setYaw(90);
    } else {
      setPitch(-25);
      setYaw(35);
    }
  }

  function beginDrag(event: PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragView(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setYaw((value) => value + dx * 0.5);
    setPitch((value) => Math.max(-90, Math.min(90, value - dy * 0.5)));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function exportModel() {
    if (!transformed) return;
    const file = exportBinaryStl(transformed, `${transformed.name}-edited.stl`);
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
          <h2 className="text-sm font-semibold">STL Studio</h2>
          <p className="text-[11px] text-slate-500">Real STL parsing, measurement, transform and binary STL export</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".stl,model/stl,application/sla"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = '';
            }}
          />
          <button
            disabled={loading}
            onClick={() => fileRef.current?.click()}
            className="rounded bg-sky-700 px-3 py-1.5 text-xs hover:bg-sky-600 disabled:opacity-50"
          >
            Import STL
          </button>
          <button
            disabled={!transformed}
            onClick={exportModel}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600 disabled:opacity-40"
          >
            Export edited STL
          </button>
          <button onClick={onClose} className="rounded bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700">
            Close
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-[320px] flex-1">
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={beginDrag}
            onPointerMove={dragView}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <div className="absolute left-3 top-3 flex gap-1">
            {(['top', 'front', 'side', 'iso'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setView(view)}
                className="rounded bg-slate-900/90 px-2 py-1 text-[11px] capitalize hover:bg-slate-800"
              >
                {view}
              </button>
            ))}
          </div>
          <div className="absolute bottom-3 left-3 rounded bg-slate-900/90 px-2 py-1 text-[11px] text-slate-400">
            Drag to rotate view · transforms are separate from camera view
          </div>
        </section>

        <aside className="w-full overflow-y-auto border-t border-slate-800 bg-slate-900/80 p-3 lg:w-80 lg:border-l lg:border-t-0">
          <div className="rounded bg-slate-950 p-2 text-xs text-slate-400">{status}</div>

          <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Project STL files</div>
          <div className="mt-2 grid gap-1">
            {(assets ?? []).length === 0 && <p className="text-[11px] text-slate-500">No saved STL files yet.</p>}
            {[...(assets ?? [])].reverse().map((asset) => (
              <div key={asset.id} className={`flex items-center gap-1 rounded border p-1 ${activeAssetId === asset.id ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800 bg-slate-950'}`}>
                <button
                  className="min-w-0 flex-1 truncate px-1 py-1 text-left text-xs hover:text-sky-300"
                  onClick={() => void openAsset(asset)}
                >
                  {asset.name}
                </button>
                <button
                  className="px-1.5 py-1 text-[10px] text-red-400 hover:text-red-300"
                  onClick={() => {
                    if (!window.confirm(`Delete saved STL "${asset.name}" from this project?`)) return;
                    void deleteStlAsset(asset.id).then(() => {
                      if (activeAssetId === asset.id) {
                        setActiveAssetId(null);
                        setMesh(null);
                        setTransform(DEFAULT_TRANSFORM);
                        setStatus('STL removed from project.');
                      }
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          {transformed && (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Measured bounds</div>
              <div className="mt-2 rounded bg-slate-950 p-2 text-xs">
                X {transformed.bounds.size.x.toFixed(2)} mm<br />
                Y {transformed.bounds.size.y.toFixed(2)} mm<br />
                Z {transformed.bounds.size.z.toFixed(2)} mm
              </div>

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scale</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['scaleX', 'scaleY', 'scaleZ'] as const).map((key, index) => (
                  <label key={key} className="text-[10px] text-slate-500">
                    {['X', 'Y', 'Z'][index]}
                    <input
                      type="number"
                      min="0.01"
                      step="0.05"
                      value={transform[key]}
                      onChange={(event) =>
                        setTransform({ ...transform, [key]: Math.max(0.01, Number(event.target.value) || 0.01) })
                      }
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                    />
                  </label>
                ))}
              </div>
              <button
                className="mt-2 w-full rounded bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-700"
                onClick={() => {
                  const longest = Math.max(mesh?.bounds.size.x ?? 1, mesh?.bounds.size.y ?? 1, mesh?.bounds.size.z ?? 1);
                  const target = Math.min(printer.buildVolumeMm.x, printer.buildVolumeMm.y, printer.buildVolumeMm.z) * 0.9;
                  const factor = target / Math.max(longest, 0.001);
                  setTransform({ ...transform, scaleX: factor, scaleY: factor, scaleZ: factor });
                }}
              >
                Fit uniformly to {printer.name}
              </button>

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Model rotation</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['rotateXDeg', 'rotateYDeg', 'rotateZDeg'] as const).map((key, index) => (
                  <label key={key} className="text-[10px] text-slate-500">
                    {['X°', 'Y°', 'Z°'][index]}
                    <input
                      type="number"
                      step="1"
                      value={transform[key]}
                      onChange={(event) => setTransform({ ...transform, [key]: Number(event.target.value) || 0 })}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Printer fit</div>
              <div className={`mt-2 rounded p-2 text-xs ${splitPlan?.required ? 'bg-amber-950/60 text-amber-200' : 'bg-emerald-950/50 text-emerald-300'}`}>
                {splitPlan?.required ? (
                  <>
                    Too large for {printer.name}. Estimated split requirement: {splitPlan.estimatedPartCount} parts.
                    {splitPlan.axes.map((axis) => (
                      <div key={axis.axis} className="mt-1">
                        {axis.axis.toUpperCase()}: {axis.partCount} sections ≈ {axis.targetPartSizeMm.toFixed(1)} mm each
                      </div>
                    ))}
                  </>
                ) : (
                  <>Fits {printer.name} build volume.</>
                )}
              </div>

              <p className="mt-4 text-[11px] text-slate-500">
                Split planning is dimensional at this stage. Physical mesh cutting and join generation stay disabled until those geometry operations are validated.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
