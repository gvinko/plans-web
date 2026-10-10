export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface StlTriangle {
  normal: Vec3;
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

export interface MeshBounds {
  min: Vec3;
  max: Vec3;
  size: Vec3;
}

export interface StlMesh {
  name: string;
  triangles: StlTriangle[];
  bounds: MeshBounds;
}

export interface MeshTransform {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotateXDeg: number;
  rotateYDeg: number;
  rotateZDeg: number;
}

// Imported STL data is untrusted. Limits keep corrupted files from exhausting the browser.
export const MAX_STL_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_STL_TRIANGLES = 2_000_000;
const MAX_COORDINATE_MM = 10_000_000;

function assertFiniteVector(v: Vec3, label: string): void {
  if (![v.x, v.y, v.z].every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE_MM)) {
    throw new Error(label + ' contains invalid or implausibly large coordinates.');
  }
}

export function isValidMeshTransform(value: MeshTransform): boolean {
  if (!value) return false;
  return (['scaleX', 'scaleY', 'scaleZ'] as const).every((axis) =>
    Number.isFinite(value[axis]) && value[axis] > 0 && value[axis] <= 1_000_000)
    && (['rotateXDeg', 'rotateYDeg', 'rotateZDeg'] as const).every((axis) =>
      Number.isFinite(value[axis]) && Math.abs(value[axis]) <= 1_000_000);
}

function emptyBounds(): MeshBounds {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0, y: 0, z: 0 },
    size: { x: 0, y: 0, z: 0 },
  };
}

export function computeMeshBounds(triangles: StlTriangle[]): MeshBounds {
  if (triangles.length === 0) return emptyBounds();

  const min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
  const max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };

  for (const triangle of triangles) {
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      assertFiniteVector(vertex, 'STL mesh');
      min.x = Math.min(min.x, vertex.x);
      min.y = Math.min(min.y, vertex.y);
      min.z = Math.min(min.z, vertex.z);
      max.x = Math.max(max.x, vertex.x);
      max.y = Math.max(max.y, vertex.y);
      max.z = Math.max(max.z, vertex.z);
    }
  }

  return {
    min,
    max,
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };
}

function parseBinaryStl(buffer: ArrayBuffer, name: string): StlMesh {
  if (buffer.byteLength < 84) throw new Error('STL file is too small to be valid.');
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const expectedLength = 84 + count * 50;
  if (count === 0 || count > MAX_STL_TRIANGLES || expectedLength > buffer.byteLength) {
    throw new Error('Binary STL triangle table is invalid or truncated.');
  }

  const triangles: StlTriangle[] = [];
  let offset = 84;
  const readVec = (): Vec3 => {
    const value = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    assertFiniteVector(value, 'Binary STL');
    return value;
  };

  for (let index = 0; index < count; index += 1) {
    const normal = readVec();
    const a = readVec();
    const b = readVec();
    const c = readVec();
    offset += 2;
    triangles.push({ normal, a, b, c });
  }

  return { name, triangles, bounds: computeMeshBounds(triangles) };
}

function parseAsciiStl(text: string, name: string): StlMesh {
  const vertexPattern = /vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/gi;
  const vertices: Vec3[] = [];
  let match: RegExpExecArray | null;

  while ((match = vertexPattern.exec(text)) !== null) {
    const vertex = { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
    if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) {
      throw new Error('ASCII STL contains an invalid vertex.');
    }
    if (vertices.length >= MAX_STL_TRIANGLES * 3) throw new Error('STL exceeds the triangle limit.');
    assertFiniteVector(vertex, 'ASCII STL');
    vertices.push(vertex);
  }

  if (vertices.length === 0 || vertices.length % 3 !== 0) {
    throw new Error('ASCII STL does not contain complete triangle vertices.');
  }

  const triangles: StlTriangle[] = [];
  for (let index = 0; index < vertices.length; index += 3) {
    const a = vertices[index];
    const b = vertices[index + 1];
    const c = vertices[index + 2];
    triangles.push({ normal: calculateNormal(a, b, c), a, b, c });
  }

  return { name, triangles, bounds: computeMeshBounds(triangles) };
}

export async function parseStlFile(file: File): Promise<StlMesh> {
  if (file.size > MAX_STL_FILE_BYTES) throw new Error('STL is larger than the 100 MB import limit.');
  const buffer = await file.arrayBuffer();
  const name = file.name.replace(/\.stl$/i, '') || 'Imported STL';

  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer);
    const count = view.getUint32(80, true);
    const expectedLength = 84 + count * 50;
    if (count > MAX_STL_TRIANGLES) throw new Error('STL exceeds the 2 million triangle limit.');
    if (count > 0 && expectedLength === buffer.byteLength) {
      return parseBinaryStl(buffer, name);
    }
  }

  const text = new TextDecoder().decode(buffer);
  if (!/^\s*solid\b/i.test(text) || !/\bfacet\b/i.test(text)) {
    // Some binary STL exporters append bytes after the triangle table. Try binary before rejecting.
    if (buffer.byteLength >= 84) return parseBinaryStl(buffer, name);
    throw new Error('Unsupported or invalid STL file.');
  }
  return parseAsciiStl(text, name);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function rotatePoint(point: Vec3, transform: MeshTransform): Vec3 {
  let x = point.x * transform.scaleX;
  let y = point.y * transform.scaleY;
  let z = point.z * transform.scaleZ;

  const rx = radians(transform.rotateXDeg);
  const ry = radians(transform.rotateYDeg);
  const rz = radians(transform.rotateZDeg);

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];

  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  [x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY];

  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  [x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ];

  return { x, y, z };
}

export function transformMesh(mesh: StlMesh, transform: MeshTransform): StlMesh {
  if (!isValidMeshTransform(transform)) throw new Error('STL transform contains invalid scale or rotation values.');
  const triangles = mesh.triangles.map((triangle) => {
    const a = rotatePoint(triangle.a, transform);
    const b = rotatePoint(triangle.b, transform);
    const c = rotatePoint(triangle.c, transform);
    return { a, b, c, normal: calculateNormal(a, b, c) };
  });

  return {
    name: mesh.name,
    triangles,
    bounds: computeMeshBounds(triangles),
  };
}

function calculateNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;

  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

export function exportBinaryStl(mesh: StlMesh, filename = mesh.name): File {
  if (mesh.triangles.length === 0 || mesh.triangles.length > MAX_STL_TRIANGLES) {
    throw new Error('STL has an invalid number of triangles for export.');
  }
  // Always verify actual vertices (not just potentially stale cached bounds).
  const bounds = computeMeshBounds(mesh.triangles);
  for (const value of Object.values(bounds.size)) {
    if (!Number.isFinite(value)) throw new Error('Cannot export an STL with invalid mesh bounds.');
  }
  for (const face of mesh.triangles) assertFiniteVector(face.normal, 'STL normal');
  const buffer = new ArrayBuffer(84 + mesh.triangles.length * 50);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode('Plans to Print binary STL');
  bytes.set(header.slice(0, 80), 0);
  view.setUint32(80, mesh.triangles.length, true);

  let offset = 84;
  const writeVec = (value: Vec3) => {
    view.setFloat32(offset, value.x, true);
    view.setFloat32(offset + 4, value.y, true);
    view.setFloat32(offset + 8, value.z, true);
    offset += 12;
  };

  for (const triangle of mesh.triangles) {
    writeVec(triangle.normal);
    writeVec(triangle.a);
    writeVec(triangle.b);
    writeVec(triangle.c);
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  const safeName = filename.trim().replace(/[^a-z0-9._-]+/gi, '-') || 'plans-to-print-model';
  return new File([buffer], safeName.toLowerCase().endsWith('.stl') ? safeName : `${safeName}.stl`, {
    type: 'model/stl',
  });
}
