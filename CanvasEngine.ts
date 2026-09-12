import { Canvas, Circle, FabricImage, FabricText, Line, Point, type TPointerEventInfo, type TPointerEvent } from 'fabric';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;

export type ToolMode = 'select' | 'pan' | 'calibrate' | 'place-component' | 'duct-rigid' | 'duct-flex' | 'trace-wall';

export interface CalibrationPoint {
  x: number;
  y: number;
}

interface CanvasEngineOptions {
  /** Fired after the second calibration click. React owns the "enter real-world length" prompt. */
  onCalibrationPoints: (p1: CalibrationPoint, p2: CalibrationPoint) => void;
  onZoomChange?: (zoom: number) => void;
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
    img.set({ left: 0, top: 0, selectable: false, evented: false, hoverCursor: 'default' });
    this.canvas.add(img);
    this.canvas.sendObjectToBack(img);
    this.fitToViewport(widthPx, heightPx);
    this.canvas.requestRenderAll();
  }

  /** Low-opacity underlay for tracing over a rough hand sketch — independent of the calibrated backgroundImage. */
  async loadSketchOverlay(objectUrl: string, widthPx: number, heightPx: number, opacity: number): Promise<void> {
    if (this.sketchImageObj) {
      this.canvas.remove(this.sketchImageObj);
      this.sketchImageObj = null;
    }
    const img = await FabricImage.fromURL(objectUrl);
    img.set({ left: 0, top: 0, opacity, selectable: false, evented: false, hoverCursor: 'default' });
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

  loadFromJSON(json: string): Promise<void> {
    return this.canvas.loadFromJSON(JSON.parse(json)).then(() => {
      this.canvas.requestRenderAll();
    });
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
    if (e.code === 'Space' && !this.isTypingTarget(e.target) && !this.spaceHeld) {
      this.spaceHeld = true;
      this.canvas.defaultCursor = 'grab';
      this.canvas.selection = false;
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
