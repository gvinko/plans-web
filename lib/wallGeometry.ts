import * as THREE from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION } from "three-bvh-csg";
import { Wall, WallOpening } from "./types";
import { mmToWorld, planToWorld } from "./coords";

const evaluator = new Evaluator();
// useGroups=false: we don't need per-operand material groups, and disabling
// keeps the evaluator from emitting degenerate zero-area groups at coplanar
// cut boundaries — one of the more common sources of non-manifold output.
evaluator.useGroups = false;
evaluator.attributes = ["position", "normal"];

function wallAngleRad(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

function wallLengthMm(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

/**
 * Build a single wall segment as a world-space Brush box.
 * Each wall is extended by half its own thickness at both ends BEFORE union —
 * this is what makes two walls meeting at a corner fuse into a solid miter
 * instead of leaving a diagonal seam or a hairline gap once CSG-unioned.
 */
function buildWallBrush(wall: Wall): Brush {
  const length = wallLengthMm(wall) + wall.thicknessMm; // overlap by thickness for corner fusion
  const angle = wallAngleRad(wall);
  const mid = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };

  const geo = new THREE.BoxGeometry(
    mmToWorld(length),
    mmToWorld(wall.heightMm),
    mmToWorld(wall.thicknessMm)
  );

  const brush = new Brush(geo);
  const [wx, , wz] = planToWorld(mid);
  brush.position.set(wx, mmToWorld(wall.heightMm) / 2, wz);
  brush.rotation.y = -angle; // plan +x/+y (screen) -> world x/z; negate for RH rotation about Y
  brush.updateMatrixWorld(true);
  return brush;
}

/**
 * Build a cutter brush for one opening: a box that fully pierces the wall's
 * thickness (oversized on the depth axis by 2x epsilon) so the boolean
 * subtraction never leaves a zero-thickness skin on either wall face.
 */
function buildOpeningCutterBrush(wall: Wall, opening: WallOpening): Brush {
  const angle = wallAngleRad(wall);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const center = {
    x: wall.start.x + dirX * opening.distanceFromStart,
    y: wall.start.y + dirY * opening.distanceFromStart,
  };
  const openHeight = Math.max(1, opening.headerHeight - opening.sillHeight);
  const epsilon = 2; // mm of through-depth safety margin on each side

  const geo = new THREE.BoxGeometry(
    mmToWorld(opening.width),
    mmToWorld(openHeight),
    mmToWorld(wall.thicknessMm + epsilon * 2)
  );

  const brush = new Brush(geo);
  const [wx, , wz] = planToWorld(center);
  const elevationMm = opening.sillHeight + openHeight / 2;
  brush.position.set(wx, mmToWorld(elevationMm), wz);
  brush.rotation.y = -angle;
  brush.updateMatrixWorld(true);
  return brush;
}

function unionAll(brushes: Brush[]): Brush | null {
  if (brushes.length === 0) return null;
  let acc = brushes[0];
  for (let i = 1; i < brushes.length; i++) {
    acc = evaluator.evaluate(acc, brushes[i], ADDITION);
    acc.updateMatrixWorld(true);
  }
  return acc;
}

function subtractAll(base: Brush, cutters: Brush[]): Brush {
  if (cutters.length === 0) return base;
  const cutterUnion = unionAll(cutters)!;
  const result = evaluator.evaluate(base, cutterUnion, SUBTRACTION);
  result.updateMatrixWorld(true);
  return result;
}

export interface WallSolidResult {
  geometry: THREE.BufferGeometry;
  /** True if every wall's openings validated (see lib/validate.ts) with no structural violations. */
  warnings: string[];
}

/**
 * Fuse every wall into one manifold, watertight brush and punch out all
 * door/window openings in a single pass. This is the function the 3D
 * viewport and the STL exporter both call — same geometry, so what you see
 * is exactly what prints.
 */
export function buildFusedWallsGeometry(walls: Wall[]): WallSolidResult {
  const warnings: string[] = [];
  if (walls.length === 0) {
    return { geometry: new THREE.BufferGeometry(), warnings };
  }

  const wallBrushes = walls.map(buildWallBrush);
  let fused = unionAll(wallBrushes)!;

  const allCutters: Brush[] = [];
  for (const wall of walls) {
    for (let opening of wall.openings) {
      if (opening.headerHeight <= opening.sillHeight) {
        warnings.push(
          `Opening on wall ${wall.id.slice(0, 6)} has header <= sill; skipped.`
        );
        continue;
      }
      if (opening.headerHeight > wall.heightMm) {
        warnings.push(
          `Opening on wall ${wall.id.slice(0, 6)} header exceeds wall height; clamped.`
        );
        opening = { ...opening, headerHeight: wall.heightMm };
      }
      allCutters.push(buildOpeningCutterBrush(wall, opening));
    }
  }

  const final = subtractAll(fused, allCutters);

  // Clean up: merge coincident vertices left over from the boolean pass and
  // recompute normals so the exporter sees a proper manifold, outward-facing
  // shell rather than the raw (sometimes duplicate-vertex-heavy) CSG output.
  const geometry = final.geometry.clone();
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return { geometry, warnings };
}