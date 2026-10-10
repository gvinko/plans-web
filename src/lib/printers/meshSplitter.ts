import { computeMeshBounds, type StlMesh, type StlTriangle, type Vec3 } from '../stl/stl';
import type { PrinterProfile } from './profiles';
import { createSplitPlan, type SplitPlan } from './splitPlanner';

/**
 * Conservative watertight STL cutter. For now only single-loop, convex cut
 * sections are supported. Invalid topology is rejected rather than exported.
 * Units are millimetres.
 */
export interface PrintablePart {
  mesh: StlMesh;
  /** Assembly-space origin before this part is shifted to 0/0/0. */
  assemblyOffsetMm: Vec3;
  partNumber: number;
}
export interface PrintableSplit {
  plan: SplitPlan;
  parts: PrintablePart[];
}

type Axis = 'x' | 'y' | 'z';
const AXES: Axis[] = ['x', 'y', 'z'];
const MAX_INPUT_TRIANGLES = 60000;
const MAX_PARTS = 12;
const MAX_TOTAL_TRIANGLES = 200000;
const BED_MARGIN_TOTAL_MM = 4; // 2 mm safety margin on each side.

function tolerance(mesh: StlMesh): number {
  const size = mesh.bounds.size;
  return Math.max(0.00001, Math.min(0.0005, Math.max(size.x, size.y, size.z) * 1e-7));
}
const vec = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normal = (a: Vec3, b: Vec3, c: Vec3): Vec3 => {
  const n = cross(subtract(b, a), subtract(c, a));
  const length = Math.hypot(n.x, n.y, n.z);
  if (length < 1e-12) throw new Error('STL contains a zero-area triangle. Repair the mesh before splitting.');
  return { x: n.x / length, y: n.y / length, z: n.z / length };
};
const triangle = (a: Vec3, b: Vec3, c: Vec3): StlTriangle => ({ a, b, c, normal: normal(a, b, c) });
const key = (p: Vec3, eps: number): string =>
  [Math.round(p.x / eps), Math.round(p.y / eps), Math.round(p.z / eps)].join(',');

/** Every oriented triangle edge must have exactly one reversed partner. */
export function validateWatertightMesh(mesh: StlMesh): void {
  if (!mesh.triangles.length) throw new Error('STL has no triangles to split.');
  const eps = tolerance(mesh);
  const edgeCounts = new Map<string, { forward: number; backward: number }>();
  for (const face of mesh.triangles) {
    const points = [face.a, face.b, face.c];
    for (const p of points) {
      if (![p.x, p.y, p.z].every(Number.isFinite)) {
        throw new Error('STL contains invalid coordinates. Repair the mesh before splitting.');
      }
    }
    normal(face.a, face.b, face.c);
    for (let i = 0; i < 3; i++) {
      const a = key(points[i], eps);
      const b = key(points[(i + 1) % 3], eps);
      if (a === b) throw new Error('STL has collapsed edges; repair the mesh before splitting.');
      const ascending = a < b;
      const edge = ascending ? a + '|' + b : b + '|' + a;
      const counts = edgeCounts.get(edge) ?? { forward: 0, backward: 0 };
      if (ascending) counts.forward += 1;
      else counts.backward += 1;
      edgeCounts.set(edge, counts);
    }
  }
  for (const counts of edgeCounts.values()) {
    if (counts.forward !== 1 || counts.backward !== 1) {
      throw new Error('STL is open, non-manifold or inconsistently oriented. Repair it before splitting.');
    }
  }
  // Distinguish fully inverted meshes from mixed-winding/non-manifold topology.
  const origin = mesh.bounds.min;
  const signedSixVolume = mesh.triangles.reduce((sum, face) => {
    const a = subtract(face.a, origin), b = subtract(face.b, origin), c = subtract(face.c, origin);
    const n = cross(b, c);
    return sum + a.x * n.x + a.y * n.y + a.z * n.z;
  }, 0);
  if (signedSixVolume < -1e-8) {
    throw new Error('STL is inside-out (inverted face normals). Reorient faces before splitting.');
  }
}

function intersect(a: Vec3, b: Vec3, axis: Axis, plane: number): Vec3 {
  const t = (plane - a[axis]) / (b[axis] - a[axis]);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    [axis]: plane,
  };
}

function clippedPolygon(points: Vec3[], axis: Axis, plane: number, lower: boolean): Vec3[] {
  const inside = (p: Vec3) => lower ? p[axis] < plane : p[axis] > plane;
  const result: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const inCurrent = inside(current);
    const inNext = inside(next);
    if (inCurrent) result.push(current);
    if (inCurrent !== inNext) result.push(intersect(current, next, axis, plane));
  }
  return result;
}

function appendPolygon(out: StlTriangle[], polygon: Vec3[]): void {
  for (let i = 1; i + 1 < polygon.length; i++) {
    out.push(triangle(polygon[0], polygon[i], polygon[i + 1]));
  }
}

function sectionsToLoop(segments: Array<[Vec3, Vec3]>, eps: number): Vec3[] {
  const nodes = new Map<string, { p: Vec3; edges: Set<string> }>();
  for (const [a, b] of segments) {
    const ka = key(a, eps);
    const kb = key(b, eps);
    // Thin triangle slivers can yield two intersections quantised to the same
    // contour point. They contribute zero contour length; drop those edges,
    // then require a complete degree-two loop and watertight output below.
    if (ka === kb) continue;
    if (!nodes.has(ka)) nodes.set(ka, { p: vec(a), edges: new Set() });
    if (!nodes.has(kb)) nodes.set(kb, { p: vec(b), edges: new Set() });
    const na = nodes.get(ka)!;
    const nb = nodes.get(kb)!;
    if (na.edges.has(kb)) throw new Error('Cut contains duplicate intersection edges.');
    na.edges.add(kb);
    nb.edges.add(ka);
  }
  if (nodes.size < 3 || [...nodes.values()].some((node) => node.edges.size !== 2)) {
    throw new Error('Cut contour is not a simple closed loop; the mesh cannot safely be split here.');
  }
  const first = nodes.keys().next().value as string;
  const seen = new Set<string>();
  const loop: Vec3[] = [];
  let current = first;
  let previous: string | null = null;
  do {
    if (seen.has(current)) throw new Error('Cut contour loops into itself.');
    seen.add(current);
    const node = nodes.get(current)!;
    loop.push(node.p);
    const next: string = [...node.edges].find((n) => n !== previous) ?? '';
    if (!next) throw new Error('Cut contour is broken.');
    previous = current;
    current = next;
  } while (current !== first);
  if (seen.size !== nodes.size) {
    throw new Error('Cut intersects multiple islands or holes. Joining multiple contours is not yet supported.');
  }
  return loop;
}

/** Coordinates chosen so +U × +V points along +axis. */
function planar(p: Vec3, axis: Axis): [number, number] {
  if (axis === 'x') return [p.y, p.z];
  if (axis === 'y') return [p.z, p.x];
  return [p.x, p.y];
}

function cap(loop: Vec3[], axis: Axis, outwardPositive: boolean, eps: number): StlTriangle[] {
  const projected = loop.map((p) => planar(p, axis));
  let signedTwiceArea = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[(i + 1) % loop.length];
    signedTwiceArea += x1 * y2 - y1 * x2;
  }
  if (Math.abs(signedTwiceArea) <= eps * eps) {
    throw new Error('Cut creates a zero-area surface.');
  }
  const orientation = Math.sign(signedTwiceArea);
  // A centre fan stays inside a convex polygon and keeps every contour edge.
  for (let i = 0; i < loop.length; i++) {
    const a = projected[i];
    const b = projected[(i + 1) % loop.length];
    const c = projected[(i + 2) % loop.length];
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const edgeA = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const edgeB = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const float32Tolerance = Math.max(eps * eps, edgeA * edgeB * 1e-5);
    if (turn * orientation < -float32Tolerance) {
      throw new Error('Cut produces a concave section. This safe splitter supports convex, single-loop sections only.');
    }
  }
  const forward = (orientation > 0) === outwardPositive;
  // A boundary fan avoids creating the exact-centre cap vertex that obstructs a
  // later orthogonal split. If any triangles collapse due to collinear contour
  // vertices, retain every boundary segment using a deliberately off-centre fan.
  // Boundary fans are useful on densely tessellated curved contours. On a
  // low-segment polygon they can put diagonals through later orthogonal cut
  // planes; use the off-centre interior fan for those cross sections instead.
  if (loop.length > 20) {
    try {
      const anchored: StlTriangle[] = [];
      for (let i = 1; i + 1 < loop.length; i++) {
        const a = loop[0], b = loop[i], c = loop[i + 1];
        anchored.push(forward ? triangle(a, b, c) : triangle(a, c, b));
      }
      return anchored;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('zero-area')) throw error;
    }
  }
  const centroid = loop.reduce(
    (total, p) => ({ x: total.x + p.x / loop.length, y: total.y + p.y / loop.length, z: total.z + p.z / loop.length }),
    { x: 0, y: 0, z: 0 },
  );
  const interior = {
    x: centroid.x * 0.93 + loop[0].x * 0.07,
    y: centroid.y * 0.93 + loop[0].y * 0.07,
    z: centroid.z * 0.93 + loop[0].z * 0.07,
  };
  const result: StlTriangle[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    result.push(forward ? triangle(interior, a, b) : triangle(interior, b, a));
  }
  return result;
}

/** Cut and cap both halves, validating edge topology before they can be used. */
export function cutWatertightMesh(mesh: StlMesh, axis: Axis, plane: number): [StlMesh, StlMesh] {
  if (!AXES.includes(axis)) throw new Error('Invalid split axis.');
  if (!Number.isFinite(plane)) throw new Error('Invalid cut position.');
  const eps = tolerance(mesh);
  if (plane <= mesh.bounds.min[axis] + eps || plane >= mesh.bounds.max[axis] - eps) {
    throw new Error('Cut plane must be inside the model bounds.');
  }
  validateWatertightMesh(mesh);
  const lower: StlTriangle[] = [];
  const upper: StlTriangle[] = [];
  const segments: Array<[Vec3, Vec3]> = [];
  for (const face of mesh.triangles) {
    const vertices = [face.a, face.b, face.c];
    if (vertices.some((p) => Math.abs(p[axis] - plane) < eps)) {
      throw new Error('Cut passes through an existing vertex. Rotate the model or adjust the cut slightly.');
    }
    const below = vertices.filter((v) => v[axis] < plane).length;
    if (below === 3) { lower.push(face); continue; }
    if (below === 0) { upper.push(face); continue; }
    appendPolygon(lower, clippedPolygon(vertices, axis, plane, true));
    appendPolygon(upper, clippedPolygon(vertices, axis, plane, false));
    const points: Vec3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % 3];
      if ((a[axis] < plane) !== (b[axis] < plane)) {
        points.push(intersect(a, b, axis, plane));
      }
    }
    if (points.length !== 2) throw new Error('STL intersects the cut plane ambiguously.');
    segments.push([points[0], points[1]]);
  }
  if (!segments.length) throw new Error('The cut plane did not intersect any triangles.');
  const loop = sectionsToLoop(segments, eps);
  lower.push(...cap(loop, axis, true, eps));
  upper.push(...cap(loop, axis, false, eps));
  const left: StlMesh = { name: mesh.name, triangles: lower, bounds: computeMeshBounds(lower) };
  const right: StlMesh = { name: mesh.name, triangles: upper, bounds: computeMeshBounds(upper) };
  validateWatertightMesh(left);
  validateWatertightMesh(right);
  return [left, right];
}

/** Generate parts with safe local origins; assembly offsets remain available. */
export function splitMeshForPrinter(mesh: StlMesh, printer: PrinterProfile): PrintableSplit {
  if (mesh.triangles.length > MAX_INPUT_TRIANGLES) {
    throw new Error('This safe splitter supports up to ' + MAX_INPUT_TRIANGLES.toLocaleString() + ' input triangles.');
  }
  const plan = createSplitPlan(mesh.bounds.size, printer);
  if (!plan.required) return { plan, parts: [] };
  if (plan.estimatedPartCount > MAX_PARTS) {
    throw new Error('Split requires ' + plan.estimatedPartCount + ' pieces; this release supports up to ' + MAX_PARTS + '.');
  }
  validateWatertightMesh(mesh);
  let pieces: StlMesh[] = [mesh];
  for (const instruction of plan.axes) {
    const axis = instruction.axis;
    const next: StlMesh[] = [];
    for (const piece of pieces) {
      const size = piece.bounds.size[axis];
      let remainder = piece;
      const step = size / instruction.partCount;
      for (let i = 1; i < instruction.partCount; i++) {
        const requested = piece.bounds.min[axis] + i * step;
        const headroom = Math.max(0, printer.buildVolumeMm[axis] - BED_MARGIN_TOTAL_MM - step);
        const nudge = Math.min(0.5, headroom / 3);
        const candidates = [0, 0.05, -0.05, 0.2, -0.2, 0.5, -0.5]
          .map((fraction) => requested + fraction * nudge);
        const eps = tolerance(remainder);
        const plane = candidates.find((value) =>
          value > remainder.bounds.min[axis] + eps &&
          value < remainder.bounds.max[axis] - eps &&
          // The current left section must fit; the right remainder is allowed to
          // exceed one bed length because subsequent cuts will subdivide it.
          value - remainder.bounds.min[axis] <= printer.buildVolumeMm[axis] - BED_MARGIN_TOTAL_MM + eps &&
          remainder.bounds.max[axis] - value <=
            (instruction.partCount - i) * (printer.buildVolumeMm[axis] - BED_MARGIN_TOTAL_MM) + eps &&
          !remainder.triangles.some((face) =>
            [face.a, face.b, face.c].some((point) => Math.abs(point[axis] - value) < eps)));
        if (plane === undefined) {
          throw new Error('No safe split plane avoids the model vertices within the printer clearance.');
        }
        const [left, right] = cutWatertightMesh(remainder, axis, plane);
        next.push(left);
        remainder = right;
      }
      next.push(remainder);
    }
    pieces = next;
    if (pieces.reduce((sum, piece) => sum + piece.triangles.length, 0) > MAX_TOTAL_TRIANGLES) {
      throw new Error('Split exceeded the safe triangle limit. Try a lower resolution model.');
    }
  }

  const parts: PrintablePart[] = pieces.map((piece, index) => {
    const offset = { ...piece.bounds.min };
    for (const axis of AXES) {
      if (piece.bounds.size[axis] > printer.buildVolumeMm[axis] - BED_MARGIN_TOTAL_MM) {
        throw new Error('Part ' + (index + 1) + ' still exceeds the ' + axis.toUpperCase() + ' print bed dimension.');
      }
    }
    const shiftedTriangles = piece.triangles.map((face) =>
      triangle(subtract(face.a, offset), subtract(face.b, offset), subtract(face.c, offset)));
    const result: StlMesh = {
      name: mesh.name + '-part-' + String(index + 1).padStart(2, '0'),
      triangles: shiftedTriangles,
      bounds: computeMeshBounds(shiftedTriangles),
    };
    validateWatertightMesh(result);
    return { mesh: result, assemblyOffsetMm: offset, partNumber: index + 1 };
  });
  return { plan, parts };
}
