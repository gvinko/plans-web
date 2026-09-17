import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  saveCanvasState,
  setPageScale,
  setBackgroundImage,
  setSketchOverlay,
  setSketchOpacity,
  setIconStyle,
} from '../db/repository';
import { CanvasEngine, type CalibrationPoint, type ToolMode } from '../lib/canvas/CanvasEngine';
import type { IconStyle } from '../lib/catalog/types';
import { loadFloorPlanFile, isSupportedFloorPlanFile } from '../lib/floorplan/loadFloorPlanFile';
import { attachSnapEngine } from '../lib/canvas/snapping';
import { attachComponentPlacement } from '../lib/canvas/componentPlacement';
import { attachDuctDrawing, type DuctToolParams } from '../lib/canvas/ductDrawing';
import { attachWallTracing } from '../lib/canvas/wallTracing';
import {
  attachWallDimensionEdit,
  applyWallLength,
  applyZoneToRoom,
  getTraceVertices,
  rebuildTracedRoom,
  type WallEdgeSelection,
} from '../lib/canvas/wallDimensionEdit';
import { attachZoneSelection, type RoomSelection } from '../lib/canvas/zoneSelection';
import { debounce } from '../lib/debounce';
import { useAppStore } from '../store/appStore';
import CalibrationModal from './CalibrationModal';
import ComponentPalette from './ComponentPalette';
import DuctToolOptions from './DuctToolOptions';
import BomPanel from './BomPanel';
import SketchOverlayControls from './SketchOverlayControls';
import WallDimensionPopover from './WallDimensionPopover';
import ZoneAssignPopover from './ZoneAssignPopover';
import ZonesManagerDialog from './ZonesManagerDialog';
import DuctColorsDialog from './DuctColorsDialog';
import SystemSchedulePanel from './SystemSchedulePanel';
import CompanySettingsDialog from './CompanySettingsDialog';
import ExcelImporterDialog from './ExcelImporterDialog';
import ExportDialog from './ExportDialog';

const DEFAULT_DUCT_PARAMS: DuctToolParams = { widthMm: 400, depthMm: 250, diameterMm: 200, ductFunction: 'supply' };

const TOOLBAR_MODES: ToolMode[] = ['select', 'pan', 'calibrate', 'duct-rigid', 'duct-flex', 'trace-wall'];

export default function CanvasWorkspace() {
  const { activeProjectId, activePlanPageId, activeTool, setActiveTool, setActiveProject } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const sketchObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [zoomPct, setZoomPct] = useState(100);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingCalibration, setPendingCalibration] = useState<{ p1: CalibrationPoint; p2: CalibrationPoint } | null>(
    null,
  );
  const [pendingComponentId, setPendingComponentId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDuctColors, setShowDuctColors] = useState(false);
  const [showZonesManager, setShowZonesManager] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showCompanySettings, setShowCompanySettings] = useState(false);
  const [ductParams, setDuctParams] = useState<DuctToolParams>(DEFAULT_DUCT_PARAMS);
  const [wallEdgeSelection, setWallEdgeSelection] = useState<WallEdgeSelection | null>(null);
  const [wallPopoverScreen, setWallPopoverScreen] = useState<{ x: number; y: number } | null>(null);
  const [roomSelection, setRoomSelection] = useState<RoomSelection | null>(null);

  // Controllers read these via ref so they always see the latest value without re-attaching listeners.
  const pendingComponentIdRef = useRef<string | null>(null);
  const ductParamsRef = useRef<DuctToolParams>(DEFAULT_DUCT_PARAMS);
  const pxPerMmRef = useRef<number | null>(null);
  const iconStyleRef = useRef<IconStyle>('simple');
  const ductColorOverridesRef = useRef<Record<string, string>>({});

  const planPage = useLiveQuery(
    () => (activePlanPageId ? db.planPages.get(activePlanPageId) : undefined),
    [activePlanPageId],
  );
  const project = useLiveQuery(() => (activeProjectId ? db.projects.get(activeProjectId) : undefined), [activeProjectId]);

  useEffect(() => {
    pendingComponentIdRef.current = pendingComponentId;
  }, [pendingComponentId]);

  useEffect(() => {
    ductParamsRef.current = ductParams;
  }, [ductParams]);

  useEffect(() => {
    pxPerMmRef.current = planPage?.scale.pxPerMm ?? null;
  }, [planPage?.scale.pxPerMm]);

  useEffect(() => {
    iconStyleRef.current = project?.iconStyle ?? 'simple';
  }, [project?.iconStyle]);

  useEffect(() => {
    ductColorOverridesRef.current = project?.ductColorOverrides ?? {};
  }, [project?.ductColorOverrides]);

  // --- engine + controllers: created once, disposed on unmount ---
  useEffect(() => {
    if (!canvasElRef.current) return;
    const engine = new CanvasEngine(canvasElRef.current, {
      onCalibrationPoints: (p1, p2) => setPendingCalibration({ p1, p2 }),
      onZoomChange: (zoom) => setZoomPct(Math.round(zoom * 100)),
      onToolShortcut: (mode) => handleToolChange(mode),
    });
    engineRef.current = engine;

    const detachSnap = attachSnapEngine(engine.canvas);
    const detachPlacement = attachComponentPlacement(
      engine,
      () => pendingComponentIdRef.current,
      () => iconStyleRef.current,
      () => {
        setPendingComponentId(null);
        setActiveTool('select');
        engine.setToolMode('select');
      },
    );
    const detachDuctDrawing = attachDuctDrawing(
      engine,
      () => pxPerMmRef.current,
      () => ductParamsRef.current,
      () => ductColorOverridesRef.current,
      () => {},
    );
    const detachWallTracing = attachWallTracing(engine, () => pxPerMmRef.current, () => handleToolChange('select'));
    const detachWallDimensionEdit = attachWallDimensionEdit(engine, (sel) => {
      const vpt = engine.canvas.viewportTransform;
      setWallEdgeSelection(sel);
      setWallPopoverScreen({
        x: sel.midpointCanvas.x * vpt[0] + vpt[4],
        y: sel.midpointCanvas.y * vpt[3] + vpt[5],
      });
    });
    const detachZoneSelection = attachZoneSelection(engine.canvas, setRoomSelection);

    return () => {
      detachSnap();
      detachPlacement();
      detachDuctDrawing();
      detachWallTracing();
      detachWallDimensionEdit();
      detachZoneSelection();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- keep canvas sized to its container ---
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      engineRef.current?.resize(width, height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- load this page's saved canvas / background / sketch exactly once when it becomes active ---
  useEffect(() => {
    if (!activePlanPageId) return;
    let cancelled = false;
    (async () => {
      const page = await db.planPages.get(activePlanPageId);
      const engine = engineRef.current;
      if (!page || !engine || cancelled) return;

      if (page.canvasJSON) {
        await engine.loadFromJSON(page.canvasJSON);
        return;
      }
      if (page.backgroundImage) {
        const url = URL.createObjectURL(page.backgroundImage);
        backgroundObjectUrlRef.current = url;
        await engine.loadBackgroundImage(url, page.backgroundImageWidthPx, page.backgroundImageHeightPx);
      }
      if (page.sketchImage) {
        const url = URL.createObjectURL(page.sketchImage);
        sketchObjectUrlRef.current = url;
        await engine.loadSketchOverlay(url, page.sketchWidthPx, page.sketchHeightPx, page.sketchOpacity);
      }
    })();
    return () => {
      cancelled = true;
      [backgroundObjectUrlRef, sketchObjectUrlRef].forEach((ref) => {
        if (ref.current) {
          URL.revokeObjectURL(ref.current);
          ref.current = null;
        }
      });
    };
  }, [activePlanPageId]);

  // --- autosave canvas state on any change ---
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !activePlanPageId) return;
    const persist = debounce(() => {
      saveCanvasState(activePlanPageId, JSON.stringify(engine.canvas.toObject(['plandroid', 'plandroidId'])));
    }, 600);
    engine.canvas.on('object:added', persist);
    engine.canvas.on('object:modified', persist);
    engine.canvas.on('object:removed', persist);
    return () => {
      engine.canvas.off('object:added', persist);
      engine.canvas.off('object:modified', persist);
      engine.canvas.off('object:removed', persist);
    };
  }, [activePlanPageId]);

  async function handleFileLoad(file: File) {
    if (!activePlanPageId || !engineRef.current) return;
    if (!isSupportedFloorPlanFile(file)) {
      setLoadError(`Unsupported file type: ${file.name}`);
      return;
    }
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const { blob, widthPx, heightPx } = await loadFloorPlanFile(file);
      await setBackgroundImage(activePlanPageId, blob, widthPx, heightPx);

      if (backgroundObjectUrlRef.current) URL.revokeObjectURL(backgroundObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      backgroundObjectUrlRef.current = url;

      engineRef.current.canvas.clear();
      await engineRef.current.loadBackgroundImage(url, widthPx, heightPx);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load floor plan');
    } finally {
      setIsLoadingFile(false);
    }
  }

  async function handleSketchUpload(file: File) {
    if (!activePlanPageId || !engineRef.current) return;
    try {
      const { blob, widthPx, heightPx } = await loadFloorPlanFile(file);
      await setSketchOverlay(activePlanPageId, blob, widthPx, heightPx);
      if (sketchObjectUrlRef.current) URL.revokeObjectURL(sketchObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      sketchObjectUrlRef.current = url;
      await engineRef.current.loadSketchOverlay(url, widthPx, heightPx, 0.35);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load sketch');
    }
  }

  async function handleSketchOpacityChange(opacity: number) {
    if (!activePlanPageId) return;
    engineRef.current?.setSketchOpacity(opacity);
    await setSketchOpacity(activePlanPageId, opacity);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileLoad(file);
  }

  function handleToolChange(mode: ToolMode) {
    setActiveTool(mode);
    engineRef.current?.setToolMode(mode);
    if (mode !== 'place-component') setPendingComponentId(null);
  }

  function handleSelectComponent(componentId: string) {
    setPendingComponentId(componentId);
    handleToolChange('place-component');
  }

  async function handleToggleIconStyle() {
    if (!activeProjectId || !project) return;
    await setIconStyle(activeProjectId, project.iconStyle === 'professional' ? 'simple' : 'professional');
  }

  async function handleCalibrationConfirm(mm: number) {
    if (!pendingCalibration || !activePlanPageId || !engineRef.current) return;
    await setPageScale(activePlanPageId, [pendingCalibration.p1, pendingCalibration.p2], mm);
    engineRef.current.applyCalibrationLabel(mm);
    setPendingCalibration(null);
    handleToolChange('select');
  }

  function handleCalibrationCancel() {
    engineRef.current?.cancelCalibrationDraft();
    setPendingCalibration(null);
  }

  async function handleWallDimensionConfirm(mm: number) {
    if (!wallEdgeSelection || !engineRef.current || !activePlanPageId) return;
    const engine = engineRef.current;
    const pxPerMm = pxPerMmRef.current;

    if (!pxPerMm) {
      // No scale established yet — this wall's current (rough) pixel length now defines it.
      await setPageScale(activePlanPageId, [wallEdgeSelection.p1, wallEdgeSelection.p2], mm);
    } else {
      const vertices = getTraceVertices(engine.canvas, wallEdgeSelection.objId);
      if (vertices) {
        const newVertices = applyWallLength(vertices, wallEdgeSelection.edgeIndex, mm * pxPerMm);
        rebuildTracedRoom(engine.canvas, wallEdgeSelection.objId, newVertices, pxPerMm);
      }
    }
    setWallEdgeSelection(null);
    setWallPopoverScreen(null);
  }

  function handleAssignZone(zoneId: string | null, color: string | null) {
    if (!roomSelection || !engineRef.current) return;
    applyZoneToRoom(engineRef.current.canvas, roomSelection.objId, zoneId && color ? { id: zoneId, color } : null, pxPerMmRef.current);
    setRoomSelection(null);
  }

  const scalePxPerMm = planPage?.scale.pxPerMm ?? null;
  const isDuctTool = activeTool === 'duct-rigid' || activeTool === 'duct-flex';

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 flex-wrap">
        <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setActiveProject(null)}>
          ← Projects
        </button>
        <div className="flex items-center gap-1 ml-2">
          {TOOLBAR_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => handleToolChange(mode)}
              className={`text-xs px-2.5 py-1 rounded capitalize ${
                activeTool === mode ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {mode.replace('-', ' ')}
            </button>
          ))}
        </div>
        <button
          onClick={() => engineRef.current?.undo()}
          title="Undo last add (Ctrl+Z)"
          className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700"
        >
          Undo
        </button>
        <button
          onClick={() => engineRef.current?.duplicateSelection()}
          title="Duplicate selection (Ctrl+C then Ctrl+V also works)"
          className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700"
        >
          Copy
        </button>
        <button
          className={`text-xs px-2.5 py-1 rounded ${showPalette ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'}`}
          onClick={() => setShowPalette((v) => !v)}
        >
          Components
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowBom(true)}>
          BOM &amp; Costing
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowSchedule(true)}>
          Schedule
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowDuctColors(true)}>
          Duct Colours
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowZonesManager(true)}>
          Zones
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowImporter(true)}>
          Import Catalog
        </button>
        <button
          className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700"
          onClick={handleToggleIconStyle}
          title="Switch between simple schematic icons and closer-to-standard MEP drafting symbols"
        >
          Icons: {project?.iconStyle === 'professional' ? 'Professional' : 'Simple'}
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowCompanySettings(true)}>
          Company Info
        </button>
        <button className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={() => setShowExport(true)}>
          Export PDF
        </button>
        <button
          className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload Floor Plan
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileLoad(file);
            e.target.value = '';
          }}
        />
        <div className="flex-1" />
        {isDuctTool && !scalePxPerMm && (
          <span className="text-xs text-amber-400">Calibrate the plan before drawing duct</span>
        )}
        <span className="text-xs font-mono text-slate-400">
          {scalePxPerMm ? `${scalePxPerMm.toFixed(4)} px/mm` : 'Not calibrated'}
        </span>
        <span className="text-xs font-mono text-slate-400">{zoomPct}%</span>
      </header>

      <div className="flex flex-1 min-h-0">
        <div
          ref={containerRef}
          className="relative flex-1 min-w-0"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <canvas ref={canvasElRef} />

          <SketchOverlayControls
            hasSketch={Boolean(planPage?.sketchImage)}
            opacity={planPage?.sketchOpacity ?? 0.35}
            onUpload={handleSketchUpload}
            onOpacityChange={handleSketchOpacityChange}
          />

          {isDuctTool && (
            <DuctToolOptions
              mode={activeTool as 'duct-rigid' | 'duct-flex'}
              widthMm={ductParams.widthMm}
              depthMm={ductParams.depthMm}
              diameterMm={ductParams.diameterMm}
              ductFunction={ductParams.ductFunction}
              onChange={setDuctParams}
            />
          )}

          {wallEdgeSelection && wallPopoverScreen && (
            <WallDimensionPopover
              screenX={wallPopoverScreen.x}
              screenY={wallPopoverScreen.y}
              currentLengthPx={wallEdgeSelection.currentLengthPx}
              pxPerMm={scalePxPerMm}
              onConfirm={handleWallDimensionConfirm}
              onCancel={() => {
                setWallEdgeSelection(null);
                setWallPopoverScreen(null);
              }}
            />
          )}

          {roomSelection && activeProjectId && (
            <ZoneAssignPopover
              projectId={activeProjectId}
              screenX={roomSelection.screenX}
              screenY={roomSelection.screenY}
              currentZoneId={roomSelection.currentZoneId}
              onAssign={handleAssignZone}
            />
          )}

          {isDragOver && (
            <div className="absolute inset-0 bg-sky-600/20 border-2 border-dashed border-sky-400 flex items-center justify-center pointer-events-none">
              <span className="text-sm font-mono">Drop floor plan (PNG / JPG / PDF)</span>
            </div>
          )}

          {isLoadingFile && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-sm font-mono">Loading floor plan…</span>
            </div>
          )}

          {loadError && (
            <div className="absolute bottom-3 left-3 bg-red-900/90 border border-red-600 text-red-100 text-xs px-3 py-2 rounded">
              {loadError}
            </div>
          )}

          {!planPage?.backgroundImage && !planPage?.sketchImage && !isLoadingFile && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm text-slate-500">Drag &amp; drop a floor plan, or click "Upload Floor Plan"</span>
            </div>
          )}
        </div>

        {showPalette && (
          <ComponentPalette
            pendingComponentId={pendingComponentId}
            onSelect={handleSelectComponent}
            onCancel={() => handleToolChange('select')}
          />
        )}
      </div>

      {pendingCalibration && (
        <CalibrationModal onConfirm={handleCalibrationConfirm} onCancel={handleCalibrationCancel} />
      )}

      {showBom && activeProjectId && (
        <BomPanel
          projectId={activeProjectId}
          activePlanPageId={activePlanPageId}
          getLiveCanvasJson={() => engineRef.current?.canvas.toObject(['plandroid', 'plandroidId']) ?? null}
          onClose={() => setShowBom(false)}
        />
      )}

      {showSchedule && activeProjectId && (
        <SystemSchedulePanel
          projectId={activeProjectId}
          getCanvas={() => engineRef.current?.canvas ?? null}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showDuctColors && activeProjectId && (
        <DuctColorsDialog
          projectId={activeProjectId}
          activePlanPageId={activePlanPageId}
          getLiveCanvasJson={() => engineRef.current?.canvas.toObject(['plandroid', 'plandroidId']) ?? null}
          onClose={() => setShowDuctColors(false)}
        />
      )}

      {showZonesManager && activeProjectId && (
        <ZonesManagerDialog projectId={activeProjectId} onClose={() => setShowZonesManager(false)} />
      )}

      {showCompanySettings && <CompanySettingsDialog onClose={() => setShowCompanySettings(false)} />}

      {showImporter && <ExcelImporterDialog onClose={() => setShowImporter(false)} />}

      {showExport && activeProjectId && project && (
        <ExportDialog
          projectId={activeProjectId}
          projectName={project.name}
          designer={project.designer}
          revision={project.revision}
          unitSystem={project.unitSystem}
          pxPerMm={scalePxPerMm}
          activePlanPageId={activePlanPageId}
          getCanvas={() => engineRef.current?.canvas ?? null}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
