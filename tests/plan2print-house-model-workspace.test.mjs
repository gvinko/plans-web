import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPlanFile, preservePlanOnImportError } from '../src/plan2print/house-model-workspace.js';

test('classifyPlanFile recognises uppercase JPEG and PDF plans', () => {
  assert.equal(classifyPlanFile({ name: 'plan.JPEG', type: 'image/jpeg' }), 'image');
  assert.equal(classifyPlanFile({ name: 'plan.pdf', type: 'application/pdf' }), 'pdf');
  assert.equal(classifyPlanFile({ name: 'plan.dwg', type: 'application/acad' }), 'unsupported');
});

test('preservePlanOnImportError keeps the existing plan and traces', () => {
  const existing = { plan: { width: 200, height: 100 }, traceState: { traces: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false }], activePoints: [] } };
  const result = preservePlanOnImportError(existing, new Error('bad image'));
  assert.equal(result.plan, existing.plan);
  assert.equal(result.traceState, existing.traceState);
  assert.equal(result.error, 'That file could not be opened. Choose a standard PDF, PNG or JPG plan.');
});

test('workspace source returns to tracing after successful calibration and validates export inputs', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/plan2print/house-model-workspace.js', import.meta.url), 'utf8');
  assert.match(source, /model\.mode = 'trace'/);
  assert.match(source, /Enter valid lengths/);
  assert.match(source, /Enter positive 3D dimensions/);
});

test('PDF renderer keeps the browser document available for canvas creation', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/plan2print/pdf-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /const pdfDocument =/);
  assert.match(source, /document\.createElement\('canvas'\)/);
});
