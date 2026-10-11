/**
 * No extra test-runner dependency: load the project's TypeScript geometry files
 * with the already-installed TypeScript compiler, then check topology and fit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const manifoldModule = await import('manifold-3d/manifold.js');
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
    if (specifier === 'manifold-3d/manifold.js') return manifoldModule;
    if (!specifier.startsWith('.')) throw Error('Unexpected module: ' + specifier);
    return loadTypescript(resolve(dirname(file), specifier + '.ts'));
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, relativeRequire);
  return module.exports;
}

const { computeMeshBounds, exportBinaryStl, parseStlFile, transformMesh, isValidMeshTransform, MAX_STL_FILE_BYTES } = loadTypescript('src/lib/stl/stl.ts');
const { cutWatertightMesh, splitMeshForPrinter, validateWatertightMesh } =
  loadTypescript('src/lib/printers/meshSplitter.ts');
const { stlSplitSourceKey } = loadTypescript('src/lib/printers/splitSourceKey.ts');
const { isValidProfile, saveSelectedPrinterId, loadSelectedPrinterId } = loadTypescript('src/lib/printers/customProfiles.ts');
const { createJoiningPlan } = loadTypescript('src/lib/printers/joinPlanner.ts');
const { applyJoiningPlan } = loadTypescript('src/lib/printers/joinGeometry.ts');
const { recoverSavedJoiningParts } = loadTypescript('src/lib/printers/joinRecovery.ts');
const { restoreUnjoinedParts } = loadTypescript('src/lib/printers/joinState.ts');
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

function cylinder(diameter, depth, segments = 256) {
  const radius = diameter / 2;
  const faces = [];
  const p = (index, z) => {
    const theta = 2 * Math.PI * index / segments;
    return { x: radius + radius * Math.cos(theta), y: radius + radius * Math.sin(theta), z };
  };
  const add = (a, b, c) => faces.push({ a, b, c, normal: { x: 0, y: 0, z: 0 } });
  for (let i = 0; i < segments; i++) {
    const a = p(i, 0), b = p(i + 1, 0), c = p(i, depth), d = p(i + 1, depth);
    add(a, b, d); add(a, d, c);
    add({ x: radius, y: radius, z: 0 }, b, a);
    add({ x: radius, y: radius, z: depth }, c, d);
  }
  return { name: 'test-cylinder', triangles: faces, bounds: computeMeshBounds(faces) };
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

test('split-source key invalidates changed transform or printer', () => {
  const saved = { scaleX: 1, scaleY: 1, scaleZ: 1, rotateXDeg: 0, rotateYDeg: 0, rotateZDeg: 0 };
  const first = stlSplitSourceKey('asset-1', saved, printer);
  assert.equal(first, stlSplitSourceKey('asset-1', { ...saved }, { ...printer }));
  assert.notEqual(first, stlSplitSourceKey('asset-1', { ...saved, rotateZDeg: 30 }, printer));
  assert.notEqual(first, stlSplitSourceKey('asset-2', saved, printer));
  assert.notEqual(first, stlSplitSourceKey('asset-1', saved, { ...printer, buildVolumeMm: { ...printer.buildVolumeMm, x: 200 } }));
});
test('custom printer dimensions must be positive finite values', () => {
  assert.equal(isValidProfile(printer), true);
  assert.equal(isValidProfile({ ...printer, buildVolumeMm: { ...printer.buildVolumeMm, x: -10 } }), false);
  assert.equal(isValidProfile({ ...printer, buildVolumeMm: { ...printer.buildVolumeMm, x: NaN } }), false);
  assert.equal(isValidProfile({ ...printer, nozzleDiameterMm: 0 }), false);
});
test('selected printer survives reopen and safely falls back when deleted', () => {
  const original = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    saveSelectedPrinterId('custom-printer');
    assert.equal(loadSelectedPrinterId([printer, { ...printer, id: 'custom-printer' }]), 'custom-printer');
    assert.equal(loadSelectedPrinterId([printer]), printer.id);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
test('input cube is watertight', () => validateWatertightMesh(cube(300, 100, 25)));
test('inside-out solid reports meaningful error', () => {
  const bad = cube(300, 100, 25);
  for (const face of bad.triangles) [face.b, face.c] = [face.c, face.b];
  assert.throws(() => validateWatertightMesh(bad), /inside-out/i);
});
test('Infinity and NaN transforms are rejected', () => {
  const safe = { scaleX: 1, scaleY: 1, scaleZ: 1, rotateXDeg: 0, rotateYDeg: 0, rotateZDeg: 0 };
  assert.equal(isValidMeshTransform(safe), true);
  for (const value of [Infinity, NaN, 1e308]) {
    const unsafe = { ...safe, rotateXDeg: value };
    assert.equal(isValidMeshTransform(unsafe), false);
    assert.throws(() => transformMesh(cube(10, 10, 10), unsafe), /invalid/i);
  }
});
test('NaN in exported mesh is blocked', () => {
  const bad = cube(10, 10, 10);
  bad.triangles[0].a.x = NaN;
  assert.throws(() => exportBinaryStl(bad), /invalid/i);
});
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
test('three pieces along one axis all fit and reconstruct the full model span', () => {
  const source = cube(600, 80, 30);
  const result = splitMeshForPrinter(source, printer);
  assert.equal(result.parts.length, 3);
  const ordered = [...result.parts].sort((a, b) => a.assemblyOffsetMm.x - b.assemblyOffsetMm.x);
  assert.ok(Math.abs(ordered[0].assemblyOffsetMm.x) < 0.01);
  ordered.forEach((part, i) => {
    const span = part.mesh.bounds.size.x;
    assert.ok(span <= printer.buildVolumeMm.x - 4 + 0.01, 'part ' + i + ' too wide');
    validateWatertightMesh(part.mesh);
    if (i > 0) {
      const previous = ordered[i - 1];
      assert.ok(Math.abs(part.assemblyOffsetMm.x - previous.assemblyOffsetMm.x - previous.mesh.bounds.size.x) < 0.01);
    }
  });
  const last = ordered.at(-1);
  assert.ok(Math.abs(last.assemblyOffsetMm.x + last.mesh.bounds.size.x - 600) < 0.01);
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
test('known limitation: 256-segment cylinder with two axes fails closed (no invalid output)', () => {
  assert.throws(() => splitMeshForPrinter(cylinder(300, 25), printer), /cut|contour|collapsed|orientation|manifold|safe/i);
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
test('joining plan creates complementary keyed join records for every split boundary', () => {
  const split = splitMeshForPrinter(cube(600, 80, 30), printer);
  const plan = createJoiningPlan(split.parts, printer, 'dovetail-pins');
  assert.equal(plan.mode, 'dovetail-pins');
  assert.equal(plan.printerProfileId, printer.id);
  assert.equal(plan.joints.length, 2);
  assert.equal(plan.joints[0].leftPartNumber, 1);
  assert.equal(plan.joints[0].rightPartNumber, 2);
  assert.equal(plan.joints[1].leftPartNumber, 2);
  assert.equal(plan.joints[1].rightPartNumber, 3);
  assert.ok(plan.joints.every((joint) => joint.pinCount === 2));
});
test('joining plan finds every shared boundary in a multi-axis split', () => {
  const split = splitMeshForPrinter(cube(300, 300, 25), printer);
  const plan = createJoiningPlan(split.parts, printer, 'pins');
  assert.equal(plan.joints.length, 4);
  assert.ok(plan.joints.every((joint) => joint.hasDovetail === false));
  assert.equal(new Set(plan.joints.map((joint) => joint.id)).size, 4);
});
test('joining plan rejects unsafe clearance and unsupported boundaries', () => {
  const split = splitMeshForPrinter(cube(300, 100, 25), printer);
  assert.throws(() => createJoiningPlan(split.parts, printer, 'pins', 0), /clearance/i);
  assert.throws(() => createJoiningPlan(split.parts, printer, 'pins', 4), /clearance/i);
  const thin = splitMeshForPrinter(cube(300, 6, 8), printer);
  assert.throws(() => createJoiningPlan(thin.parts, printer, 'dovetail-pins'), /too small|margin/i);
});
try {
  const split = splitMeshForPrinter(cube(300, 80, 30), printer);
  const sourceTriangles = split.parts.map((part) => part.mesh.triangles.length);
  const joined = await applyJoiningPlan(split, createJoiningPlan(split.parts, printer, 'dovetail-pins'));
  assert.equal(joined.length, split.parts.length);
  assert.deepEqual(split.parts.map((part) => part.mesh.triangles.length), sourceTriangles);
  assert.ok(joined.some((part, index) => part.mesh.triangles.length !== sourceTriangles[index]));
  joined.forEach((part) => validateWatertightMesh(part.mesh));
  successes += 1;
  console.log('PASS complementary dovetail and pin geometry is applied without mutating the split');
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL complementary dovetail and pin geometry is applied without mutating the split', error);
}
try {
  const split = splitMeshForPrinter(cube(300, 300, 25), printer);
  const plan = createJoiningPlan(split.parts, printer, 'pins');
  const joined = await applyJoiningPlan(split, plan);
  assert.equal(plan.joints.length, 4);
  assert.equal(joined.length, 4);
  joined.forEach((part) => validateWatertightMesh(part.mesh));
  successes += 1;
  console.log('PASS pin joins remain watertight across every boundary in a multi-axis split');
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL pin joins remain watertight across every boundary in a multi-axis split', error);
}
try {
  const split = splitMeshForPrinter(cube(300, 80, 30), printer);
  const joined = await applyJoiningPlan(split, createJoiningPlan(split.parts, printer, 'dovetail-pins'));
  const restored = restoreUnjoinedParts(split);
  assert.notDeepEqual(joined.map((part) => part.mesh.triangles.length), restored.map((part) => part.mesh.triangles.length));
  assert.deepEqual(restored.map((part) => part.mesh.triangles.length), split.parts.map((part) => part.mesh.triangles.length));
  restored.forEach((part) => validateWatertightMesh(part.mesh));
  successes += 1;
  console.log('PASS changing join settings restores clean unjoined printable parts');
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL changing join settings restores clean unjoined printable parts', error);
}
try {
  const source = cube(300, 80, 30);
  const transform = { scaleX: 1.1, scaleY: 1, scaleZ: 1, rotateXDeg: 0, rotateYDeg: 0, rotateZDeg: 0 };
  const split = splitMeshForPrinter(transformMesh(source, transform), printer);
  const plan = createJoiningPlan(split.parts, printer, 'dovetail-pins');
  const recovered = await recoverSavedJoiningParts(source, transform, printer, plan);
  assert.equal(recovered.parts.length, split.parts.length);
  assert.equal(recovered.plan.joints.length, plan.joints.length);
  recovered.parts.forEach((part) => validateWatertightMesh(part.mesh));
  successes += 1;
  console.log('PASS saved joining plans recover matching transformed printable parts');
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL saved joining plans recover matching transformed printable parts', error);
}
try {
  const source = cube(300, 80, 30);
  const transform = { scaleX: 1, scaleY: 1, scaleZ: 1, rotateXDeg: 0, rotateYDeg: 0, rotateZDeg: 0 };
  const split = splitMeshForPrinter(source, printer);
  const plan = createJoiningPlan(split.parts, printer, 'pins');
  const differentPrinter = { ...printer, id: 'test-printer-with-different-profile' };
  await assert.rejects(() => recoverSavedJoiningParts(source, transform, differentPrinter, plan), /printer profile/i);
  successes += 1;
  console.log('PASS saved joining plans reject a different printer profile');
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL saved joining plans reject a different printer profile', error);
}
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
async function asyncTest(name, action) {
  try { await action(); successes += 1; console.log('PASS ' + name); }
  catch (error) { process.exitCode = 1; console.error('FAIL ' + name, error); }
}
await asyncTest('binary STL with non-finite vertex is rejected', async () => {
  const bytes = new ArrayBuffer(134);
  const view = new DataView(bytes);
  view.setUint32(80, 1, true);
  view.setFloat32(96, NaN, true);
  await assert.rejects(() => parseStlFile(new File([bytes], 'bad.stl')), /invalid/i);
});
await asyncTest('implausibly large random binary coordinates are rejected', async () => {
  const bytes = new ArrayBuffer(134);
  const view = new DataView(bytes);
  view.setUint32(80, 1, true);
  view.setFloat32(96, 4e33, true);
  await assert.rejects(() => parseStlFile(new File([bytes], 'junk.stl')), /invalid|implausibly/i);
});
await asyncTest('100 MB import size guard rejects before decoding', async () => {
  const fakeFile = { name: 'large.stl', size: MAX_STL_FILE_BYTES + 1, arrayBuffer: () => { throw Error('Should not read'); } };
  await assert.rejects(() => parseStlFile(fakeFile), /100 MB/);
});
console.log(successes + ' geometry regression tests passed');
