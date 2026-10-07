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


export function createTubeMesh(
  outerDiameterMm: number,
  innerDiameterMm: number,
  heightMm: number,
  segments = 64,
  name = 'tube',
): StlMesh {
  const outerRadius = Math.max(0.1, outerDiameterMm / 2);
  const innerRadius = Math.max(0.05, Math.min(innerDiameterMm / 2, outerRadius - 0.05));
  const z = Math.max(0.1, heightMm);
  const count = Math.max(12, Math.min(256, Math.floor(segments)));
  const triangles: StlTriangle[] = [];

  for (let index = 0; index < count; index += 1) {
    const a0 = (index / count) * Math.PI * 2;
    const a1 = ((index + 1) / count) * Math.PI * 2;

    const ob0 = { x: Math.cos(a0) * outerRadius, y: Math.sin(a0) * outerRadius, z: 0 };
    const ob1 = { x: Math.cos(a1) * outerRadius, y: Math.sin(a1) * outerRadius, z: 0 };
    const ot0 = { x: ob0.x, y: ob0.y, z };
    const ot1 = { x: ob1.x, y: ob1.y, z };

    const ib0 = { x: Math.cos(a0) * innerRadius, y: Math.sin(a0) * innerRadius, z: 0 };
    const ib1 = { x: Math.cos(a1) * innerRadius, y: Math.sin(a1) * innerRadius, z: 0 };
    const it0 = { x: ib0.x, y: ib0.y, z };
    const it1 = { x: ib1.x, y: ib1.y, z };

    triangles.push(triangle(ob0, ob1, ot1));
    triangles.push(triangle(ob0, ot1, ot0));

    triangles.push(triangle(ib0, it1, ib1));
    triangles.push(triangle(ib0, it0, it1));

    triangles.push(triangle(ot0, ot1, it1));
    triangles.push(triangle(ot0, it1, it0));

    triangles.push(triangle(ob0, ib1, ob1));
    triangles.push(triangle(ob0, ib0, ib1));
  }

  return mesh(name, triangles);
}

export function createRectangularFrameMesh(
  outerWidthMm: number,
  outerDepthMm: number,
  innerWidthMm: number,
  innerDepthMm: number,
  heightMm: number,
  name = 'rectangular-frame',
): StlMesh {
  const ow = Math.max(0.2, outerWidthMm);
  const od = Math.max(0.2, outerDepthMm);
  const iw = Math.max(0.1, Math.min(innerWidthMm, ow - 0.1));
  const id = Math.max(0.1, Math.min(innerDepthMm, od - 0.1));
  const z = Math.max(0.1, heightMm);

  const outerBottom = [
    { x: -ow / 2, y: -od / 2, z: 0 },
    { x: ow / 2, y: -od / 2, z: 0 },
    { x: ow / 2, y: od / 2, z: 0 },
    { x: -ow / 2, y: od / 2, z: 0 },
  ];
  const outerTop = outerBottom.map((point) => ({ ...point, z }));
  const innerBottom = [
    { x: -iw / 2, y: -id / 2, z: 0 },
    { x: iw / 2, y: -id / 2, z: 0 },
    { x: iw / 2, y: id / 2, z: 0 },
    { x: -iw / 2, y: id / 2, z: 0 },
  ];
  const innerTop = innerBottom.map((point) => ({ ...point, z }));

  const triangles: StlTriangle[] = [];
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;

    triangles.push(triangle(outerBottom[index], outerBottom[next], outerTop[next]));
    triangles.push(triangle(outerBottom[index], outerTop[next], outerTop[index]));

    triangles.push(triangle(innerBottom[index], innerTop[next], innerBottom[next]));
    triangles.push(triangle(innerBottom[index], innerTop[index], innerTop[next]));

    triangles.push(triangle(outerTop[index], outerTop[next], innerTop[next]));
    triangles.push(triangle(outerTop[index], innerTop[next], innerTop[index]));

    triangles.push(triangle(outerBottom[index], innerBottom[next], outerBottom[next]));
    triangles.push(triangle(outerBottom[index], innerBottom[index], innerBottom[next]));
  }

  return mesh(name, triangles);
}
