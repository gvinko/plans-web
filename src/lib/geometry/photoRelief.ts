import { computeMeshBounds, type StlMesh, type StlTriangle, type Vec3 } from '../stl/stl';

export interface ReliefOptions {
  widthMm: number;
  baseThicknessMm: number;
  reliefDepthMm: number;
  resolution: number;
  invert: boolean;
}

function tri(a: Vec3, b: Vec3, c: Vec3): StlTriangle {
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

export async function createPhotoReliefMesh(file: File, options: ReliefOptions): Promise<StlMesh> {
  const bitmap = await createImageBitmap(file);
  try {
    const resolutionX = Math.max(16, Math.min(180, Math.floor(options.resolution)));
    const aspect = bitmap.height / Math.max(1, bitmap.width);
    const resolutionY = Math.max(12, Math.round(resolutionX * aspect));

    const canvas = document.createElement('canvas');
    canvas.width = resolutionX;
    canvas.height = resolutionY;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create image sampling canvas.');

    ctx.drawImage(bitmap, 0, 0, resolutionX, resolutionY);
    const data = ctx.getImageData(0, 0, resolutionX, resolutionY).data;

    const widthMm = Math.max(10, options.widthMm);
    const heightMm = widthMm * aspect;
    const base = Math.max(0.4, options.baseThicknessMm);
    const relief = Math.max(0.1, options.reliefDepthMm);

    const xStep = widthMm / (resolutionX - 1);
    const yStep = heightMm / (resolutionY - 1);

    const zAt = (x: number, y: number): number => {
      const idx = (y * resolutionX + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const value = options.invert ? 1 - luminance : luminance;
      return base + value * relief;
    };

    const point = (x: number, y: number): Vec3 => ({
      x: x * xStep - widthMm / 2,
      y: y * yStep - heightMm / 2,
      z: zAt(x, y),
    });

    const triangles: StlTriangle[] = [];

    for (let y = 0; y < resolutionY - 1; y += 1) {
      for (let x = 0; x < resolutionX - 1; x += 1) {
        const p00 = point(x, y);
        const p10 = point(x + 1, y);
        const p11 = point(x + 1, y + 1);
        const p01 = point(x, y + 1);
        triangles.push(tri(p00, p10, p11));
        triangles.push(tri(p00, p11, p01));
      }
    }

    const bl = { x: -widthMm / 2, y: -heightMm / 2, z: 0 };
    const br = { x: widthMm / 2, y: -heightMm / 2, z: 0 };
    const tr = { x: widthMm / 2, y: heightMm / 2, z: 0 };
    const tl = { x: -widthMm / 2, y: heightMm / 2, z: 0 };
    triangles.push(tri(bl, tr, br));
    triangles.push(tri(bl, tl, tr));

    const addWall = (topA: Vec3, topB: Vec3, bottomA: Vec3, bottomB: Vec3) => {
      triangles.push(tri(bottomA, bottomB, topB));
      triangles.push(tri(bottomA, topB, topA));
    };

    for (let x = 0; x < resolutionX - 1; x += 1) {
      const topA = point(x, 0);
      const topB = point(x + 1, 0);
      addWall(topA, topB, { ...topA, z: 0 }, { ...topB, z: 0 });

      const bottomA = point(x, resolutionY - 1);
      const bottomB = point(x + 1, resolutionY - 1);
      addWall(bottomB, bottomA, { ...bottomB, z: 0 }, { ...bottomA, z: 0 });
    }

    for (let y = 0; y < resolutionY - 1; y += 1) {
      const leftA = point(0, y);
      const leftB = point(0, y + 1);
      addWall(leftB, leftA, { ...leftB, z: 0 }, { ...leftA, z: 0 });

      const rightA = point(resolutionX - 1, y);
      const rightB = point(resolutionX - 1, y + 1);
      addWall(rightA, rightB, { ...rightA, z: 0 }, { ...rightB, z: 0 });
    }

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo-relief';
    return {
      name,
      triangles,
      bounds: computeMeshBounds(triangles),
    };
  } finally {
    bitmap.close();
  }
}
