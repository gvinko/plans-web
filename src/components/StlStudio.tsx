import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { createStlAsset, deleteStlAsset, updateStlAssetTransform } from '../db/repository';
import type { StlAsset } from '../db/schema';
import type { PrinterProfile } from '../lib/printers/profiles';
import { createSplitPlan } from '../lib/printers/splitPlanner';
import { stlSplitSourceKey } from '../lib/printers/splitSourceKey';
import { splitMeshForPrinter, type PrintablePart } from '../lib/printers/meshSplitter';
import { createStoredZip } from '../lib/export/zip';
import {
  exportBinaryStl,
  isValidMeshTransform,
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

interface TransformNumberInputProps {
  value: number;
  min?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}
function TransformNumberInput({ value, min, disabled, onCommit }: TransformNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const trimmed = draft.trim();
    const parsed = Number(trimmed);
    if (trimmed && Number.isFinite(parsed) && Math.abs(parsed) <= 1_000_000 && (min === undefined || parsed >= min)) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
  };
  return <input
    type="text" inputMode="decimal" disabled={disabled} value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-50"
  />;
}

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
  const pendingTransformRef = useRef<{ assetId: string; value: MeshTransform } | null>(null);
  // All writes are serialized to prevent stale edits overwriting newer ones.
  const transformWritesRef = useRef<Promise<void>>(Promise.resolve());
  const outstandingWritesRef = useRef(0);

  const [mesh, setMesh] = useState<StlMesh | null>(null);
  const [transform, setTransform] = useState<MeshTransform>(DEFAULT_TRANSFORM);
  const [pitch, setPitch] = useState(-25);
  const [yaw, setYaw] = useState(35);
  const [status, setStatus] = useState('Import an STL to inspect and transform it.');
  const [loading, setLoading] = useState(false);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [splitParts, setSplitParts] = useState<PrintablePart[]>([]);
  const activeAssetIdRef = useRef(activeAssetId);
  activeAssetIdRef.current = activeAssetId;
  const geometryKey = stlSplitSourceKey(activeAssetId, transform, printer);
  const geometryKeyRef = useRef(geometryKey);
  geometryKeyRef.current = geometryKey;
  const assets = useLiveQuery(
    () => db.stlAssets.where({ projectId }).sortBy('updatedAt'),
    [projectId],
  );

  const transformed = useMemo(
    () => (mesh ? transformMesh(mesh, transform) : null),
    [mesh, transform],
  );
  useEffect(() => {
    setSplitParts([]);
  }, [mesh, transform, printer]);

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
      await flushPendingTransform();
      const parsed = await parseStlFile(file);
      const asset = await createStlAsset(projectId, file);
      setActiveAssetId(asset.id);
      setMesh(parsed);
      setTransform(DEFAULT_TRANSFORM);
      setPitch(-25);
      setYaw(35);
      setStatus(`Saved ${parsed.name} to this project · ${parsed.triangles.length.toLocaleString()} triangles`);
    } catch (error) {
      // Preserve the previous mesh if the save or import fails.
      setStatus(error instanceof Error ? error.message : 'Could not read this STL.');
    } finally {
      setLoading(false);
    }
  }

  async function openAsset(asset: StlAsset) {
    setLoading(true);
    setStatus(`Opening ${asset.name}…`);
    try {
      await flushPendingTransform();
      const file = new File([asset.sourceFile], `${asset.name}.stl`, { type: 'model/stl' });
      const parsed = await parseStlFile(file);
      if (!isValidMeshTransform(asset.transform)) throw new Error('Saved STL transform is invalid. Restore or re-import this model.');
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

  async function flushPendingTransform(): Promise<void> {
    if (saveTransformTimerRef.current !== null) {
      window.clearTimeout(saveTransformTimerRef.current);
      saveTransformTimerRef.current = null;
    }
    const pending = pendingTransformRef.current;
    if (!pending) {
      await transformWritesRef.current;
      return;
    }
    pendingTransformRef.current = null;
    outstandingWritesRef.current += 1;
    const nextWrite = transformWritesRef.current
      .catch(() => undefined)
      .then(() => updateStlAssetTransform(pending.assetId, pending.value))
      .catch((error) => {
        if (!pendingTransformRef.current) pendingTransformRef.current = pending;
        throw error;
      })
      .finally(() => { outstandingWritesRef.current -= 1; });
    transformWritesRef.current = nextWrite;
    await nextWrite;
  }

  useEffect(() => {
    if (!activeAssetId || !mesh) return;
    const assetId = activeAssetId;
    const name = mesh.name;
    pendingTransformRef.current = { assetId, value: { ...transform } };
    if (saveTransformTimerRef.current !== null) window.clearTimeout(saveTransformTimerRef.current);
    saveTransformTimerRef.current = window.setTimeout(() => {
      void flushPendingTransform()
        .then(() => {
          if (activeAssetIdRef.current === assetId) setStatus(`Saved edits for ${name}`);
        })
        .catch((error) => setStatus(error instanceof Error ? error.message : 'Could not save STL edits.'));
    }, 650);
    return () => {
      if (saveTransformTimerRef.current !== null) window.clearTimeout(saveTransformTimerRef.current);
      saveTransformTimerRef.current = null;
    };
  }, [activeAssetId, mesh, transform]);

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (pendingTransformRef.current || outstandingWritesRef.current > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    return () => window.removeEventListener('beforeunload', warnIfUnsaved);
  }, []);

  useEffect(() => () => {
    // Last-resort unmount flush; the Close button waits for persistence.
    void flushPendingTransform().catch((error) => console.error('STL transform save failed on unmount', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function closeStudio() {
    try {
      await flushPendingTransform();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'STL edits were not saved. Keep the studio open and retry.');
    }
  }

  function changeTransform(key: keyof MeshTransform, value: number) {
    const next = { ...transform, [key]: value };
    if (!isValidMeshTransform(next)) {
      setStatus('Invalid rotation or scale; value was not applied.');
      return;
    }
    if (activeAssetId) pendingTransformRef.current = { assetId: activeAssetId, value: next };
    setTransform(next);
  }

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

  function download(file: Blob, filename: string) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportModel() {
    if (!transformed) return;
    try {
      const file = exportBinaryStl(transformed, `${transformed.name}-edited.stl`);
      download(file, file.name);
      setStatus(`Exported ${file.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not safely export this STL.');
    }
  }

  async function generatePrintableParts() {
    if (!transformed || !splitPlan?.required) return;
    setLoading(true);
    setSplitParts([]);
    setStatus('Generating separate closed STL solids…');
    // Ignore split results if the current model/printer changes during the animation frame.
    const sourceKey = geometryKeyRef.current;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      if (geometryKeyRef.current !== sourceKey) return;
      const result = splitMeshForPrinter(transformed, printer);
      if (geometryKeyRef.current !== sourceKey) return;
      setSplitParts(result.parts);
      setStatus(`${result.parts.length} printable parts created and topology-checked. Download each STL below.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not safely split this STL.');
    } finally {
      setLoading(false);
    }
  }

  function downloadPart(part: PrintablePart) {
    try {
      const file = exportBinaryStl(part.mesh, part.mesh.name + '.stl');
      download(file, file.name);
      setStatus(`Exported ${file.name}. Part has no assembly connectors yet.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not safely export this part.');
    }
  }

  function assemblyManifest() {
    if (!transformed) throw new Error('No model is loaded.');
    return {
      model: transformed.name,
      units: 'mm',
      printer: printer.name,
      warning: 'Alignment pins, connectors and clips are NOT included. Validate and orient each part in your slicer.',
      parts: splitParts.map((part) => ({
        filename: part.mesh.name + '.stl',
        number: part.partNumber,
        sizeMm: part.mesh.bounds.size,
        assemblyOffsetMm: part.assemblyOffsetMm,
      })),
    };
  }

  function exportAssemblyManifest() {
    if (!transformed || splitParts.length === 0) return;
    const json = JSON.stringify(assemblyManifest(), null, 2);
    const file = new Blob([json], { type: 'application/json' });
    download(file, transformed.name.replace(/[^a-z0-9._-]+/gi, '-') + '-assembly.json');
    setStatus('Exported assembly offsets. Joinery has not been generated.');
  }

  async function downloadPartPackage() {
    if (!transformed || splitParts.length === 0 || loading) return;
    setLoading(true);
    setStatus('Packaging STLs and assembly guide into one ZIP…');
    try {
      const manifest = assemblyManifest();
      const parts = splitParts.map((part) => {
        const file = exportBinaryStl(part.mesh, part.mesh.name + '.stl');
        return { name: file.name, data: file };
      });
      const guide = [
        'PLANS TO PRINT - SPLIT STL PACKAGE',
        'Model: ' + transformed.name,
        'Printer: ' + printer.name,
        'Units: millimetres',
        '',
        'Each part STL uses a local origin at its bounding-box minimum.',
        'Open assembly.json for each part position in the original assembly.',
        'Import each STL into your slicer and check bed fit, layer preview and orientation.',
        'THIS PACKAGE DOES NOT CONTAIN PINS, SOCKETS, CLIPS OR OTHER CONNECTORS.',
        'Unsupported/complex cut geometries are blocked earlier, not silently exported.',
        '',
      ].join('\n');
      const archive = await createStoredZip([
        ...parts,
        { name: 'assembly.json', data: JSON.stringify(manifest, null, 2) },
        { name: 'READ-ME.txt', data: guide },
      ]);
      const filename = transformed.name.replace(/[^a-z0-9._-]+/gi, '-') + '-split-parts.zip';
      download(archive, filename);
      setStatus('Downloaded ' + splitParts.length + ' STL parts, the assembly manifest and instructions as one ZIP.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not make the ZIP package.');
    } finally {
      setLoading(false);
    }
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
            disabled={!transformed || loading}
            onClick={exportModel}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600 disabled:opacity-40"
          >
            Export edited STL
          </button>
          <button onClick={() => void closeStudio()} className="rounded bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700">
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
                  className="min-w-0 flex-1 truncate px-1 py-1 text-left text-xs hover:text-sky-300 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => void openAsset(asset)}
                >
                  {asset.name}
                </button>
                <button
                  className="px-1.5 py-1 text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => {
                    if (!window.confirm(`Delete saved STL "${asset.name}" from this project?`)) return;
                    void (async () => {
                      try {
                        if (activeAssetId === asset.id) await flushPendingTransform();
                        await deleteStlAsset(asset.id);
                        if (activeAssetId === asset.id) {
                          setActiveAssetId(null);
                          setMesh(null);
                          setTransform(DEFAULT_TRANSFORM);
                          setStatus('STL removed from project.');
                        }
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : 'Could not delete this STL.');
                      }
                    })();
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

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scale (original model axes)</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['scaleX', 'scaleY', 'scaleZ'] as const).map((key, index) => (
                  <label key={key} className="text-[10px] text-slate-500">
                    {['X', 'Y', 'Z'][index]}
                    <TransformNumberInput value={transform[key]} min={0.01} disabled={loading}
                      onCommit={(value) => changeTransform(key, value)} />
                  </label>
                ))}
              </div>
              <button
                disabled={loading}
                className="mt-2 w-full rounded bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
                onClick={() => {
                  if (!transformed) return;
                  // Respect each X/Y/Z travel limit and the model's CURRENT rotation and scale.
                  // Uniform fit should not unexpectedly enlarge smaller printable models.
                  const factor = Math.min(
                    1,
                    ...(['x', 'y', 'z'] as const).map((axis) =>
                      (printer.buildVolumeMm[axis] - 4) / Math.max(0.001, transformed.bounds.size[axis])),
                  );
                  if (factor >= 1) {
                    setStatus('Model already fits the printer with a 2 mm safety margin on each side.');
                  } else if (factor > 0 && Number.isFinite(factor)) {
                    setTransform({
                      ...transform,
                      scaleX: transform.scaleX * factor,
                      scaleY: transform.scaleY * factor,
                      scaleZ: transform.scaleZ * factor,
                    });
                    setStatus('Scaled all axes uniformly to fit the selected printer.');
                  } else {
                    setStatus('Selected printer has invalid build-volume dimensions.');
                  }
                }}
              >
                Scale down to fit {printer.name}
              </button>

              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Model rotation</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['rotateXDeg', 'rotateYDeg', 'rotateZDeg'] as const).map((key, index) => (
                  <label key={key} className="text-[10px] text-slate-500">
                    {['X°', 'Y°', 'Z°'][index]}
                    <TransformNumberInput value={transform[key]} disabled={loading}
                      onCommit={(value) => changeTransform(key, value)} />
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

              {splitPlan?.required && (
                <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void generatePrintableParts()}
                    className="w-full rounded bg-violet-700 px-2 py-2 text-xs font-semibold hover:bg-violet-600 disabled:opacity-50"
                  >
                    {loading ? 'Checking mesh and cutting…' : 'Generate actual split STL parts'}
                  </button>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Safe mode: closed, consistently oriented STL meshes with one convex contour per cut.
                    Up to 12 parts and 60,000 source triangles. Unsupported shapes are rejected without export.
                    Printed parts do not include locating pins, clips, or sockets yet.
                  </p>
                  {splitParts.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-medium text-emerald-300">
                        {splitParts.length} closed parts ready for individual download
                      </div>
                      {splitParts.map((part) => (
                        <div key={part.partNumber} className="flex items-center justify-between gap-2 rounded border border-slate-800 p-2">
                          <div className="min-w-0 text-[11px] text-slate-300">
                            Part {part.partNumber}
                            <div className="text-slate-500">
                              {part.mesh.bounds.size.x.toFixed(1)} × {part.mesh.bounds.size.y.toFixed(1)} × {part.mesh.bounds.size.z.toFixed(1)} mm
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadPart(part)}
                            className="shrink-0 rounded bg-emerald-800 px-2 py-1.5 text-xs hover:bg-emerald-700"
                          >
                            Download STL
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void downloadPartPackage()}
                        className="w-full rounded bg-sky-700 px-2 py-2 text-xs font-semibold hover:bg-sky-600 disabled:opacity-50"
                      >
                        Download all {splitParts.length} parts (.zip)
                      </button>
                      <button
                        type="button"
                        onClick={exportAssemblyManifest}
                        className="w-full rounded bg-slate-800 px-2 py-2 text-xs hover:bg-slate-700"
                      >
                        Download assembly offsets (.json)
                      </button>
                    </div>
                  )}
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-500">
                Always inspect sliced layers and print-bed fit before printing. Multi-contour, concave,
                open or damaged STLs need a more advanced cutter; no partial STL downloads are exposed if validation fails.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
