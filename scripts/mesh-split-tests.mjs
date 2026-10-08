/**
 * No extra test-runner dependency: load the project's TypeScript geometry files
 * with the already-installed TypeScript compiler, then check topology and fit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();

function loadTypescript(filename) {
  const file = resolve(root, filename);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    fileName: file,
  }).outputText;
  const relativeRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw Error('Unexpected module: ' + specifier);
    return loadTypescript(resolve(dirname(file), specifier + '.ts'));
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, relativeRequire);
  return module.exports;
}

const { computeMeshBounds, exportBinaryStl, parseStlFile } = loadTypescript('src/lib/stl/stl.ts');
const { cutWatertightMesh, splitMeshForPrinter, validateWatertightMesh } =
  loadTypescript('src/lib/printers/meshSplitter.ts');
const printer = {
  id: 'test-ender-3',
  name: 'Ender 3',
  manufacturer: 'Creality',
  buildVolumeMm: { x: 220, y: 220, z: 250 },
  defaultFitClearanceMm: 0.25,
  nozzleDiameterMm: 0.4,
};

function cube(w, h, d, ox = 0, oy = 0, oz = 0) {
  const p = (x, y, z) => ({ x: x + ox, y: y + oy, z: z + oz });
  const faces = [];
  function face(a, b, c, last) {
    for (const [x, y, z] of [[a, b, c], [a, c, last]]) {
      faces.push({ a: x, b: y, c: z, normal: { x: 0, y: 0, z: 0 } });
    }
  }
  face(p(0, 0, 0), p(0, h, 0), p(w, h, 0), p(w, 0, 0));
  face(p(0, 0, d), p(w, 0, d), p(w, h, d), p(0, h, d));
  face(p(0, 0, 0), p(w, 0, 0), p(w, 0, d), p(0, 0, d));
  face(p(0, h, 0), p(0, h, d), p(w, h, d), p(w, h, 0));
  face(p(0, 0, 0), p(0, 0, d), p(0, h, d), p(0, h, 0));
  face(p(w, 0, 0), p(w, h, 0), p(w, h, d), p(w, 0, d));
  return { name: 'test-box', triangles: faces, bounds: computeMeshBounds(faces) };
}

let successes = 0;
function test(name, action) {
  try {
    action();
    successes += 1;
    console.log('PASS ' + name);
  } catch (error) {
    process.exitCode = 1;
    console.error('FAIL ' + name, error);
  }
}

test('input cube is watertight', () => validateWatertightMesh(cube(300, 100, 25)));
test('one cut is capped on both sides', () => {
  const [left, right] = cutWatertightMesh(cube(300, 100, 25), 'x', 150);
  assert.equal(left.bounds.size.x, 150);
  assert.equal(right.bounds.size.x, 150);
  assert.ok(left.triangles.length > 12);
  validateWatertightMesh(left);
  validateWatertightMesh(right);
});
test('one-axis split exports two bed-fitting meshes', () => {
  const result = splitMeshForPrinter(cube(300, 100, 25), printer);
  assert.equal(result.parts.length, 2);
  result.parts.forEach((part) => {
    assert.ok(part.mesh.bounds.size.x < printer.buildVolumeMm.x);
    assert.equal(part.mesh.bounds.min.x, 0);
    validateWatertightMesh(part.mesh);
  });
});
test('two-axis split exports four bed-fitting meshes', () => {
  const result = splitMeshForPrinter(cube(300, 300, 25), printer);
  assert.equal(result.parts.length, 4);
  result.parts.forEach((part) => {
    assert.ok(part.mesh.bounds.size.x < printer.buildVolumeMm.x);
    assert.ok(part.mesh.bounds.size.y < printer.buildVolumeMm.y);
    validateWatertightMesh(part.mesh);
  });
});
test('three-axis split exports eight watertight meshes', () => {
  const result = splitMeshForPrinter(cube(300, 300, 300), printer);
  assert.equal(result.parts.length, 8);
  result.parts.forEach((part) => {
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(part.mesh.bounds.size[axis] < printer.buildVolumeMm[axis]);
    }
    validateWatertightMesh(part.mesh);
  });
});
test('small model does not require cutting', () => {
  const result = splitMeshForPrinter(cube(100, 80, 40), printer);
  assert.equal(result.plan.required, false);
  assert.equal(result.parts.length, 0);
});
test('open STL cannot be exported', () => {
  const bad = cube(300, 100, 25);
  bad.triangles.pop();
  assert.throws(() => splitMeshForPrinter(bad, printer), /open|non-manifold/);
});
test('disconnected sections are rejected rather than silently capped', () => {
  const a = cube(300, 40, 30, 0, 0, 0);
  const b = cube(300, 40, 30, 0, 100, 0);
  const triangles = [...a.triangles, ...b.triangles];
  const combined = { name: 'two islands', triangles, bounds: computeMeshBounds(triangles) };
  assert.throws(() => splitMeshForPrinter(combined, printer), /multiple islands|contour/);
});
test('cut at model boundary is rejected', () => {
  assert.throws(() => cutWatertightMesh(cube(300, 50, 30), 'x', 0), /inside/);
});
try {
  const result = splitMeshForPrinter(cube(300, 300, 25), printer);
  for (const part of result.parts) {
    const file = exportBinaryStl(part.mesh, part.mesh.name + '.stl');
    assert.ok(file.size > 84);
    assert.ok(file.name.endsWith('.stl'));
    const restored = await parseStlFile(file);
    assert.equal(restored.triangles.length, part.mesh.triangles.length);
    validateWatertightMesh(restored);
  }
  successes += 1;
  console.log('PASS real binary STL part export/import round-trip');
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL real binary STL part export/import round-trip', error);
}
console.log(successes + ' geometry regression tests passed');
