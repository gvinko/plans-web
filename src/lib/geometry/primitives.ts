import { computeMeshBounds, type StlMesh, type StlTriangle, type Vec3 } from '../stl/stl';

function triangle(a: Vec3, b: Vec3, c: Vec3): StlTriangle {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return { a, b, c, normal: { x: nx / length, y: ny / length, z: nz / length } };
}

function mesh(name: string, triangles: StlTriangle[]): StlMesh {
  return { name, triangles, bounds: computeMeshBounds(triangles) };
}

export function createBoxMesh(widthMm: number, depthMm: number, heightMm: number, name = 'box'): StlMesh {
  const x = Math.max(0.1, widthMm);
  const y = Math.max(0.1, depthMm);
  const z = Math.max(0.1, heightMm);
  const hx = x / 2;
  const hy = y / 2;

  const p000 = { x: -hx, y: -hy, z: 0 };
  const p100 = { x: hx, y: -hy, z: 0 };
  const p110 = { x: hx, y: hy, z: 0 };
  const p010 = { x: -hx, y: hy, z: 0 };
  const p001 = { x: -hx, y: -hy, z };
  const p101 = { x: hx, y: -hy, z };
  const p111 = { x: hx, y: hy, z };
  const p011 = { x: -hx, y: hy, z };

  const triangles = [
    triangle(p000, p110, p100), triangle(p000, p010, p110),
    triangle(p001, p101, p111), triangle(p001, p111, p011),
    triangle(p000, p100, p101), triangle(p000, p101, p001),
    triangle(p100, p110, p111), triangle(p100, p111, p101),
    triangle(p110, p010, p011), triangle(p110, p011, p111),
    triangle(p010, p000, p001), triangle(p010, p001, p011),
  ];

  return mesh(name, triangles);
}

export function createCylinderMesh(
  diameterMm: number,
  heightMm: number,
  segments = 64,
  name = 'cylinder',
): StlMesh {
  const radius = Math.max(0.05, diameterMm / 2);
  const z = Math.max(0.1, heightMm);
  const count = Math.max(12, Math.min(256, Math.floor(segments)));
  const triangles: StlTriangle[] = [];
  const bottomCenter = { x: 0, y: 0, z: 0 };
  const topCenter = { x: 0, y: 0, z };

  for (let index = 0; index < count; index += 1) {
    const a0 = (index / count) * Math.PI * 2;
    const a1 = ((index + 1) / count) * Math.PI * 2;
    const b0 = { x: Math.cos(a0) * radius, y: Math.sin(a0) * radius, z: 0 };
    const b1 = { x: Math.cos(a1) * radius, y: Math.sin(a1) * radius, z: 0 };
    const t0 = { x: b0.x, y: b0.y, z };
    const t1 = { x: b1.x, y: b1.y, z };

    triangles.push(triangle(bottomCenter, b1, b0));
    triangles.push(triangle(topCenter, t0, t1));
    triangles.push(triangle(b0, b1, t1));
    triangles.push(triangle(b0, t1, t0));
  }

  return mesh(name, triangles);
}
