import type { PrintablePart } from './meshSplitter';
import type { PrinterProfile } from './profiles';

export type JoinMode = 'dovetail-pins' | 'pins' | 'clips';
export type JoinAxis = 'x' | 'y' | 'z';

export interface JoinDescriptor {
  id: string;
  axis: JoinAxis;
  leftPartNumber: number;
  rightPartNumber: number;
  planeMm: number;
  pinCount: number;
  pinDiameterMm: number;
  pinDepthMm: number;
  clearanceMm: number;
  hasDovetail: boolean;
  hasClip: boolean;
}

export interface JoiningPlan {
  version: 1;
  printerProfileId: string;
  mode: JoinMode;
  clearanceMm: number;
  joints: JoinDescriptor[];
}

const AXES: JoinAxis[] = ['x', 'y', 'z'];
const EPSILON = 0.01;

function validClearance(printer: PrinterProfile, clearanceMm: number): void {
  const minimum = Math.max(0.08, printer.nozzleDiameterMm * 0.2);
  const maximum = Math.max(minimum * 2, printer.defaultFitClearanceMm * 2.5);
  if (!Number.isFinite(clearanceMm) || clearanceMm < minimum || clearanceMm > maximum) {
    throw new Error(`Join clearance must be between ${minimum.toFixed(2)} and ${maximum.toFixed(2)} mm for ${printer.name}.`);
  }
}

function assemblyBounds(part: PrintablePart) {
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

function sharedBoundary(left: PrintablePart, right: PrintablePart): { axis: JoinAxis; planeMm: number; crossSpanMm: number } | null {
  const a = assemblyBounds(left);
  const b = assemblyBounds(right);
  for (const axis of AXES) {
    if (Math.abs(a.max[axis] - b.min[axis]) > EPSILON) continue;
    const otherAxes = AXES.filter((candidate) => candidate !== axis);
    const spans = otherAxes.map((other) => Math.min(a.max[other], b.max[other]) - Math.max(a.min[other], b.min[other]));
    if (spans.every((span) => span > EPSILON)) {
      return { axis, planeMm: a.max[axis], crossSpanMm: Math.min(...spans) };
    }
  }
  return null;
}

/** Produce deterministic connector metadata; mesh construction consumes these records separately. */
export function createJoiningPlan(
  parts: PrintablePart[],
  printer: PrinterProfile,
  mode: JoinMode = 'dovetail-pins',
  clearanceMm = printer.defaultFitClearanceMm,
): JoiningPlan {
  validClearance(printer, clearanceMm);
  if (parts.length < 2) throw new Error('At least two split parts are required before adding joins.');
  const joints: JoinDescriptor[] = [];
  for (let leftIndex = 0; leftIndex < parts.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < parts.length; rightIndex++) {
      let left = parts[leftIndex];
      let right = parts[rightIndex];
      let boundary = sharedBoundary(left, right);
      if (!boundary) {
        boundary = sharedBoundary(right, left);
        if (!boundary) continue;
        [left, right] = [right, left];
      }
      const minimumSpan = boundary.crossSpanMm;
    const pinDiameterMm = Math.max(3, printer.nozzleDiameterMm * 8);
    const pinDepthMm = Math.max(6, pinDiameterMm * 2);
    const requiredSpan = pinDiameterMm * 2.4 + clearanceMm * 4;
    if (minimumSpan < requiredSpan || left.mesh.bounds.size[boundary.axis] < pinDepthMm || right.mesh.bounds.size[boundary.axis] < pinDepthMm) {
      throw new Error(`Split boundary between parts ${left.partNumber} and ${right.partNumber} is too small for safe join margins.`);
    }
    joints.push({
      id: `join-${left.partNumber}-${right.partNumber}`,
      axis: boundary.axis,
      planeMm: boundary.planeMm,
      leftPartNumber: left.partNumber,
      rightPartNumber: right.partNumber,
      pinCount: mode === 'clips' ? 0 : 2,
      pinDiameterMm,
      pinDepthMm,
      clearanceMm,
      hasDovetail: mode === 'dovetail-pins',
      hasClip: mode === 'clips',
    });
    }
  }
  if (!joints.length) throw new Error('No safe shared split boundaries were found for these parts.');
  joints.sort((a, b) =>
    a.axis.localeCompare(b.axis) || a.planeMm - b.planeMm || a.leftPartNumber - b.leftPartNumber || a.rightPartNumber - b.rightPartNumber);
  return { version: 1, printerProfileId: printer.id, mode, clearanceMm, joints };
}
