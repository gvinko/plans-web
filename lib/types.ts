// ─────────────────────────────────────────────────────────────────────────
// Core domain types.
//
// COORDINATE SYSTEM CONVENTION (important — read this before touching geometry):
//   1. "Canvas space"  — raw pixels on the uploaded blueprint <canvas>. Origin
//      top-left, +x right, +y down. Never used outside BlueprintCanvas.tsx.
//   2. "Plan space"    — real-world millimetres, derived from canvas space via
//      the calibration scale (see store/floorPlanStore.ts -> mmPerPixel).
//      Origin is arbitrary (wherever the user started drawing), +x right,
//      +y = "down" on the blueprint = architectural "north-south".
//      ALL walls/doors/windows/furniture are stored in plan space (mm). This
//      is the single source of truth — the 3D scene is a pure projection of
//      it, never the other way around.
//   3. "World space"   — three.js units fed to meshes. We map plan space to
//      world space with WORLD_UNITS_PER_MM (see lib/coords.ts), and swap
//      plan-Y into world-Z (three.js is Y-up): world = (x*s, z_extrude, y*s).
// ─────────────────────────────────────────────────────────────────────────

export type ID = string;

export interface Point2 {
  x: number; // mm, plan space
  y: number; // mm, plan space
}

export interface CalibrationState {
  /** Two points the user clicked on the source image, in canvas px. */
  pixelPointA: { x: number; y: number } | null;
  pixelPointB: { x: number; y: number } | null;
  /** Real-world distance between those two points, in mm, as entered by the user. */
  realDistanceMm: number | null;
  /** Derived: millimetres represented by one canvas pixel. Null until calibrated. */
  mmPerPixel: number | null;
}

export type OpeningType = "door" | "window";

export interface WallOpening {
  id: ID;
  wallId: ID;
  type: OpeningType;
  /** Distance in mm from wall start point to the CENTER of the opening. */
  distanceFromStart: number;
  /** Opening width in mm. */
  width: number;
  /** Height of the opening itself (door leaf height, or window glass height). */
  height: number;
  /**
   * Sill height (mm from floor) — meaningful for windows only. Doors default to 0.
   * Kept on the type for both so a door "converted" to a window round-trips cleanly.
   */
  sillHeight: number;
  /**
   * Header height (mm from floor to the TOP of the opening / bottom of the lintel).
   * Must be <= wallHeight - minLintelThickness, enforced by lib/validate.ts, so the
   * wall keeps a continuous structural band above every opening when printed.
   */
  headerHeight: number;
}

export interface Wall {
  id: ID;
  start: Point2;
  end: Point2;
  thicknessMm: number; // default 3.5, clamp 2–8 for FDM strength
  heightMm: number; // wall height, shared plan-wide default but overridable per wall
  openings: WallOpening[];
}

export type FurnitureCategory = "bedroom" | "living" | "kitchen" | "bath";

export type FurniturePrimitiveId =
  | "bed" | "wardrobe" | "desk" | "chair"
  | "couch" | "coffee_table" | "tv_unit"
  | "counter" | "dining_table" | "bathtub";

export interface FurniturePlacement {
  id: ID;
  primitiveId: FurniturePrimitiveId;
  /** Center position in plan space (mm). */
  position: Point2;
  rotationDeg: number; // rotation about vertical (Y in world space)
  /** Uniform scale multiplier applied on top of the primitive's authored real-world size. */
  scale: number;
}

export type RoofStyle = "gable" | "hip" | "flat";

export interface RoofSettings {
  enabled: boolean;
  style: RoofStyle;
  pitchDeg: number; // roofline slope, 15-45 typical
  overhangMm: number; // eave overhang beyond wall outer face
  thicknessMm: number; // shell thickness of the roof panel itself
  /** Lip (rebate) that hangs down from the roof underside and registers inside the wall top. */
  lipHeightMm: number; // how far the lip drops below the roof underside
  lipToleranceMm: number; // clearance subtracted from wall-inner offset so the lip is a snug slip-fit
  cutouts: RoofCutout[];
}

export interface RoofCutout {
  id: ID;
  /** Cutout footprint in plan space (mm), a simple rectangle for skylights/viewing voids. */
  center: Point2;
  widthMm: number;
  depthMm: number;
}

export type MergeMode = "merged" | "loose";

export interface PrintSettings {
  /** Named dollhouse scale, or "custom" to use targetBedWidthMm directly. */
  scalePreset: "1:50" | "1:64" | "1:24" | "1:12" | "custom";
  customScaleFactor: number; // e.g. 1/64 == 0.015625; used when scalePreset === "custom"... unless targetBedWidthMm is set
  /** If set, overrides scalePreset: solve for a scale factor so the model's longest footprint side fits this bed width. */
  targetBedWidthMm: number | null;
  slabThicknessMm: number; // 2-3mm baseplate
  mergeMode: MergeMode;
  exportFormat: "stl" | "obj";
}

export interface FloorPlanDocument {
  id: ID;
  name: string;
  backgroundImage: string | null; // data URL of the raster page (PDF pages are rasterized on load)
  calibration: CalibrationState;
  walls: Wall[];
  furniture: FurniturePlacement[];
  roof: RoofSettings;
  print: PrintSettings;
  defaultWallHeightMm: number;
  defaultWallThicknessMm: number;
  snapToGrid: boolean;
  gridSizeMm: number;
  angleSnapDeg: number; // 0 disables angle snap; else e.g. 45
}
