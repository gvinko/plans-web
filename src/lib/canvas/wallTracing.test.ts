import { describe, expect, it, vi } from 'vitest';
import { attachWallTracing } from './wallTracing';
import type { CanvasEngine, ToolMode } from './CanvasEngine';

/**
 * Minimal fake standing in for CanvasEngine + its fabric Canvas, just enough for
 * attachWallTracing's contract: event registration, draft rendering, and the
 * onToolModeChange hook that CanvasEngine.setToolMode fires synchronously.
 */
function createFakeEngine() {
  let toolMode: ToolMode = 'trace-wall';
  const canvasHandlers: Record<string, Array<(opt: unknown) => void>> = {};
  const toolModeListeners = new Set<(mode: ToolMode) => void>();
  const added: unknown[] = [];

  const canvas = {
    on: (event: string, handler: (opt: unknown) => void) => {
      (canvasHandlers[event] ??= []).push(handler);
    },
    off: (event: string, handler: (opt: unknown) => void) => {
      canvasHandlers[event] = (canvasHandlers[event] ?? []).filter((h) => h !== handler);
    },
    add: (obj: unknown) => added.push(obj),
    remove: (obj: unknown) => {
      const idx = added.indexOf(obj);
      if (idx >= 0) added.splice(idx, 1);
    },
    getPointer: () => ({ x: 10, y: 10 }),
    getZoom: () => 1,
    requestRenderAll: vi.fn(),
  };

  const engine = {
    canvas,
    getToolMode: () => toolMode,
    // Mirrors CanvasEngine.setToolMode: updates mode then synchronously notifies
    // listeners, independent of any pointer/canvas event.
    setToolMode: (mode: ToolMode) => {
      toolMode = mode;
      toolModeListeners.forEach((listener) => listener(mode));
    },
    onToolModeChange: (listener: (mode: ToolMode) => void) => {
      toolModeListeners.add(listener);
      return () => toolModeListeners.delete(listener);
    },
    recordUndoGroup: vi.fn(),
  } as unknown as CanvasEngine;

  function fireMouseDown(point: { x: number; y: number }) {
    canvas.getPointer = () => point;
    canvasHandlers['mouse:down']?.forEach((h) => h({ e: {} }));
  }

  return { engine, canvas, added, fireMouseDown };
}

describe('attachWallTracing tool-change lifecycle', () => {
  it('discards an in-progress draft immediately when the tool changes, with the pointer never touching the canvas', () => {
    const { engine, added, fireMouseDown } = createFakeEngine();
    attachWallTracing(engine, () => null, () => {});

    // Start a wall trace: two clicks leave two markers on the canvas.
    fireMouseDown({ x: 0, y: 0 });
    fireMouseDown({ x: 50, y: 0 });
    expect(added.length).toBeGreaterThan(0);

    // Switch tools via toolbar/keyboard (CanvasEngine.setToolMode) without any further
    // pointer activity on the canvas.
    engine.setToolMode('select');

    // The draft must be cleared right away, not deferred until the next canvas pointer event.
    expect(added.length).toBe(0);
  });

  it('does not let a discarded draft be reused after switching back to the wall tool', () => {
    const { engine, added, fireMouseDown } = createFakeEngine();
    attachWallTracing(engine, () => null, () => {});

    fireMouseDown({ x: 0, y: 0 });
    fireMouseDown({ x: 50, y: 0 });
    expect(added.length).toBe(2);

    engine.setToolMode('duct-rigid');
    expect(added.length).toBe(0);

    engine.setToolMode('trace-wall');
    // A fresh click should start a brand-new draft, not resume/close the stale one.
    fireMouseDown({ x: 5, y: 5 });
    expect(added.length).toBe(1);
  });

  it('leaves an empty draft alone when the tool changes with no points yet', () => {
    const { engine, added } = createFakeEngine();
    attachWallTracing(engine, () => null, () => {});

    engine.setToolMode('select');
    expect(added.length).toBe(0);
  });
});
