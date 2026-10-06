import { addTracePoint, buildAsciiStl, buildSvg, calibrate, createTraceState, finishTrace, undoTrace, verifyScale } from './house-model-core.js';

const IMPORT_ERROR = 'That file could not be opened. Choose a standard PDF, PNG or JPG plan.';

export function classifyPlanFile(file) {
  const name = (file?.name || '').toLowerCase();
  if (file?.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file?.type === 'image/png' || file?.type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name)) return 'image';
  return 'unsupported';
}

export function preservePlanOnImportError(existing, error) {
  return { ...existing, error: error ? IMPORT_ERROR : '' };
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image read failed')); };
    image.src = url;
  });
}

export function mountHouseModelWorkspace({ host, downloads = download }) {
  let model = { plan: null, traceState: createTraceState(), calibrationPoints: [], pixelsPerMm: null, mode: 'trace', error: '' };
  host.innerHTML = `<section class="house-model" id="house-model"><h2>House Model</h2><p>Import a plan, calibrate from a known dimension, then trace walls. Exports stay on this device.</p><label>Floor plan file <input data-file type="file" accept="application/pdf,image/png,image/jpeg" capture="environment"></label><div class="house-actions"><button data-mode="calibrate">Calibrate</button><button data-mode="trace">Trace walls</button><button data-finish>Finish trace</button><button data-close>Close room</button><button data-undo>Undo</button><button data-reset>Reset plan</button></div><label>Known calibration length (mm) <input data-calibration type="number" min="1" value="1000"></label><canvas data-canvas aria-label="House plan tracing canvas"></canvas><p data-status role="status"></p><fieldset><legend>Verify 1:100</legend><label>Real wall length (mm) <input data-real type="number" min="1" value="2500"></label><label>Measured print length (mm) <input data-measured type="number" min="0" step="0.1" value="25"></label><button data-verify>Verify scale</button><output data-verification></output></fieldset><fieldset><legend>3D shell settings</legend><label>Wall height (mm) <input data-height type="number" value="25" min="1"></label><label>Wall thickness (mm) <input data-thickness type="number" value="1.2" min="0.4" step="0.1"></label><label>Base thickness (mm) <input data-base type="number" value="1.2" min="0.4" step="0.1"></label></fieldset><div class="house-actions"><button data-svg disabled>Download 1:100 SVG</button><button data-stl disabled>Download 3D shell STL</button></div></section>`;
  const $ = (selector) => host.querySelector(selector);
  const canvas = $('[data-canvas]'); const context = canvas.getContext('2d');
  const status = $('[data-status]'); const svgButton = $('[data-svg]'); const stlButton = $('[data-stl]');
  function message(text, error = false) { model.error = error ? text : ''; status.textContent = text; status.className = error ? 'error' : ''; }
  function draw() {
    const plan = model.plan; canvas.width = plan?.width || 900; canvas.height = plan?.height || 500;
    context.clearRect(0, 0, canvas.width, canvas.height); if (plan) context.drawImage(plan, 0, 0);
    context.lineWidth = Math.max(1, canvas.width / 600); context.strokeStyle = '#0d9b7b'; context.fillStyle = '#f8c24d';
    const drawLine = (points, closed) => { if (!points.length) return; context.beginPath(); context.moveTo(points[0].x, points[0].y); points.slice(1).forEach((point) => context.lineTo(point.x, point.y)); if (closed) context.closePath(); context.stroke(); };
    model.traceState.traces.forEach((trace) => drawLine(trace.points, trace.closed)); drawLine(model.traceState.activePoints, false);
    model.calibrationPoints.forEach((point) => { context.beginPath(); context.arc(point.x, point.y, 7, 0, Math.PI * 2); context.fill(); });
    const calibrated = Boolean(model.pixelsPerMm); svgButton.disabled = !calibrated || !model.traceState.traces.length; stlButton.disabled = !calibrated || !model.traceState.traces.some((trace) => trace.closed);
  }
  async function loadPlan(file) {
    const kind = classifyPlanFile(file); if (kind === 'unsupported') { message('Choose a standard PDF, PNG or JPG plan.', true); return; }
    try {
      const plan = kind === 'image' ? await imageFromFile(file) : await (await import('./pdf-renderer.js')).renderFirstPdfPage(file);
      model = { ...model, plan, traceState: createTraceState(), calibrationPoints: [], pixelsPerMm: null, error: '' }; message(`Loaded ${file.name}. Calibrate from a known measurement.`); draw();
    } catch (error) { model = preservePlanOnImportError(model, error); message(model.error, true); }
  }
  $('[data-file]').addEventListener('change', (event) => loadPlan(event.target.files?.[0]));
  host.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { model.mode = button.dataset.mode; message(model.mode === 'calibrate' ? 'Tap two points on a known dimension.' : 'Tap points along a wall.'); }));
  canvas.addEventListener('click', (event) => {
    if (!model.plan) return message('Import a plan first.', true);
    const rect = canvas.getBoundingClientRect(); const point = { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    if (model.mode === 'calibrate') { model.calibrationPoints = [...model.calibrationPoints, point].slice(-2); if (model.calibrationPoints.length === 2) { const result = calibrate(model.calibrationPoints, Number($('[data-calibration]').value)); if (result.error) message(result.error, true); else { model.pixelsPerMm = result.pixelsPerMm; model.calibrationPoints = []; model.mode = 'trace'; message('Calibrated. Selection cleared; trace your walls.'); } } } else model.traceState = addTracePoint(model.traceState, point);
    draw();
  });
  $('[data-finish]').addEventListener('click', () => { model.traceState = finishTrace(model.traceState, false); draw(); });
  $('[data-close]').addEventListener('click', () => { model.traceState = finishTrace(model.traceState, true); draw(); });
  $('[data-undo]').addEventListener('click', () => { model.traceState = undoTrace(model.traceState); draw(); });
  $('[data-reset]').addEventListener('click', () => { model = { ...model, plan: null, traceState: createTraceState(), calibrationPoints: [], pixelsPerMm: null }; message('Plan cleared.'); draw(); });
  $('[data-verify]').addEventListener('click', () => { const result = verifyScale(Number($('[data-real]').value), Number($('[data-measured]').value), 100); $('[data-verification]').textContent = Number.isFinite(result.expectedMm) ? `Expected ${result.expectedMm.toFixed(2)} mm — ${result.passed ? 'Pass' : 'Check calibration'} (difference ${result.differenceMm.toFixed(2)} mm)` : 'Enter valid lengths.'; });
  $('[data-svg]').addEventListener('click', () => downloads('plan2print-1-100.svg', buildSvg(model.traceState.traces, model.pixelsPerMm, 100), 'image/svg+xml'));
  $('[data-stl]').addEventListener('click', () => { const options = { scale: 100, wallHeightMm: Number($('[data-height]').value), wallThicknessMm: Number($('[data-thickness]').value), baseThicknessMm: Number($('[data-base]').value) }; if (![options.wallHeightMm, options.wallThicknessMm, options.baseThicknessMm].every((value) => Number.isFinite(value) && value > 0)) return message('Enter positive 3D dimensions.', true); downloads('plan2print-house-shell.stl', buildAsciiStl(model.traceState.traces, model.pixelsPerMm, options), 'model/stl'); });
  draw(); return { destroy() { host.innerHTML = ''; } };
}
