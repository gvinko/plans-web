import { Point2 } from "./types";

/**
 * three.js world units per millimetre of real-world plan.
 * We work in "cm-like" world units (1 world unit = 10mm) purely so default
 * camera/controls distances stay in sane ranges — it has ZERO effect on the
 * exported mesh, because exportMesh.ts re-scales from plan-mm directly using
 * PrintSettings, not from world units. Keep this separate from print scale.
 */
export const WORLD_UNITS_PER_MM = 0.1;

export function mmToWorld(mm: number): number {
  return mm * WORLD_UNITS_PER_MM;
}

export function worldToMm(world: number): number {
  return world / WORLD_UNITS_PER_MM;
}

/** Plan space (x,y mm) -> three.js world space (x,0,z), with Y-up convention. */
export function planToWorld(p: Point2): [number, number, number] {
  return [mmToWorld(p.x), 0, mmToWorld(p.y)];
}

/** Canvas pixel -> plan mm, given the calibration's mmPerPixel and a chosen plan origin (first click). */
export function pixelToPlan(
  px: { x: number; y: number },
  originPx: { x: number; y: number },
  mmPerPixel: number
): Point2 {
  return {
    x: (px.x - originPx.x) * mmPerPixel,
    y: (px.y - originPx.y) * mmPerPixel,
  };
}

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleDeg(a: Point2, b: Point2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Snap a candidate endpoint to the grid and/or to 45°/90° relative to the anchor point. */
export function snapPoint(
  anchor: Point2,
  candidate: Point2,
  opts: { gridSizeMm: number; snapToGrid: boolean; angleSnapDeg: number }
): Point2 {
  let result = { ...candidate };

  if (opts.angleSnapDeg > 0) {
    const dx = candidate.x - anchor.x;
    const dy = candidate.y - anchor.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const rawAngle = Math.atan2(dy, dx);
      const step = (opts.angleSnapDeg * Math.PI) / 180;
      const snappedAngle = Math.round(rawAngle / step) * step;
      result = {
        x: anchor.x + Math.cos(snappedAngle) * len,
        y: anchor.y + Math.sin(snappedAngle) * len,
      };
    }
  }

  if (opts.snapToGrid && opts.gridSizeMm > 0) {
    result = {
      x: Math.round(result.x / opts.gridSizeMm) * opts.gridSizeMm,
      y: Math.round(result.y / opts.gridSizeMm) * opts.gridSizeMm,
    };
  }

  return result;
}
