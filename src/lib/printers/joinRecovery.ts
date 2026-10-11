import { transformMesh, type MeshTransform, type StlMesh } from '../stl/stl';
import { applyJoiningPlan } from './joinGeometry';
import { createJoiningPlan, type JoiningPlan } from './joinPlanner';
import { splitMeshForPrinter, type PrintablePart, type PrintableSplit } from './meshSplitter';
import type { PrinterProfile } from './profiles';

function plansMatch(saved: JoiningPlan, expected: JoiningPlan): boolean {
  if (saved.version !== expected.version || saved.printerProfileId !== expected.printerProfileId || saved.mode !== expected.mode || saved.clearanceMm !== expected.clearanceMm) return false;
  if (saved.joints.length !== expected.joints.length) return false;
  return saved.joints.every((joint, index) => JSON.stringify(joint) === JSON.stringify(expected.joints[index]));
}

export interface RecoveredJoiningParts {
  split: PrintableSplit;
  parts: PrintablePart[];
  plan: JoiningPlan;
}

/** Rebuild saved connector geometry only when it still matches the current model and printer. */
export async function recoverSavedJoiningParts(
  sourceMesh: StlMesh,
  transform: MeshTransform,
  printer: PrinterProfile,
  savedPlan: JoiningPlan,
): Promise<RecoveredJoiningParts> {
  if (savedPlan.printerProfileId !== printer.id) {
    throw new Error('The saved joining plan was made for a different printer profile. Regenerate it before exporting.');
  }
  const split = splitMeshForPrinter(transformMesh(sourceMesh, transform), printer);
  if (!split.plan.required || split.parts.length < 2) {
    throw new Error('The saved joining plan no longer applies because this model does not require splitting.');
  }
  const expected = createJoiningPlan(split.parts, printer, savedPlan.mode, savedPlan.clearanceMm);
  if (!plansMatch(savedPlan, expected)) {
    throw new Error('The saved joining plan no longer matches this model, transform or printer. Regenerate it before exporting.');
  }
  return { split, parts: await applyJoiningPlan(split, savedPlan), plan: savedPlan };
}
