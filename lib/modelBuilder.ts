import * as THREE from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION } from "three-bvh-csg";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FloorPlanDocument, FurniturePlacement } from "./types";
import { buildFusedWallsGeometry } from "./wallGeometry";
import { buildSlabBrush } from "./slabGeometry";
import { buildRoofGeometry } from "./roofGeometry";
import { FURNITURE_LIBRARY } from "./furniture";
import { mmToWorld, planToWorld } from "./coords";

const evaluator = new Evaluator();
evaluator.useGroups = false;

export interface BuiltModel {
  /** Walls + baseplate, fully fused into one manifold shell (furniture unioned in too, if mergeMode === "merged"). */
  baseGeometry: THREE.BufferGeometry;
  /** Roof + registration lip, always kept separate so it can be printed and lifted off independently. */
  roofGeometry: THREE.BufferGeometry;
  /** Only populated when mergeMode === "loose" — each piece as its own placed, unmerged solid for the viewport/export. */
  looseFurniture: { id: string; geometry: THREE.BufferGeometry }[];
  warnings: string[];
}

function transformFurnitureGeometry(placement: FurniturePlacement, local: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = local.clone();
  const [wx, , wz] = planToWorld(placement.position);
  // Order matters: scale about the piece's own origin first, then rotate about
  // the (still-origin-centered) Y axis, then translate into its plan position.
  geo.scale(placement.scale, placement.scale, placement.scale);
  geo.rotateY((-placement.rotationDeg * Math.PI) / 180);
  geo.translate(wx, 0, wz);
  return geo;
}

/**
 * Walls fused with the baseplate, no furniture. Shared by the live 3D
 * preview (called on a debounce, since it's a CSG pass) and by
 * buildFullModel below, which starts from this and unions in furniture only
 * when export actually happens.
 */
export function buildBaseShell(doc: FloorPlanDocument): { brush: Brush; warnings: string[] } {
  const warnings: string[] = [];
  const wallsResult = buildFusedWallsGeometry(doc.walls);
  warnings.push(...wallsResult.warnings);

  const slabBrush = buildSlabBrush(doc.walls, doc.print.slabThicknessMm);
  const wallsBrush = new Brush(wallsResult.geometry);
  wallsBrush.position.set(0, 0, 0);
  wallsBrush.updateMatrixWorld(true);
  const baseBrush = doc.walls.length > 0 ? evaluator.evaluate(slabBrush, wallsBrush, ADDITION) : slabBrush;
  baseBrush.updateMatrixWorld(true);
  return { brush: baseBrush, warnings };
}

export function buildFullModel(doc: FloorPlanDocument): BuiltModel {
  const shell = buildBaseShell(doc);
  const warnings = [...shell.warnings];
  let baseBrush = shell.brush;

  const looseFurniture: { id: string; geometry: THREE.BufferGeometry }[] = [];

  if (doc.furniture.length > 0) {
    if (doc.print.mergeMode === "merged") {
      for (const placement of doc.furniture) {
        const def = FURNITURE_LIBRARY[placement.primitiveId];
        if (!def) continue;
        const local = def.build();
        const placed = transformFurnitureGeometry(placement, local);
        const placedBrush = new Brush(placed);
        placedBrush.position.set(0, 0, 0);
        placedBrush.updateMatrixWorld(true);
        baseBrush = evaluator.evaluate(baseBrush, placedBrush, ADDITION);
        baseBrush.updateMatrixWorld(true);

        const cavity = (local as any).__bathtubCavity as THREE.BufferGeometry | undefined;
        if (cavity) {
          const placedCavity = transformFurnitureGeometry(placement, cavity);
          const cavityBrush = new Brush(placedCavity);
          cavityBrush.position.set(0, 0, 0);
          cavityBrush.updateMatrixWorld(true);
          baseBrush = evaluator.evaluate(baseBrush, cavityBrush, SUBTRACTION);
          baseBrush.updateMatrixWorld(true);
        }
      }
    } else {
      // Loose mode: solids don't intersect, so a plain (cheap) concat is enough — no CSG needed.
      for (const placement of doc.furniture) {
        const def = FURNITURE_LIBRARY[placement.primitiveId];
        if (!def) continue;
        const local = def.build();
        const placed = transformFurnitureGeometry(placement, local);
        looseFurniture.push({ id: placement.id, geometry: placed });
      }
    }
  }

  const baseGeometry = baseBrush.geometry.clone();
  baseGeometry.deleteAttribute("uv");
  baseGeometry.computeVertexNormals();
  baseGeometry.computeBoundingBox();

  const roofResult = buildRoofGeometry(doc.walls, doc.roof);
  warnings.push(...roofResult.warnings);

  return { baseGeometry, roofGeometry: roofResult.geometry, looseFurniture, warnings };
}

/** Convenience: merge an arbitrary list of already-placed geometries with plain concatenation (for loose-mode export/preview only — never for parts that must be watertight-fused). */
export function concatGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geoms.length === 0) return null;
  return mergeGeometries(geoms, false);
}
