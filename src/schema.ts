/**
 * Plandroid Web — IndexedDB schema (Dexie)
 * All units stored in SI base (mm, L/s, m/s). Imperial is a display-layer conversion
 * (see lib/units.ts, Phase 4) — never stored, to avoid dual-unit drift.
 */

export type DuctShape = 'rect' | 'round' | 'flex';
export type FittingType =
  | 'plenum_supply'
  | 'plenum_return'
  | 'transition'
  | 'reducer'
  | 'boot_sq2rd'
  | 'takeoff_side'
  | 'takeoff_top'
  | 'bend_90'
  | 'bend_45'
  | 'wye'
  | 'damper';
export type TerminalType = 'diffuser_multi' | 'grille_linear' | 'grille_eggcrate';
export type UnitSystem = 'metric' | 'imperial';

export interface Project {
  id: string; // nanoid
  name: string;
  designer: string;
  client: string;
  unitSystem: UnitSystem;
  createdAt: number;
  updatedAt: number;
  revision: string; // e.g. "A", "B", "1.2"
}

export interface PlanPage {
  id: string;
  projectId: string;
  name: string; // e.g. "Level 1 — Mechanical"
  order: number;
  // Underlying floor plan raster (PDF page rendered to PNG, or direct PNG/JPG import)
  backgroundImage: Blob | null;
  backgroundImageWidthPx: number;
  backgroundImageHeightPx: number;
  // Scale calibration: pixels-per-mm derived from a 2-point click + known real distance
  scale: {
    pxPerMm: number | null;
    calibratedAt: number | null;
    referencePoints: [{ x: number; y: number }, { x: number; y: number }] | null;
    referenceLengthMm: number | null;
  };
  northAngleDeg: number; // rotation of north arrow relative to page up
  canvasJSON: string | null; // serialized Fabric.js canvas state (fabric.Canvas#toJSON)
  // Phase 5: low-opacity hand-sketch underlay, separate from the calibrated backgroundImage above —
  // used for tracing an approximate layout before any real-world scale exists.
  sketchImage: Blob | null;
  sketchWidthPx: number;
  sketchHeightPx: number;
  sketchOpacity: number; // 0..1
}

export interface DuctRun {
  id: string;
  planPageId: string;
  shape: DuctShape;
  // rect: widthMm x depthMm ; round: diameterMm ; flex: diameterMm + isCoiled
  widthMm?: number;
  depthMm?: number;
  diameterMm?: number;
  gaugeMm?: number; // sheet metal gauge, rigid only
  lengthMm: number; // computed from path geometry at scale, cached for BOM speed
  pathPoints: { x: number; y: number }[]; // canvas-space, converted via page scale
  airflowLs: number; // design airflow, litres/second
  velocityMs: number; // computed = airflow / cross-section area
  zoneName: string;
  connectedFromPortId: string | null; // magnetic port snap references
  connectedToPortId: string | null;
}

export interface Fitting {
  id: string;
  planPageId: string;
  type: FittingType;
  x: number;
  y: number;
  rotationDeg: number;
  sizeInMm: Record<string, number>; // shape-specific dims, e.g. {w:300,d:200} or {d:250}
  sizeOutMm: Record<string, number>;
}

export interface Terminal {
  id: string;
  planPageId: string;
  type: TerminalType;
  x: number;
  y: number;
  rotationDeg: number;
  airflowLs: number;
  neckDiameterMm: number;
  zoneName: string;
}

export interface Equipment {
  id: string;
  planPageId: string;
  kind: 'split_indoor' | 'split_outdoor' | 'package_unit' | 'ducted_fan_coil';
  model: string;
  x: number;
  y: number;
  rotationDeg: number;
  ratedCapacityKw: number;
  ratedAirflowLs: number;
}

export interface CostItem {
  id: string;
  projectId: string;
  category: 'duct_rigid' | 'duct_flex' | 'fitting' | 'terminal' | 'equipment' | 'labor' | 'custom';
  /** Stable takeoff-line key, e.g. "duct_rigid:400x250" or a catalog component id like "fitting-elbow-90". */
  refType: string;
  description: string;
  unitCost: number;
  marginPercent: number;
  laborHoursPerUnit: number;
  quantity: number; // synced from the takeoff engine (Phase 4) every time it runs
  isManualOverride: boolean;
}

export const DB_VERSION = 2;

/**
 * Phase 5, Feature 1 — rows imported from a user-supplied Excel/CSV price book.
 * Deliberately GLOBAL (no projectId): this is a reusable company price book/catalog,
 * not something scoped to a single job — import once, use across every project.
 */
export interface ImportedCatalogItem {
  id: string;
  itemName: string;
  category: string; // raw text from the sheet, e.g. "FCU", "Sheet Metal", "Grille"
  dimensions: string | null; // raw "WxDxH" / "Ø250" text as imported, not parsed at storage time
  airflowValue: number | null;
  airflowUnit: 'L/s' | 'CFM' | null;
  baseCost: number;
  sellPrice: number;
  importedAt: number;
}
