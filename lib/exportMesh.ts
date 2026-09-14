import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { FloorPlanDocument } from "./types";
import { buildFullModel, concatGeometries } from "./modelBuilder";
import { worldToMm } from "./coords";
import { computePlanBoundsMm } from "./slabGeometry";

const SCALE_PRESETS: Record<string, number> = {
  "1:50": 1 / 50,
  "1:64": 1 / 64,
  "1:24": 1 / 24,
  "1:12": 1 / 12,
};

/**
 * Resolve the single scale factor applied to BOTH the building and the
 * furniture so everything stays proportional. targetBedWidthMm, when set,
 * overrides the named preset by solving for a factor that fits the plan's
 * longest footprint side to that bed width (handy for "make it fit my
 * Ender 3's 220mm bed").
 */
export function resolveScaleFactor(doc: FloorPlanDocument): number {
  if (doc.print.targetBedWidthMm && doc.print.targetBedWidthMm > 0) {
    const b = computePlanBoundsMm(doc.walls);
    const longestSideMm = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
    return doc.print.targetBedWidthMm / longestSideMm;
  }
  if (doc.print.scalePreset === "custom") {
    return doc.print.customScaleFactor;
  }
  return SCALE_PRESETS[doc.print.scalePreset] ?? 1 / 64;
}

/** Convert a world-unit geometry to a freshly-scaled, real-print-mm geometry (still using three's unit system, just now literally millimetres). */
function toPrintMm(geo: THREE.BufferGeometry, scaleFactor: number): THREE.BufferGeometry {
  const out = geo.clone();
  // world units -> mm (undo the WORLD_UNITS_PER_MM display scale), then apply the dollhouse scale factor.
  const mmPerWorldUnit = worldToMm(1);
  out.scale(mmPerWorldUnit * scaleFactor, mmPerWorldUnit * scaleFactor, mmPerWorldUnit * scaleFactor);
  return out;
}

export interface ExportedFile {
  filename: string;
  blob: Blob;
}

function serialize(geometry: THREE.BufferGeometry, format: "stl" | "obj", name: string): string {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = name;
  if (format === "stl") {
    return new STLExporter().parse(mesh, { binary: false }) as string;
  }
  return new OBJExporter().parse(mesh);
}

/**
 * Produces the printable file set: always a "base" part (walls + slab +
 * merged furniture, if applicable), a "roof" part when the roof is enabled,
 * and — only in loose furniture mode — one additional part containing every
 * unattached furniture piece (still individually manifold, just concatenated
 * for a single convenient file rather than one file per chair).
 */
export function exportModel(doc: FloorPlanDocument): ExportedFile[] {
  const scaleFactor = resolveScaleFactor(doc);
  const built = buildFullModel(doc);
  const format = doc.print.exportFormat;
  const ext = format;
  const files: ExportedFile[] = [];

  const baseMm = toPrintMm(built.baseGeometry, scaleFactor);
  const baseText = serialize(baseMm, format, `${doc.name}_base`);
  files.push({
    filename: `${sanitize(doc.name)}_base.${ext}`,
    blob: new Blob([baseText], { type: "text/plain" }),
  });

  if (doc.roof.enabled && built.roofGeometry.attributes.position?.count > 0) {
    const roofMm = toPrintMm(built.roofGeometry, scaleFactor);
    const roofText = serialize(roofMm, format, `${doc.name}_roof`);
    files.push({
      filename: `${sanitize(doc.name)}_roof.${ext}`,
      blob: new Blob([roofText], { type: "text/plain" }),
    });
  }

  if (doc.print.mergeMode === "loose" && built.looseFurniture.length > 0) {
    const combined = concatGeometries(built.looseFurniture.map((f) => f.geometry));
    if (combined) {
      const furnMm = toPrintMm(combined, scaleFactor);
      const furnText = serialize(furnMm, format, `${doc.name}_furniture`);
      files.push({
        filename: `${sanitize(doc.name)}_furniture.${ext}`,
        blob: new Blob([furnText], { type: "text/plain" }),
      });
    }
  }

  return files;
}

function sanitize(name: string): string {
  return name.trim().replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "plan2print_model";
}

export function downloadFile(file: ExportedFile) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
