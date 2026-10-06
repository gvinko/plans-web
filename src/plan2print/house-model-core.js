const TOLERANCE_MM = 0.25;

function isPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function cleanPoints(points) {
  return points.filter(isPoint).filter((point, index, all) => {
    const previous = all[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

export function calibrate(points, realMm) {
  if (!Number.isFinite(realMm) || realMm <= 0) return { error: 'Enter a positive real distance.' };
  if (!Array.isArray(points) || points.length !== 2 || !points.every(isPoint)) return { error: 'Choose two calibration points.' };
  const [first, second] = points;
  const pixelDistance = Math.hypot(second.x - first.x, second.y - first.y);
  if (pixelDistance < 1) return { error: 'Choose two distinct calibration points.' };
  return { pixelsPerMm: pixelDistance / realMm };
}

export function createTraceState() {
  return { traces: [], activePoints: [] };
}

export function addTracePoint(state, point) {
  if (!isPoint(point)) return state;
  return { ...state, activePoints: [...state.activePoints, { x: point.x, y: point.y }] };
}

export function finishTrace(state, close) {
  const points = cleanPoints(state.activePoints);
  const minimumPoints = close ? 3 : 2;
  if (points.length < minimumPoints) return state;
  return { traces: [...state.traces, { points, closed: Boolean(close) }], activePoints: [] };
}

export function undoTrace(state) {
  if (state.activePoints.length) return { ...state, activePoints: state.activePoints.slice(0, -1) };
  if (state.traces.length) return { ...state, traces: state.traces.slice(0, -1) };
  return state;
}

export function verifyScale(realMm, measuredMm, scale) {
  if (![realMm, measuredMm, scale].every(Number.isFinite) || realMm <= 0 || measuredMm < 0 || scale <= 0) return { expectedMm: NaN, differenceMm: NaN, passed: false };
  const expectedMm = realMm / scale;
  const differenceMm = Number(Math.abs(measuredMm - expectedMm).toFixed(6));
  return { expectedMm, differenceMm, passed: Number.isFinite(differenceMm) && differenceMm <= TOLERANCE_MM };
}

function toPrintPoint(point, pixelsPerMm, scale) {
  return { x: point.x / pixelsPerMm / scale, y: point.y / pixelsPerMm / scale };
}

function printableTraces(traces, pixelsPerMm, scale) {
  if (!Number.isFinite(pixelsPerMm) || pixelsPerMm <= 0 || !Number.isFinite(scale) || scale <= 0) return [];
  return traces.map((trace) => ({ ...trace, points: cleanPoints(trace.points).map((point) => toPrintPoint(point, pixelsPerMm, scale)) }));
}

export function buildSvg(traces, pixelsPerMm, scale = 100) {
  const converted = printableTraces(traces, pixelsPerMm, scale);
  const points = converted.flatMap((trace) => trace.points);
  if (!points.length) return '';
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(0.01, maxX - minX);
  const height = Math.max(0.01, maxY - minY);
  const paths = converted.map((trace) => {
    if (trace.points.length < 2) return '';
    const commands = trace.points.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - minX).toFixed(3)} ${(point.y - minY).toFixed(3)}`).join(' ');
    return `<path d="${commands}${trace.closed ? ' Z' : ''}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="black" stroke-width="0.25">${paths}</g></svg>`;
}

function normal(a, b, c) {
  const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
  const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function facet(lines, a, b, c) {
  const [nx, ny, nz] = normal(a, b, c);
  lines.push(`facet normal ${nx} ${ny} ${nz}`, ' outer loop', `  vertex ${a.join(' ')}`, `  vertex ${b.join(' ')}`, `  vertex ${c.join(' ')}`, ' endloop', 'endfacet');
}

function prism(lines, corners, bottom, top) {
  const lower = corners.map(([x, y]) => [x, y, bottom]);
  const upper = corners.map(([x, y]) => [x, y, top]);
  facet(lines, lower[0], lower[2], lower[1]); facet(lines, lower[0], lower[3], lower[2]);
  facet(lines, upper[0], upper[1], upper[2]); facet(lines, upper[0], upper[2], upper[3]);
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    facet(lines, lower[index], lower[next], upper[next]);
    facet(lines, lower[index], upper[next], upper[index]);
  }
}

function segmentCorners(first, second, thickness) {
  const dx = second.x - first.x; const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return null;
  const offsetX = -dy / length * thickness / 2;
  const offsetY = dx / length * thickness / 2;
  return [[first.x + offsetX, first.y + offsetY], [second.x + offsetX, second.y + offsetY], [second.x - offsetX, second.y - offsetY], [first.x - offsetX, first.y - offsetY]];
}

export function buildAsciiStl(traces, pixelsPerMm, options = {}) {
  const { scale = 100, wallHeightMm = 25, wallThicknessMm = 1.2, baseThicknessMm = 1.2 } = options;
  const converted = printableTraces(traces, pixelsPerMm, scale).filter((trace) => trace.closed && trace.points.length >= 3);
  const lines = ['solid plan2print-house'];
  for (const trace of converted) {
    const points = trace.points;
    const basePoints = points.length > 3 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y ? points.slice(0, -1) : points;
    for (let index = 1; index < basePoints.length - 1; index += 1) {
      facet(lines, [basePoints[0].x, basePoints[0].y, 0], [basePoints[index].x, basePoints[index].y, 0], [basePoints[index + 1].x, basePoints[index + 1].y, 0]);
      facet(lines, [basePoints[0].x, basePoints[0].y, baseThicknessMm], [basePoints[index + 1].x, basePoints[index + 1].y, baseThicknessMm], [basePoints[index].x, basePoints[index].y, baseThicknessMm]);
    }
    for (let index = 0; index < basePoints.length; index += 1) {
      const first = basePoints[index]; const second = basePoints[(index + 1) % basePoints.length];
      facet(lines, [first.x, first.y, 0], [second.x, second.y, 0], [second.x, second.y, baseThicknessMm]);
      facet(lines, [first.x, first.y, 0], [second.x, second.y, baseThicknessMm], [first.x, first.y, baseThicknessMm]);
    }
    for (let index = 0; index < basePoints.length; index += 1) {
      const corners = segmentCorners(basePoints[index], basePoints[(index + 1) % basePoints.length], wallThicknessMm);
      if (corners) prism(lines, corners, baseThicknessMm, baseThicknessMm + wallHeightMm);
    }
  }
  lines.push('endsolid plan2print-house');
  return lines.join('\n');
}

export { TOLERANCE_MM };
