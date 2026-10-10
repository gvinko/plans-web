import type { PrinterProfile } from './profiles';

export interface ModelBoundsMm {
  x: number;
  y: number;
  z: number;
}

export interface AxisSplitPlan {
  axis: 'x' | 'y' | 'z';
  partCount: number;
  targetPartSizeMm: number;
  overlapAllowanceMm: number;
}

export interface SplitPlan {
  required: boolean;
  axes: AxisSplitPlan[];
  estimatedPartCount: number;
}

const AXES = ['x', 'y', 'z'] as const;

export function createSplitPlan(
  model: ModelBoundsMm,
  printer: PrinterProfile,
  safetyMarginMm = 2,
): SplitPlan {
  const axes: AxisSplitPlan[] = [];
  let estimatedPartCount = 1;

  for (const axis of AXES) {
    const available = Math.max(1, printer.buildVolumeMm[axis] - safetyMarginMm * 2);
    const size = Math.max(0, model[axis]);
    if (size <= available) continue;

    const partCount = Math.max(2, Math.ceil(size / available));
    const targetPartSizeMm = size / partCount;
    axes.push({
      axis,
      partCount,
      targetPartSizeMm,
      overlapAllowanceMm: printer.defaultFitClearanceMm,
    });
    estimatedPartCount *= partCount;
  }

  return {
    required: axes.length > 0,
    axes,
    estimatedPartCount,
  };
}
