import { Canvas, Circle, FabricImage, FabricText, Line, Point, type FabricObject, type TPointerEventInfo, type TPointerEvent } from 'fabric';
import { getPlandroidData, setPlandroidData } from './plandroidData';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const UNDO_STACK_LIMIT = 25;

export type ToolMode = 'select' | 'pan' | 'calibrate' | 'place-component' | 'duct-rigid' | 'duct-flex' | 'trace-wall';

/** Number-key shortcuts, in toolbar order. */
const TOOL_SHORTCUTS: Record<string, ToolMode> = {
  '1': 'select',
  '2': 'pan',
  '3': 'calibrate',
  '4': 'duct-rigid',
  '5': 'duct-flex',
  '6': 'trace-wall',
};

export interface CalibrationPoint {
  x: number;
  y: number;
}

interface CanvasEngineOptions {
  /** Fired after the second calibration click. React owns the "enter real-world length" prompt. */
  onCalibrationPoints: (p1: CalibrationPoint, p2: CalibrationPoint) => void;
  onZoomChange?: (zoom: number) => void;
  /** Fired on a number-key tool shortcut (1–6) — React owns updating its own active-tool state and then calls setToolMode itself, same as a toolbar click. */
  onToolShortcut?: (mode: ToolMode) => void;
}

export class CanvasEngine {
  readonly canvas: Canvas;

  private opts: CanvasEngineOptions;
  private toolMode: ToolMode = 'select';
  private isPanning = false;
  private spaceHeld = false;
  private lastClientX = 0;
  private lastClientY = 0;
  private calibrationPointA: CalibrationPoint | null = null;
  private calibrationDraftObjects: (Circle | Line | FabricText)[] = [];
  private pendingCalibrationLabel: FabricText | null = null;
  private sketchImageObj: FabricImage | null = null;
  private backgroundImageObj: FabricImage | null = null;
  private undoStack: Array<{ type: 'add' | 'delete'; objects: FabricObject[] }> = [];
  private clipboardObject: FabricObject | null = null;

  constructor(el: HTMLCanvasElement, opts: CanvasEngineOptions) {
    this.opts = opts;
    this.canvas = new Canvas(el, {
      selection: true,
      preserveObjectStacking: true,
      fireRightClick: false,
      stopContextMenu: true,
    });
    this.bindPanZoom();
    this.bindKeyboard();
  }

  setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.calibrationPointA = null;
    this.canvas.selection = mode === 'select';
    this.canvas.defaultCursor = mode === 'pan' ? 'grab' : mode === 'select' ? 'default' : 'crosshair';
    this.canvas.requestRenderAll();
  }

  getToolMode(): ToolMode {
    return this.toolMode;
  }

  resize(width: number, height: number): void {
    this.canvas.setDimensions({ width, height });
  }

  async loadBackgroundImage(objectUrl: string, widthPx: number, heightPx: number): Promise<void> {
    const img = await FabricImage.fromURL(objectUrl);
    img.set({ left: 0, top: 0, selectable: false, evented: false, hoverCursor: 'default', plandroid: { kind: 'background-plan' } });
    this.canvas.add(img);
    this.canvas.sendObjectToBack(img);
    this.backgroundImageObj = img;
    this.fitToViewport(widthPx, heightPx);
    this.canvas.requestRenderAll();
  }

  /** Lets the imported drawing be repositioned or resized before marks are added. The normal
   * Select tool deliberately ignores this image, so ducts and symbols remain easy to edit. */
  setBackgroundPlanEditing(enabled: boolean): boolean {
    const image = this.backgroundImageObj ?? this.canvas.getObjects().find((obj) => (obj as FabricObject & { plandroid?: { kind?: string } }).plandroid?.kind === 'background-plan') as FabricImage | undefined;
    if (!image) return false;
    this.backgroundImageObj = image;
    image.set({ selectable: enabled, evented: enabled, lockRotation: true, hasRotatingPoint: false, hoverCursor: enabled ? 'move' : 'default' });
    if (enabled) {
      this.canvas.setActiveObject(image);
      this.canvas.bringObjectToFront(image);
    } else {
      this.canvas.discardActiveObject();
      this.canvas.sendObjectToBack(image);
    }
    this.canvas.requestRenderAll();
    return true;
  }

  /** Low-opacity underlay for tracing over a rough hand sketch — independent of the calibrated backgroundImage. */
  async loadSketchOverlay(objectUrl: string, widthPx: number, heightPx: number, opacity: number): Promise<void> {
    if (this.sketchImageObj) {
      this.canvas.remove(this.sketchImageObj);
      this.sketchImageObj = null;
    }
    const img = await FabricImage.fromURL(objectUrl);
    img.set({ left: 0, top: 0, opacity, selectable: false, evented: false, hoverCursor: 'default', plandroid: { kind: 'sketch-overlay' } });
    this.canvas.add(img);
    this.canvas.sendObjectToBack(img);
    this.sketchImageObj = img;
    this.fitToViewport(widthPx, heightPx);
    this.canvas.requestRenderAll();
  }

  setSketchOpacity(opacity: number): void {
    this.sketchImageObj?.set({ opacity });
    this.canvas.requestRenderAll();
  }

  fitToViewport(contentWidthPx: number, contentHeightPx: number): void {
    const containerW = this.canvas.getWidth();
    const containerH = this.canvas.getHeight();
    if (containerW === 0 || containerH === 0 || contentWidthPx === 0 || contentHeightPx === 0) return;

    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(containerW / contentWidthPx, containerH / contentHeightPx) * 0.92),
    );
    const offsetX = (containerW - contentWidthPx * zoom) / 2;
    const offsetY = (containerH - contentHeightPx * zoom) / 2;
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, offsetX, offsetY]);
    this.opts.onZoomChange?.(zoom);
  }

  /** Called by React once the user confirms the real-world distance for the last calibration draft. */
  applyCalibrationLabel(realWorldMm: number): void {
    if (this.pendingCalibrationLabel) {
      this.pendingCalibrationLabel.set({ text: `${realWorldMm.toLocaleString()} mm` });
    }
    this.calibrationDraftObjects = [];
    this.pendingCalibrationLabel = null;
    this.canvas.requestRenderAll();
  }

  /** Called by React if the user cancels the length prompt — removes the just-drawn draft line/markers. */
  cancelCalibrationDraft(): void {
    this.calibrationDraftObjects.forEach((o) => this.canvas.remove(o));
    this.calibrationDraftObjects = [];
    this.pendingCalibrationLabel = null;
    this.calibrationPointA = null;
    this.canvas.requestRenderAll();
  }

  /** Serialize user drawing objects only. Background/sketch images are persisted separately as
   * IndexedDB blobs, so object URLs must never be written into canvas JSON (they expire on reload). */
  serializeDrawingState(): string {
    const full = this.canvas.toObject(['plandroid', 'plandroidId']) as { objects?: Array<Record<string, unknown>>; [key: string]: unknown };
    const objects = (full.objects ?? []).filter((obj) => {
      const kind = (obj.plandroid as { kind?: string } | undefined)?.kind;
      return kind !== 'background-plan' && kind !== 'sketch-overlay';
    });
    return JSON.stringify({ ...full, objects });
  }

  loadFromJSON(json: string): Promise<void> {
    const parsed = JSON.parse(json) as { objects?: Array<Record<string, unknown>>; [key: string]: unknown };
    // Backward-compatible cleanup for saves made before backgrounds were separated.
    if (Array.isArray(parsed.objects)) {
      parsed.objects = parsed.objects.filter((obj) => {
        const kind = (obj.plandroid as { kind?: string } | undefined)?.kind;
        return kind !== 'background-plan' && kind !== 'sketch-overlay';
      });
    }
    return this.canvas.loadFromJSON(parsed).then(() => {
      this.canvas.requestRenderAll();
      this.undoStack = [];
    });
  }

  /** Registers a set of objects as one undoable action — call this at the moment something is
   * actually committed (a duct segment, a placed component, a completed room trace), never for
   * transient preview/draft objects. One Undo removes the whole group, since a single user action
   * (e.g. a duct segment) is usually more than one Fabric object (the shape + its label + joint dots). */
  recordUndoGroup(objects: FabricObject[]): void {
    const real = objects.filter(Boolean);
    if (real.length === 0) return;
    this.undoStack.push({ type: 'add', objects: real });
    if (this.undoStack.length > UNDO_STACK_LIMIT) this.undoStack.shift();
  }

  /** Record a deletion from toolbar/UI code as well as keyboard delete. */
  deleteSelection(): void {
    const active = [...this.canvas.getActiveObjects()];
    if (!active.length) return;
    this.undoStack.push({ type: 'delete', objects: active });
    if (this.undoStack.length > UNDO_STACK_LIMIT) this.undoStack.shift();
    active.forEach((o) => this.canvas.remove(o));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  /** Removes the most recently recorded undo group — shared by the Ctrl+Z handler and the toolbar Undo button. */
  undo(): void {
    const action = this.undoStack.pop();
    if (action) {
      if (action.type === 'add') action.objects.forEach((o) => this.canvas.remove(o));
      else action.objects.forEach((o) => this.canvas.add(o));
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Copies the current selection into an in-memory clipboard (Ctrl+C, or call directly). */
  copySelection(): void {
    const active = this.canvas.getActiveObject();
    if (active) this.clipboardObject = active;
  }

  /** Pastes whatever's in the clipboard at a small offset (Ctrl+V, or call directly). */
  async pasteClipboard(): Promise<void> {
    if (!this.clipboardObject) return;
    await this.cloneAndAdd(this.clipboardObject);
  }

  /** Copy + paste in one step — used by the toolbar "Duplicate" button. */
  async duplicateSelection(): Promise<void> {
    const active = this.canvas.getActiveObject();
    if (!active) return;
    await this.cloneAndAdd(active);
  }

  /** Keeps a placed item selectable while preventing a duct-routing drag from shifting it. */
  toggleSelectionLock(): void {
    const selected = this.canvas.getActiveObjects();
    if (selected.length === 0) return;
    const shouldLock = selected.some((object) => !object.lockMovementX);
    selected.forEach((object) => {
      object.set({
        lockMovementX: shouldLock,
        lockMovementY: shouldLock,
        lockScalingX: shouldLock,
        lockScalingY: shouldLock,
        lockRotation: shouldLock,
      });
      const data = getPlandroidData(object);
      if (data) setPlandroidData(object, { ...data, plandroidLocked: shouldLock });
      object.setCoords();
    });
    this.canvas.requestRenderAll();
  }

  /** Explicitly locks or unlocks the current selection. */
  setSelectionLocked(locked: boolean): void {
    const selected = this.canvas.getActiveObjects();
    selected.forEach((object) => {
      object.set({
        lockMovementX: locked, lockMovementY: locked,
        lockScalingX: locked, lockScalingY: locked, lockRotation: locked,
      });
      const data = getPlandroidData(object);
      if (data) setPlandroidData(object, { ...data, plandroidLocked: locked });
      object.setCoords();
    });
    this.canvas.requestRenderAll();
  }

  /** Sets opacity for selected drawing objects/components. */
  setSelectionOpacity(opacity: number): void {
    const selected = this.canvas.getActiveObjects();
    selected.forEach((object) => object.set({ opacity: Math.max(0.2, Math.min(1, opacity)) }));
    this.canvas.requestRenderAll();
  }

  /** Darkness is implemented as a practical black overlay amount via opacity.
   * 0 = normal, 100 = strongest/darkest. Works for components and duct alike. */
  setSelectionDarknessLevel(level: number): void {
    const selected = this.canvas.getActiveObjects();
    const opacity = 1 - Math.max(0, Math.min(100, level)) * 0.006;
    selected.forEach((object) => {
      const parts = this.getPaintParts(object);
      parts.forEach((part) => {
        const fill = part.fill;
        const stroke = part.stroke;
        if (typeof fill === 'string' && fill.startsWith('#')) part.set({ fill: this.mixTowardBlack(fill, level / 100) });
        if (typeof stroke === 'string' && stroke.startsWith('#')) part.set({ stroke: this.mixTowardBlack(stroke, level / 100) });
      });
      object.set({ opacity: Math.max(0.55, opacity) });
      object.dirty = true;
    });
    this.canvas.requestRenderAll();
  }

  /** Toggles a darker drafting display for selected placed components. */
  toggleSelectionDarkness(): void {
    const selected = this.canvas.getActiveObjects();
    if (selected.length === 0) return;
    selected.forEach((object) => {
      const data = getPlandroidData(object);
      if (!data || !['equipment', 'fitting', 'terminal'].includes(data.plandroidKind)) return;
      const parts = this.getPaintParts(object);
      const appearance = data.plandroidAppearance;
      if (appearance?.darkened && appearance.originalPaint) {
        const originalPaint = appearance.originalPaint;
        parts.forEach((part, index) => part.set(originalPaint[index] ?? {}));
        setPlandroidData(object, { ...data, plandroidAppearance: { ...appearance, darkened: false } });
      } else {
        const originalPaint = parts.map((part) => ({
          fill: typeof part.fill === 'string' ? part.fill : undefined,
          stroke: typeof part.stroke === 'string' ? part.stroke : undefined,
        }));
        parts.forEach((part) => part.set({
          fill: this.darkenPaint(part.fill),
          stroke: this.darkenPaint(part.stroke),
        }));
        setPlandroidData(object, { ...data, plandroidAppearance: { darkened: true, originalPaint } });
      }
      object.dirty = true;
    });
    this.canvas.requestRenderAll();
  }

  private async cloneAndAdd(source: FabricObject): Promise<void> {
    // clone() only carries standard Fabric properties unless told otherwise — 'plandroid' holds all
    // our port/kind/schedule data, so it must be explicitly requested (same gotcha as toObject/toJSON).
    const clone = await source.clone(['plandroid']);
    clone.set({ left: (source.left ?? 0) + 24, top: (source.top ?? 0) + 24 });
    const data = (clone as unknown as { plandroid?: unknown }).plandroid;
    if (data) {
      // A duplicate is a distinct object — give it a fresh id so BOM/schedule/snap lookups
      // don't collide with the original it was copied from.
      (clone as unknown as { plandroidId: string }).plandroidId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    this.canvas.add(clone);
    this.canvas.setActiveObject(clone);
    this.recordUndoGroup([clone]);
    this.canvas.requestRenderAll();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.canvas.dispose();
  }

  // ---- internal ----

  private bindPanZoom(): void {
    this.canvas.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** e.deltaY;
      zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
      this.canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      this.opts.onZoomChange?.(zoom);
      e.preventDefault();
      e.stopPropagation();
    });

    this.canvas.on('mouse:down', (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;
      const shouldPan = e.button === 1 || (e.button === 0 && (this.spaceHeld || this.toolMode === 'pan'));
      if (shouldPan) {
        this.isPanning = true;
        this.canvas.selection = false;
        this.canvas.defaultCursor = 'grabbing';
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        if (e.button === 1) e.preventDefault();
        return;
      }
      if (this.toolMode === 'calibrate' && e.button === 0) {
        this.handleCalibrationClick(opt);
      }
    });

    this.canvas.on('mouse:move', (opt: TPointerEventInfo<TPointerEvent>) => {
      if (!this.isPanning) return;
      const e = opt.e as MouseEvent;
      const vpt = this.canvas.viewportTransform;
      vpt[4] += e.clientX - this.lastClientX;
      vpt[5] += e.clientY - this.lastClientY;
      this.canvas.requestRenderAll();
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;
    });

    this.canvas.on('mouse:up', () => {
      if (!this.isPanning) return;
      this.isPanning = false;
      this.canvas.setViewportTransform(this.canvas.viewportTransform);
      this.canvas.selection = this.toolMode === 'select';
      this.canvas.defaultCursor = this.toolMode === 'select' ? 'default' : this.spaceHeld ? 'grab' : 'crosshair';
    });
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isTypingTarget(e.target)) return;

    if (e.code === 'Space' && !this.spaceHeld) {
      this.spaceHeld = true;
      this.canvas.defaultCursor = 'grab';
      this.canvas.selection = false;
      e.preventDefault();
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.canvas.getActiveObject()) {
      this.deleteSelection();
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      this.undo();
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      this.copySelection();
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      this.pasteClipboard();
      e.preventDefault();
      return;
    }

    if (e.key.toLowerCase() === 'l' && this.canvas.getActiveObject()) {
      this.toggleSelectionLock();
      e.preventDefault();
      return;
    }

    if (e.key.toLowerCase() === 'd' && this.canvas.getActiveObject()) {
      this.toggleSelectionDarkness();
      e.preventDefault();
      return;
    }

    const shortcutMode = TOOL_SHORTCUTS[e.key];
    if (shortcutMode && this.opts.onToolShortcut) {
      this.opts.onToolShortcut(shortcutMode);
      e.preventDefault();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.spaceHeld = false;
      this.canvas.defaultCursor = this.toolMode === 'select' ? 'default' : 'crosshair';
      this.canvas.selection = this.toolMode === 'select';
    }
  };

  private isTypingTarget(t: EventTarget | null): boolean {
    const tag = (t as HTMLElement)?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  private getPaintParts(object: FabricObject): FabricObject[] {
    const group = object as FabricObject & { getObjects?: () => FabricObject[] };
    return group.getObjects?.() ?? [object];
  }

  private mixTowardBlack(value: string, amount: number): string {
    const raw = value.slice(1);
    const hex = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return value;
    const factor = 1 - Math.max(0, Math.min(1, amount)) * 0.8;
    return '#' + [0, 2, 4].map((o) => Math.round(parseInt(hex.slice(o, o + 2), 16) * factor).toString(16).padStart(2, '0')).join('');
  }

  private darkenPaint(value: unknown): unknown {
    if (typeof value !== 'string' || !value.startsWith('#')) return value;
    const raw = value.slice(1);
    const hex = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return value;
    const darkened = [0, 2, 4]
      .map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * 0.58).toString(16).padStart(2, '0'))
      .join('');
    return `#${darkened}`;
  }

  private handleCalibrationClick(opt: TPointerEventInfo<TPointerEvent>): void {
    const pointer = this.canvas.getPointer(opt.e);
    const p: CalibrationPoint = { x: pointer.x, y: pointer.y };

    if (!this.calibrationPointA) {
      this.calibrationPointA = p;
      this.addCalibrationMarker(p);
      return;
    }

    const p1 = this.calibrationPointA;
    const p2 = p;
    this.addCalibrationMarker(p2);
    this.drawCalibrationLine(p1, p2);
    this.calibrationPointA = null;
    this.opts.onCalibrationPoints(p1, p2);
  }

  private addCalibrationMarker(p: CalibrationPoint): void {
    const zoom = this.canvas.getZoom();
    const r = 5 / zoom;
    const marker = new Circle({
      left: p.x - r,
      top: p.y - r,
      radius: r,
      fill: '#22d3ee',
      stroke: '#0e7490',
      strokeWidth: 1 / zoom,
      selectable: false,
      evented: false,
    });
    this.canvas.add(marker);
    this.calibrationDraftObjects.push(marker);
    this.canvas.requestRenderAll();
  }

  private drawCalibrationLine(p1: CalibrationPoint, p2: CalibrationPoint): void {
    const zoom = this.canvas.getZoom();
    const line = new Line([p1.x, p1.y, p2.x, p2.y], {
      stroke: '#22d3ee',
      strokeWidth: 1.5 / zoom,
      strokeDashArray: [6 / zoom, 4 / zoom],
      selectable: false,
      evented: false,
    });
    const label = new FabricText('…', {
      left: (p1.x + p2.x) / 2,
      top: (p1.y + p2.y) / 2,
      fontSize: 14 / zoom,
      fill: '#22d3ee',
      backgroundColor: '#0f172aee',
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'bottom',
    });
    this.canvas.add(line, label);
    this.calibrationDraftObjects.push(line, label);
    this.pendingCalibrationLabel = label;
    this.canvas.requestRenderAll();
  }
}
