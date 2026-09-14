import { FloorPlanDocument } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

const MIN_WALL_THICKNESS_MM = 2;
const MAX_WALL_THICKNESS_MM = 8;
const MIN_LINTEL_BAND_MM = 4; // structural material required above an opening's header

/**
 * Pre-flight check run before STL/OBJ export. Doesn't block export (FDM
 * printers can attempt almost anything) but surfaces the issues most likely
 * to produce a warped, collapsed, or non-manifold print.
 */
export function validateDocument(doc: FloorPlanDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (doc.walls.length === 0) {
    issues.push({ level: "error", message: "No walls drawn yet." });
    return issues;
  }

  for (const wall of doc.walls) {
    if (wall.thicknessMm < MIN_WALL_THICKNESS_MM) {
      issues.push({
        level: "warning",
        message: `Wall ${wall.id.slice(0, 6)} is ${wall.thicknessMm}mm thick — below ${MIN_WALL_THICKNESS_MM}mm, likely to fail on a 0.4mm nozzle (needs 2+ perimeters to be solid).`,
      });
    }
    if (wall.thicknessMm > MAX_WALL_THICKNESS_MM) {
      issues.push({
        level: "warning",
        message: `Wall ${wall.id.slice(0, 6)} is ${wall.thicknessMm}mm thick — unusually thick, will print slow and use a lot of filament.`,
      });
    }

    for (const opening of wall.openings) {
      const lintelBand = wall.heightMm - opening.headerHeight;
      if (opening.headerHeight <= opening.sillHeight) {
        issues.push({
          level: "error",
          message: `Opening on wall ${wall.id.slice(0, 6)}: header height must be greater than sill height.`,
        });
      }
      if (lintelBand < MIN_LINTEL_BAND_MM) {
        issues.push({
          level: "warning",
          message: `Opening on wall ${wall.id.slice(0, 6)} leaves only ${lintelBand.toFixed(
            1
          )}mm of wall above it — recommend >= ${MIN_LINTEL_BAND_MM}mm so the lintel doesn't snap.`,
        });
      }
      if (opening.width > (wall.end.x === wall.start.x && wall.end.y === wall.start.y ? 0 : Infinity)) {
        // no-op guard placeholder for degenerate zero-length walls, kept intentionally simple
      }
    }
  }

  if (doc.roof.enabled) {
    if (doc.roof.lipToleranceMm < 0.15 || doc.roof.lipToleranceMm > 0.6) {
      issues.push({
        level: "warning",
        message: `Roof lip tolerance ${doc.roof.lipToleranceMm}mm is outside the recommended 0.15–0.6mm band for FDM slip-fit — most 0.4mm-nozzle printers do well around 0.3–0.4mm.`,
      });
    }
    if (doc.roof.thicknessMm < 2) {
      issues.push({
        level: "warning",
        message: `Roof panel thickness ${doc.roof.thicknessMm}mm may warp or sag — 3mm+ recommended.`,
      });
    }
  }

  if (doc.print.slabThicknessMm < 1.5) {
    issues.push({
      level: "warning",
      message: `Baseplate is ${doc.print.slabThicknessMm}mm — thinner than 1.5mm risks warping/lifting off the bed during the print.`,
    });
  }

  const calibrated = doc.calibration.mmPerPixel !== null;
  if (!calibrated) {
    issues.push({
      level: "warning",
      message: "Plan was never calibrated against a real-world distance — dimensions may not be accurate.",
    });
  }

  return issues;
}
