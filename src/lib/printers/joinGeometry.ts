import { computeMeshBounds, type StlMesh, type StlTriangle, type Vec3 } from '../stl/stl';
import { validateWatertightMesh, type PrintablePart, type PrintableSplit } from './meshSplitter';
import type { JoinAxis, JoinDescriptor, JoiningPlan } from './joinPlanner';

type ManifoldApi = {
  setup: () => void;
  Mesh: new (options: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }) => unknown;
  Manifold: {
    ofMesh: (mesh: unknown) => ManifoldShape;
    cylinder: (height: number, radiusLow: number, radiusHigh?: number, circularSegments?: number) => ManifoldShape;
  };
  CrossSection: new (contours: number[][][]) => {
    offset: (delta: number, joinType?: string) => { extrude: (height: number) => ManifoldShape };
    extrude: (height: number) => ManifoldShape;
  };
};

type ManifoldShape = {
  add: (other: ManifoldShape) => ManifoldShape;
  subtract: (other: ManifoldShape) => ManifoldShape;
  translate: (x: number, y?: number, z?: number) => ManifoldShape;
  rotate: (x: number, y?: number, z?: number) => ManifoldShape;
  getMesh: () => { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };
  delete?: () => void;
};

let manifoldApi: Promise<ManifoldApi> | null = null;

function getManifold(): Promise<ManifoldApi> {
  if (!manifoldApi) {
    manifoldApi = import('manifold-3d/manifold.js').then(({ default: createManifold }) => createManifold()).then((api) => {
      api.setup();
      return api as unknown as ManifoldApi;
    });
  }
  return manifoldApi;
}

const AXES: JoinAxis[] = ['x', 'y', 'z'];
const overlapMm = 1.2;

function normal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const cross = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
  const length = Math.hypot(cross.x, cross.y, cross.z);
  if (length < 1e-9) throw new Error('Joining geometry produced a zero-area triangle.');
  return { x: cross.x / length, y: cross.y / length, z: cross.z / length };
}

function stlToManifold(mesh: StlMesh, api: ManifoldApi): ManifoldShape {
  const vertices: number[] = [];
  const indices: number[] = [];
  const known = new Map<string, number>();
  const indexFor = (point: Vec3): number => {
    const key = `${point.x.toPrecision(12)},${point.y.toPrecision(12)},${point.z.toPrecision(12)}`;
    const existing = known.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length / 3;
    vertices.push(point.x, point.y, point.z);
    known.set(key, index);
    return index;
  };
  for (const face of mesh.triangles) indices.push(indexFor(face.a), indexFor(face.b), indexFor(face.c));
  return api.Manifold.ofMesh(new api.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(vertices),
    triVerts: new Uint32Array(indices),
  }));
}

function manifoldToStl(shape: ManifoldShape, name: string): StlMesh {
  const source = shape.getMesh();
  const triangles: StlTriangle[] = [];
  for (let index = 0; index < source.triVerts.length; index += 3) {
    const point = (vertex: number): Vec3 => {
      const offset = vertex * source.numProp;
      return { x: source.vertProperties[offset], y: source.vertProperties[offset + 1], z: source.vertProperties[offset + 2] };
    };
    const a = point(source.triVerts[index]);
    const b = point(source.triVerts[index + 1]);
    const c = point(source.triVerts[index + 2]);
    triangles.push({ a, b, c, normal: normal(a, b, c) });
  }
  if (!triangles.length) throw new Error('Joining geometry removed an entire split part.');
  return { name, triangles, bounds: computeMeshBounds(triangles) };
}

function partBounds(part: PrintablePart) {
  const min = part.assemblyOffsetMm;
  return {
    min,
    max: {
      x: min.x + part.mesh.bounds.size.x,
      y: min.y + part.mesh.bounds.size.y,
      z: min.z + part.mesh.bounds.size.z,
    },
  };
}

function translateAlongAxis(shape: ManifoldShape, axis: JoinAxis, start: number): ManifoldShape {
  if (axis === 'x') return shape.rotate(0, 90, 0).translate(start, 0, 0);
  if (axis === 'y') return shape.rotate(-90, 0, 0).translate(0, start, 0);
  return shape.translate(0, 0, start);
}

function connectorCentre(left: PrintablePart, right: PrintablePart, axis: JoinAxis): Record<JoinAxis, number> {
  const a = partBounds(left);
  const b = partBounds(right);
  const centre = { x: 0, y: 0, z: 0 } as Record<JoinAxis, number>;
  for (const current of AXES) {
    centre[current] = current === axis
      ? a.max[current]
      : (Math.max(a.min[current], b.min[current]) + Math.min(a.max[current], b.max[current])) / 2;
  }
  return centre;
}

function orientAtJoin(shape: ManifoldShape, axis: JoinAxis, planeMm: number, centre: Record<JoinAxis, number>): ManifoldShape {
  const oriented = translateAlongAxis(shape, axis, planeMm);
  if (axis === 'x') return oriented.translate(0, centre.y, centre.z);
  if (axis === 'y') return oriented.translate(centre.x, 0, centre.z);
  return oriented.translate(centre.x, centre.y, 0);
}

function dovetail(api: ManifoldApi, joint: JoinDescriptor, left: PrintablePart, right: PrintablePart, socket: boolean): ManifoldShape {
  const centre = connectorCentre(left, right, joint.axis);
  const crossAxes = AXES.filter((axis) => axis !== joint.axis);
  const bounds = [partBounds(left), partBounds(right)];
  const spans = crossAxes.map((axis) => Math.min(...bounds.map((bound) => bound.max[axis])) - Math.max(...bounds.map((bound) => bound.min[axis])));
  const wide = Math.min(18, spans[0] - 6);
  const narrow = Math.max(8, wide - 4);
  const height = Math.min(12, spans[1] - 6);
  if (wide <= 0 || height <= 0 || narrow >= spans[0]) throw new Error(`Join ${joint.id} has no safe dovetail margin.`);
  const contour = [[[-narrow / 2, -height / 2], [narrow / 2, -height / 2], [wide / 2, height / 2], [-wide / 2, height / 2]]];
  const section = new api.CrossSection(contour);
  const depth = Math.min(joint.pinDepthMm / 2, 4);
  const shape = socket
    ? section.offset(joint.clearanceMm, 'Miter').extrude(depth + joint.clearanceMm + 0.4)
    : section.extrude(depth + overlapMm);
  return orientAtJoin(shape, joint.axis, socket ? joint.planeMm - joint.clearanceMm : joint.planeMm - overlapMm, centre);
}

function pin(api: ManifoldApi, joint: JoinDescriptor, left: PrintablePart, right: PrintablePart, index: number, socket: boolean): ManifoldShape {
  const centre = connectorCentre(left, right, joint.axis);
  const crossAxes = AXES.filter((axis) => axis !== joint.axis);
  const bounds = [partBounds(left), partBounds(right)];
  const span = Math.min(...bounds.map((bound) => bound.max[crossAxes[0]])) - Math.max(...bounds.map((bound) => bound.min[crossAxes[0]]));
  const spacing = Math.min(span / 4, joint.pinDiameterMm * 3);
  centre[crossAxes[0]] += (index - (joint.pinCount - 1) / 2) * spacing;
  const depth = joint.pinDepthMm / 2;
  const radius = joint.pinDiameterMm / 2 + (socket ? joint.clearanceMm : 0);
  const length = socket ? depth + joint.clearanceMm + 0.4 : depth + overlapMm;
  const cylinder = api.Manifold.cylinder(length, radius, radius, 20);
  return orientAtJoin(cylinder, joint.axis, socket ? joint.planeMm - joint.clearanceMm : joint.planeMm - overlapMm, centre);
}

/** Apply complementary solid connectors in assembly space and return local printable STL parts. */
export async function applyJoiningPlan(split: PrintableSplit, plan: JoiningPlan): Promise<PrintablePart[]> {
  if (plan.version !== 1 || !plan.joints.length) throw new Error('A valid joining plan is required before connector geometry can be generated.');
  if (plan.mode === 'clips') throw new Error('Removable clips need a separate connector STL and are not available in this export yet.');
  const api = await getManifold();
  const states = new Map<number, ManifoldShape>();
  const source = new Map(split.parts.map((part) => [part.partNumber, part]));
  try {
    for (const part of split.parts) {
      states.set(part.partNumber, stlToManifold(part.mesh, api).translate(part.assemblyOffsetMm.x, part.assemblyOffsetMm.y, part.assemblyOffsetMm.z));
    }
    for (const joint of plan.joints) {
      const left = source.get(joint.leftPartNumber);
      const right = source.get(joint.rightPartNumber);
      const leftShape = states.get(joint.leftPartNumber);
      const rightShape = states.get(joint.rightPartNumber);
      if (!left || !right || !leftShape || !rightShape) throw new Error(`Join ${joint.id} references a missing split part.`);
      let nextLeft = leftShape;
      let nextRight = rightShape;
      if (joint.hasDovetail) {
        nextLeft = nextLeft.add(dovetail(api, joint, left, right, false));
        nextRight = nextRight.subtract(dovetail(api, joint, left, right, true));
      }
      for (let index = 0; index < joint.pinCount; index++) {
        nextLeft = nextLeft.add(pin(api, joint, left, right, index, false));
        nextRight = nextRight.subtract(pin(api, joint, left, right, index, true));
      }
      states.set(joint.leftPartNumber, nextLeft);
      states.set(joint.rightPartNumber, nextRight);
    }
    return split.parts.map((part) => {
      const world = states.get(part.partNumber)!;
      const local = world.translate(-part.assemblyOffsetMm.x, -part.assemblyOffsetMm.y, -part.assemblyOffsetMm.z);
      const mesh = manifoldToStl(local, part.mesh.name);
      validateWatertightMesh(mesh);
      return { ...part, mesh };
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `Could not generate safe connector geometry: ${error.message}` : 'Could not generate safe connector geometry.');
  } finally {
    for (const shape of states.values()) shape.delete?.();
  }
}
