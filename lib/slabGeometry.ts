import * as THREE from "three";
import { Brush, Evaluator, ADDITION } from "three-bvh-csg";
import { Wall } from "./types";
import { mmToWorld, planToWorld } from "./coords";

const evaluator = new Evaluator();
evaluator.useGroups = false;

const SLAB_MARGIN_MM = 15; // slab extends this far past the outermost wall face, all sides

export function computePlanBoundsMm(walls: Wall[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      const half = w.thicknessMm / 2;
      minX = Math.min(minX, p.x - half);
      maxX = Math.max(maxX, p.x + half);
      minY = Math.min(minY, p.y - half);
      maxY = Math.max(maxY, p.y + half);
    }
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/** Standalone slab brush, sitting with its TOP at world y=0 (walls start at y=0 and rise). */
export function buildSlabBrush(walls: Wall[], slabThicknessMm: number): Brush {
  const b = computePlanBoundsMm(walls);
  const widthMm = Math.max(1, b.maxX - b.minX + SLAB_MARGIN_MM * 2);
  const depthMm = Math.max(1, b.maxY - b.minY + SLAB_MARGIN_MM * 2);
  const centerMm = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };

  const geo = new THREE.BoxGeometry(mmToWorld(widthMm), mmToWorld(slabThicknessMm), mmToWorld(depthMm));
  const brush = new Brush(geo);
  const [wx, , wz] = planToWorld(centerMm);
  brush.position.set(wx, -mmToWorld(slabThicknessMm) / 2, wz);
  brush.updateMatrixWorld(true);
  return brush;
}

/** Union an arbitrary brush (already in world space) onto the slab so the pair prints as one manifold shell. */
export function unionOntoSlab(slab: Brush, other: THREE.BufferGeometry): THREE.BufferGeometry {
  const otherBrush = new Brush(other);
  otherBrush.position.set(0, 0, 0);
  otherBrush.updateMatrixWorld(true);
  const result = evaluator.evaluate(slab, otherBrush, ADDITION);
  result.updateMatrixWorld(true);
  const geometry = result.geometry.clone();
  geometry.computeVertexNormals();
  return geometry;
}
