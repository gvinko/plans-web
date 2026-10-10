import type { MeshTransform } from '../stl/stl';
import type { PrinterProfile } from './profiles';

/** Snapshot identity for an async split request. Changed inputs invalidate old results. */
export function stlSplitSourceKey(assetId: string | null, transform: MeshTransform, printer: PrinterProfile): string {
  return JSON.stringify([
    assetId,
    transform.scaleX, transform.scaleY, transform.scaleZ,
    transform.rotateXDeg, transform.rotateYDeg, transform.rotateZDeg,
    printer.id, printer.buildVolumeMm.x, printer.buildVolumeMm.y, printer.buildVolumeMm.z,
  ]);
}
