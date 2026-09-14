import * as THREE from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION } from "three-bvh-csg";
import { Wall, RoofSettings, RoofCutout } from "./types";
import { mmToWorld, planToWorld } from "./coords";
import { computePlanBoundsMm } from "./slabGeometry";

const evaluator = new Evaluator();
evaluator.useGroups = false;

const RIDGE_OVERLAP_MM = 3; // extra panel length pushed past the ridge line so CSG union never leaves a seam gap
const LIP_BAND_WIDTH_MM = 4.5; // width of the registration lip's rim, all four sides

/**
 * Build one flat panel solid by extruding a local-space 2D polygon (must be
 * wound CCW, defined by convention below) along a right-handed basis
 * (uAxis, vAxis, wAxis = uAxis × vAxis) anchored at originWorld. Because the
 * basis is constructed via cross product it is always right-handed, so the
 * extrusion's winding/outward-normal is preserved correctly regardless of
 * how the panel is tilted in world space — this is what keeps every roof
 * panel a valid, independently-manifold CSG operand.
 */
function makePanelGeometry(
  shapePts: [number, number][], // local mm, CCW order
  thicknessMm: number,
  originWorld: THREE.Vector3,
  uAxis: THREE.Vector3,
  vAxis: THREE.Vector3
): THREE.BufferGeometry {
  const shape = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(mmToWorld(x), mmToWorld(y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: mmToWorld(thicknessMm), bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -mmToWorld(thicknessMm) / 2); // center thickness on the panel plane

  const w = uAxis.clone().cross(vAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(uAxis, vAxis, w);
  m.setPosition(originWorld);
  geo.applyMatrix4(m);
  return geo;
}

function unionGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geoms.length === 0) return null;
  let acc = new Brush(geoms[0]);
  acc.updateMatrixWorld(true);
  for (let i = 1; i < geoms.length; i++) {
    const next = new Brush(geoms[i]);
    next.updateMatrixWorld(true);
    acc = evaluator.evaluate(acc, next, ADDITION);
    acc.updateMatrixWorld(true);
  }
  return acc.geometry;
}

function buildLipFrameGeometries(
  innerBounds: { minX: number; maxX: number; minY: number; maxY: number },
  toleranceMm: number,
  lipHeightMm: number,
  roofUndersideMm: number
): THREE.BufferGeometry[] {
  // Outer edge of the lip = wall inner face, pulled in by the slip-fit clearance.
  const ox0 = innerBounds.minX + toleranceMm;
  const ox1 = innerBounds.maxX - toleranceMm;
  const oy0 = innerBounds.minY + toleranceMm;
  const oy1 = innerBounds.maxY - toleranceMm;
  const w = LIP_BAND_WIDTH_MM;

  const bars: { cx: number; cy: number; sx: number; sy: number }[] = [
    { cx: (ox0 + ox1) / 2, cy: oy0 + w / 2, sx: ox1 - ox0, sy: w }, // front bar
    { cx: (ox0 + ox1) / 2, cy: oy1 - w / 2, sx: ox1 - ox0, sy: w }, // back bar
    { cx: ox0 + w / 2, cy: (oy0 + oy1) / 2, sx: w, sy: oy1 - oy0 - 2 * w }, // left bar
    { cx: ox1 - w / 2, cy: (oy0 + oy1) / 2, sx: w, sy: oy1 - oy0 - 2 * w }, // right bar
  ];

  const elevMid = roofUndersideMm - lipHeightMm / 2;
  return bars
    .filter((b) => b.sx > 0.5 && b.sy > 0.5)
    .map((b) => {
      const geo = new THREE.BoxGeometry(mmToWorld(b.sx), mmToWorld(lipHeightMm), mmToWorld(b.sy));
      const [wx, , wz] = planToWorld({ x: b.cx, y: b.cy });
      geo.translate(wx, mmToWorld(elevMid), wz);
      return geo;
    });
}

function buildCutoutBrush(cutout: RoofCutout, roofUndersideMm: number, roofSpanMm: number): Brush {
  // Vertical drop cutter — pierces straight down through whichever panel(s) it overlaps.
  const tallMm = roofSpanMm * 3 + 200;
  const geo = new THREE.BoxGeometry(mmToWorld(cutout.widthMm), mmToWorld(tallMm), mmToWorld(cutout.depthMm));
  const [wx, , wz] = planToWorld(cutout.center);
  const brush = new Brush(geo);
  brush.position.set(wx, mmToWorld(roofUndersideMm + tallMm / 2 - 50), wz);
  brush.updateMatrixWorld(true);
  return brush;
}

export interface RoofBuildResult {
  geometry: THREE.BufferGeometry;
  warnings: string[];
}

export function buildRoofGeometry(walls: Wall[], roof: RoofSettings): RoofBuildResult {
  const warnings: string[] = [];
  if (!roof.enabled || walls.length === 0) {
    return { geometry: new THREE.BufferGeometry(), warnings };
  }

  const inner = computePlanBoundsMm(walls); // ~= wall footprint (centerline ± half thickness)
  const outer = {
    minX: inner.minX - roof.overhangMm,
    maxX: inner.maxX + roof.overhangMm,
    minY: inner.minY - roof.overhangMm,
    maxY: inner.maxY + roof.overhangMm,
  };
  const wallTopMm = Math.max(...walls.map((w) => w.heightMm));
  const width = outer.maxX - outer.minX;
  const depth = outer.maxY - outer.minY;
  const centerX = (outer.minX + outer.maxX) / 2;
  const centerY = (outer.minY + outer.maxY) / 2;
  const pitchRad = (roof.pitchDeg * Math.PI) / 180;

  const panelGeoms: THREE.BufferGeometry[] = [];

  if (roof.style === "flat") {
    const geo = new THREE.BoxGeometry(mmToWorld(width), mmToWorld(roof.thicknessMm), mmToWorld(depth));
    const [wx, , wz] = planToWorld({ x: centerX, y: centerY });
    geo.translate(wx, mmToWorld(wallTopMm + roof.thicknessMm / 2), wz);
    panelGeoms.push(geo);
  } else {
    const halfDepth = depth / 2;
    const ridgeHeightMm = halfDepth * Math.tan(pitchRad);
    const slopeLengthMm = Math.hypot(halfDepth, ridgeHeightMm) + RIDGE_OVERLAP_MM;

    let ridgeLenMm = width; // gable: ridge spans full width
    if (roof.style === "hip") {
      if (depth > width) {
        warnings.push("Hip roof works best when the footprint is wider than it is deep — using a simplified approximation.");
      }
      ridgeLenMm = Math.max(0, width - depth);
    }

    const eavePitch = (halfWidth: number, ridgeHalf: number, sign: 1 | -1) => {
      // sign +1 = "front" (toward outer.minY), -1 = "back" (toward outer.maxY)
      const eaveZ = sign === 1 ? outer.minY : outer.maxY;
      const origin = new THREE.Vector3(...planToWorld({ x: centerX, y: eaveZ }));
      origin.y = mmToWorld(wallTopMm);
      const slopeDir = new THREE.Vector3(0, Math.cos(pitchRad), sign === 1 ? Math.sin(pitchRad) : -Math.sin(pitchRad));
      const uAxis = new THREE.Vector3(1, 0, 0);
      const shape: [number, number][] = [
        [-halfWidth, 0],
        [halfWidth, 0],
        [ridgeHalf, slopeLengthMm],
        [-ridgeHalf, slopeLengthMm],
      ];
      return makePanelGeometry(shape, roof.thicknessMm, origin, uAxis, slopeDir);
    };

    panelGeoms.push(eavePitch(width / 2, ridgeLenMm / 2, 1)); // front
    panelGeoms.push(eavePitch(width / 2, ridgeLenMm / 2, -1)); // back

    if (roof.style === "hip" && ridgeLenMm < width) {
      // Two triangular hip-end panels closing the short ends of the roof.
      const buildHipEnd = (sign: 1 | -1) => {
        const x = sign === 1 ? outer.maxX : outer.minX;
        const ridgeX = sign === 1 ? centerX + ridgeLenMm / 2 : centerX - ridgeLenMm / 2;
        const eaveA = new THREE.Vector3(...planToWorld({ x, y: outer.minY }));
        eaveA.y = mmToWorld(wallTopMm);
        const eaveB = new THREE.Vector3(...planToWorld({ x, y: outer.maxY }));
        eaveB.y = mmToWorld(wallTopMm);
        const ridgeP = new THREE.Vector3(...planToWorld({ x: ridgeX, y: centerY }));
        ridgeP.y = mmToWorld(wallTopMm + ridgeHeightMm);

        // Local basis: u along the eave (A->B), v from eave-midpoint up to ridge.
        const origin = eaveA.clone();
        const uAxis = eaveB.clone().sub(eaveA).normalize();
        const uLen = eaveB.distanceTo(eaveA);
        const midEave = eaveA.clone().add(eaveB).multiplyScalar(0.5);
        const toRidge = ridgeP.clone().sub(midEave);
        const vLen = toRidge.length();
        const vAxis = toRidge.normalize();
        // Project ridge point onto u to know its along-eave offset for the shape.
        const ridgeAlongU = ridgeP.clone().sub(origin).dot(uAxis);
        const worldToLocalScale = 1 / mmToWorld(1);
        const shape: [number, number][] = [
          [0, 0],
          [uLen * worldToLocalScale, 0],
          [ridgeAlongU * worldToLocalScale, vLen * worldToLocalScale + RIDGE_OVERLAP_MM],
        ];
        return makePanelGeometry(shape, roof.thicknessMm, origin, uAxis, vAxis);
      };
      panelGeoms.push(buildHipEnd(1));
      panelGeoms.push(buildHipEnd(-1));
    } else if (roof.style === "gable") {
      warnings.push("Gable ends are left open above the wall top — add end walls up to the ridge, or switch to hip/flat for a fully closed shell.");
    }
  }

  const lipGeoms = buildLipFrameGeometries(inner, roof.lipToleranceMm, roof.lipHeightMm, wallTopMm);

  let merged = unionGeometries([...panelGeoms, ...lipGeoms]);
  if (!merged) {
    return { geometry: new THREE.BufferGeometry(), warnings };
  }

  if (roof.cutouts.length > 0) {
    let acc = new Brush(merged);
    acc.updateMatrixWorld(true);
    for (const cutout of roof.cutouts) {
      const cutterBrush = buildCutoutBrush(cutout, wallTopMm, Math.max(width, depth));
      acc = evaluator.evaluate(acc, cutterBrush, SUBTRACTION);
      acc.updateMatrixWorld(true);
    }
    merged = acc.geometry;
  }

  const geometry = merged.clone();
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return { geometry, warnings };
}
