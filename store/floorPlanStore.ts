import { create } from "zustand";
import { v4 as uuid } from "uuid";
import {
  FloorPlanDocument,
  Wall,
  WallOpening,
  FurniturePlacement,
  RoofCutout,
  Point2,
  ID,
} from "../lib/types";

function emptyDocument(): FloorPlanDocument {
  return {
    id: uuid(),
    name: "Untitled Plan",
    backgroundImage: null,
    calibration: {
      pixelPointA: null,
      pixelPointB: null,
      realDistanceMm: null,
      mmPerPixel: null,
    },
    walls: [],
    furniture: [],
    roof: {
      enabled: true,
      style: "gable",
      pitchDeg: 30,
      overhangMm: 15,
      thicknessMm: 3,
      lipHeightMm: 6,
      lipToleranceMm: 0.35,
      cutouts: [],
    },
    print: {
      scalePreset: "1:64",
      customScaleFactor: 1 / 64,
      targetBedWidthMm: null,
      slabThicknessMm: 2.5,
      mergeMode: "merged",
      exportFormat: "stl",
    },
    defaultWallHeightMm: 90, // real-world mm; gets scaled down at export time
    defaultWallThicknessMm: 3.5,
    snapToGrid: true,
    gridSizeMm: 50,
    angleSnapDeg: 45,
  };
}

export type ToolMode =
  | "select"
  | "draw-wall"
  | "place-door"
  | "place-window"
  | "place-furniture"
  | "calibrate"
  | "roof-cutout";

interface FloorPlanState {
  doc: FloorPlanDocument;
  tool: ToolMode;
  activeFurniturePrimitive: FurniturePlacement["primitiveId"] | null;
  selectedWallId: ID | null;
  selectedFurnitureId: ID | null;
  showRoof: boolean; // viewport toggle — independent of roof.enabled (export flag)
  showFurniture: boolean;

  setTool: (t: ToolMode) => void;
  setActiveFurniturePrimitive: (p: FurniturePlacement["primitiveId"] | null) => void;
  setBackgroundImage: (dataUrl: string | null) => void;
  setCalibration: (a: { x: number; y: number }, b: { x: number; y: number }, realMm: number) => void;

  addWall: (start: Point2, end: Point2) => ID;
  updateWall: (id: ID, patch: Partial<Wall>) => void;
  removeWall: (id: ID) => void;

  addOpening: (wallId: ID, opening: Omit<WallOpening, "id" | "wallId">) => void;
  updateOpening: (wallId: ID, openingId: ID, patch: Partial<WallOpening>) => void;
  removeOpening: (wallId: ID, openingId: ID) => void;

  addFurniture: (item: Omit<FurniturePlacement, "id">) => ID;
  updateFurniture: (id: ID, patch: Partial<FurniturePlacement>) => void;
  removeFurniture: (id: ID) => void;

  addRoofCutout: (cutout: Omit<RoofCutout, "id">) => void;
  removeRoofCutout: (id: ID) => void;
  updateRoofSettings: (patch: Partial<FloorPlanDocument["roof"]>) => void;
  updatePrintSettings: (patch: Partial<FloorPlanDocument["print"]>) => void;
  updateDocSettings: (patch: Partial<Pick<FloorPlanDocument,
    "defaultWallHeightMm" | "defaultWallThicknessMm" | "snapToGrid" | "gridSizeMm" | "angleSnapDeg" | "name">>) => void;

  setSelectedWall: (id: ID | null) => void;
  setSelectedFurniture: (id: ID | null) => void;
  toggleRoofVisibility: () => void;
  toggleFurnitureVisibility: () => void;

  loadDocument: (doc: FloorPlanDocument) => void;
  resetDocument: () => void;
}

export const useFloorPlanStore = create<FloorPlanState>((set, get) => ({
  doc: emptyDocument(),
  tool: "select",
  activeFurniturePrimitive: null,
  selectedWallId: null,
  selectedFurnitureId: null,
  showRoof: true,
  showFurniture: true,

  setTool: (t) => set({ tool: t }),
  setActiveFurniturePrimitive: (p) => set({ activeFurniturePrimitive: p }),

  setBackgroundImage: (dataUrl) =>
    set((s) => ({ doc: { ...s.doc, backgroundImage: dataUrl } })),

  setCalibration: (a, b, realMm) =>
    set((s) => {
      const pxDist = Math.hypot(b.x - a.x, b.y - a.y);
      const mmPerPixel = pxDist > 0 ? realMm / pxDist : null;
      return {
        doc: {
          ...s.doc,
          calibration: {
            pixelPointA: a,
            pixelPointB: b,
            realDistanceMm: realMm,
            mmPerPixel,
          },
        },
      };
    }),

  addWall: (start, end) => {
    const id = uuid();
    const wall: Wall = {
      id,
      start,
      end,
      thicknessMm: get().doc.defaultWallThicknessMm,
      heightMm: get().doc.defaultWallHeightMm,
      openings: [],
    };
    set((s) => ({ doc: { ...s.doc, walls: [...s.doc.walls, wall] } }));
    return id;
  },

  updateWall: (id, patch) =>
    set((s) => ({
      doc: {
        ...s.doc,
        walls: s.doc.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      },
    })),

  removeWall: (id) =>
    set((s) => ({
      doc: { ...s.doc, walls: s.doc.walls.filter((w) => w.id !== id) },
      selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
    })),

  addOpening: (wallId, opening) =>
    set((s) => ({
      doc: {
        ...s.doc,
        walls: s.doc.walls.map((w) =>
          w.id === wallId
            ? { ...w, openings: [...w.openings, { ...opening, id: uuid(), wallId }] }
            : w
        ),
      },
    })),

  updateOpening: (wallId, openingId, patch) =>
    set((s) => ({
      doc: {
        ...s.doc,
        walls: s.doc.walls.map((w) =>
          w.id !== wallId
            ? w
            : {
                ...w,
                openings: w.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
              }
        ),
      },
    })),

  removeOpening: (wallId, openingId) =>
    set((s) => ({
      doc: {
        ...s.doc,
        walls: s.doc.walls.map((w) =>
          w.id !== wallId ? w : { ...w, openings: w.openings.filter((o) => o.id !== openingId) }
        ),
      },
    })),

  addFurniture: (item) => {
    const id = uuid();
    set((s) => ({ doc: { ...s.doc, furniture: [...s.doc.furniture, { ...item, id }] } }));
    return id;
  },

  updateFurniture: (id, patch) =>
    set((s) => ({
      doc: {
        ...s.doc,
        furniture: s.doc.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    })),

  removeFurniture: (id) =>
    set((s) => ({
      doc: { ...s.doc, furniture: s.doc.furniture.filter((f) => f.id !== id) },
      selectedFurnitureId: s.selectedFurnitureId === id ? null : s.selectedFurnitureId,
    })),

  addRoofCutout: (cutout) =>
    set((s) => ({
      doc: { ...s.doc, roof: { ...s.doc.roof, cutouts: [...s.doc.roof.cutouts, { ...cutout, id: uuid() }] } },
    })),

  removeRoofCutout: (id) =>
    set((s) => ({
      doc: { ...s.doc, roof: { ...s.doc.roof, cutouts: s.doc.roof.cutouts.filter((c) => c.id !== id) } },
    })),

  updateRoofSettings: (patch) =>
    set((s) => ({ doc: { ...s.doc, roof: { ...s.doc.roof, ...patch } } })),

  updatePrintSettings: (patch) =>
    set((s) => ({ doc: { ...s.doc, print: { ...s.doc.print, ...patch } } })),

  updateDocSettings: (patch) => set((s) => ({ doc: { ...s.doc, ...patch } })),

  setSelectedWall: (id) => set({ selectedWallId: id, selectedFurnitureId: null }),
  setSelectedFurniture: (id) => set({ selectedFurnitureId: id, selectedWallId: null }),
  toggleRoofVisibility: () => set((s) => ({ showRoof: !s.showRoof })),
  toggleFurnitureVisibility: () => set((s) => ({ showFurniture: !s.showFurniture })),

  loadDocument: (doc) => set({ doc, selectedWallId: null, selectedFurnitureId: null }),
  resetDocument: () => set({ doc: emptyDocument(), selectedWallId: null, selectedFurnitureId: null }),
}));
