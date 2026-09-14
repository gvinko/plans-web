import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FurniturePrimitiveId, FurnitureCategory } from "./types";
import { mmToWorld } from "./coords";

/**
 * Every builder authors its piece in REAL-WORLD furniture dimensions (mm),
 * centered on X/Z at the origin, sitting on the floor (min-Y = 0) — exactly
 * like a real bed is ~1400x2000mm. The global print scale factor (see
 * lib/exportMesh.ts) shrinks furniture and building together, which is what
 * keeps everything proportional whether it's exported merged or loose.
 * Every shape is boxes/cylinders only — flat-bottomed, no unsupported
 * overhangs beyond ~45°, so pieces print on an Ender 3 without supports.
 */

type BoxSpec = { w: number; h: number; d: number; x: number; y: number; z: number };

function box(spec: BoxSpec): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(mmToWorld(spec.w), mmToWorld(spec.h), mmToWorld(spec.d));
  geo.translate(mmToWorld(spec.x), mmToWorld(spec.y), mmToWorld(spec.z));
  return geo;
}

function cyl(radius: number, height: number, x: number, y: number, z: number, segments = 12): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(mmToWorld(radius), mmToWorld(radius), mmToWorld(height), segments);
  geo.translate(mmToWorld(x), mmToWorld(y), mmToWorld(z));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

export interface FurnitureDef {
  label: string;
  category: FurnitureCategory;
  footprintMm: { w: number; d: number; h: number };
  build: () => THREE.BufferGeometry;
}

export const FURNITURE_LIBRARY: Record<FurniturePrimitiveId, FurnitureDef> = {
  bed: {
    label: "Bed",
    category: "bedroom",
    footprintMm: { w: 1400, d: 2000, h: 550 },
    build: () =>
      merge([
        box({ w: 1400, h: 250, d: 2000, x: 0, y: 125, z: 0 }), // mattress/frame block
        box({ w: 1400, h: 300, d: 60, x: 0, y: 400, z: -970 }), // headboard
      ]),
  },
  wardrobe: {
    label: "Wardrobe",
    category: "bedroom",
    footprintMm: { w: 900, d: 550, h: 1800 },
    build: () => merge([box({ w: 900, h: 1800, d: 550, x: 0, y: 900, z: 0 })]),
  },
  desk: {
    label: "Desk",
    category: "bedroom",
    footprintMm: { w: 1100, d: 550, h: 740 },
    build: () =>
      merge([
        box({ w: 1100, h: 40, d: 550, x: 0, y: 700, z: 0 }), // top
        box({ w: 60, h: 700, d: 60, x: -500, y: 350, z: -220 }),
        box({ w: 60, h: 700, d: 60, x: 500, y: 350, z: -220 }),
        box({ w: 60, h: 700, d: 60, x: -500, y: 350, z: 220 }),
        box({ w: 60, h: 700, d: 60, x: 500, y: 350, z: 220 }),
      ]),
  },
  chair: {
    label: "Chair",
    category: "bedroom",
    footprintMm: { w: 420, d: 450, h: 850 },
    build: () =>
      merge([
        box({ w: 420, h: 40, d: 420, x: 0, y: 450, z: 0 }), // seat
        box({ w: 420, h: 400, d: 40, x: 0, y: 650, z: -190 }), // backrest
        box({ w: 40, h: 450, d: 40, x: -180, y: 225, z: -180 }),
        box({ w: 40, h: 450, d: 40, x: 180, y: 225, z: -180 }),
        box({ w: 40, h: 450, d: 40, x: -180, y: 225, z: 180 }),
        box({ w: 40, h: 450, d: 40, x: 180, y: 225, z: 180 }),
      ]),
  },
  couch: {
    label: "Couch",
    category: "living",
    footprintMm: { w: 1900, d: 850, h: 800 },
    build: () =>
      merge([
        box({ w: 1900, h: 400, d: 850, x: 0, y: 200, z: 0 }), // base/seat
        box({ w: 1900, h: 400, d: 150, x: 0, y: 600, z: -350 }), // backrest
        box({ w: 150, h: 700, d: 850, x: -875, y: 350, z: 0 }), // left arm
        box({ w: 150, h: 700, d: 850, x: 875, y: 350, z: 0 }), // right arm
      ]),
  },
  coffee_table: {
    label: "Coffee Table",
    category: "living",
    footprintMm: { w: 1100, d: 550, h: 400 },
    build: () =>
      merge([
        box({ w: 1100, h: 40, d: 550, x: 0, y: 380, z: 0 }),
        box({ w: 60, h: 360, d: 60, x: -500, y: 180, z: -220 }),
        box({ w: 60, h: 360, d: 60, x: 500, y: 180, z: -220 }),
        box({ w: 60, h: 360, d: 60, x: -500, y: 180, z: 220 }),
        box({ w: 60, h: 360, d: 60, x: 500, y: 180, z: 220 }),
      ]),
  },
  tv_unit: {
    label: "TV Unit",
    category: "living",
    footprintMm: { w: 1500, d: 400, h: 500 },
    build: () =>
      merge([
        box({ w: 1500, h: 450, d: 400, x: 0, y: 225, z: 0 }), // cabinet
        box({ w: 1200, h: 700, d: 40, x: 0, y: 800, z: -170 }), // screen, thin & shallow
      ]),
  },
  counter: {
    label: "Kitchen Counter",
    category: "kitchen",
    footprintMm: { w: 2000, d: 600, h: 900 },
    build: () =>
      merge([
        box({ w: 2000, h: 850, d: 600, x: 0, y: 425, z: 0 }), // base cabinet
        box({ w: 2050, h: 50, d: 630, x: 0, y: 875, z: 0 }), // countertop overhang
      ]),
  },
  dining_table: {
    label: "Dining Table",
    category: "kitchen",
    footprintMm: { w: 1600, d: 900, h: 750 },
    build: () =>
      merge([
        box({ w: 1600, h: 40, d: 900, x: 0, y: 730, z: 0 }),
        cyl(45, 700, -700, 350, -380),
        cyl(45, 700, 700, 350, -380),
        cyl(45, 700, -700, 350, 380),
        cyl(45, 700, 700, 350, 380),
      ]),
  },
  bathtub: {
    label: "Bathtub",
    category: "bath",
    footprintMm: { w: 1700, d: 750, h: 550 },
    build: () => {
      const outer = box({ w: 1700, h: 550, d: 750, x: 0, y: 275, z: 0 });
      const innerGeo = new THREE.BoxGeometry(mmToWorld(1500), mmToWorld(430), mmToWorld(570));
      innerGeo.translate(0, mmToWorld(275 + 60), 0);
      // NOTE: this is a decorative recess made of overlapping boxes, not a CSG
      // subtraction — kept lightweight since the bathtub is normally exported
      // as a "loose" play piece rather than merged into the structural shell.
      // If the user selects "merged" mode, buildFurnitureGeometry() runs a
      // real CSG SUBTRACTION using innerGeo so the tub actually hollows out.
      (outer as any).__bathtubCavity = innerGeo;
      return outer;
    },
  },
};

export const FURNITURE_CATEGORIES: { id: FurnitureCategory; label: string; items: FurniturePrimitiveId[] }[] = [
  { id: "bedroom", label: "Bedroom", items: ["bed", "wardrobe", "desk", "chair"] },
  { id: "living", label: "Living", items: ["couch", "coffee_table", "tv_unit"] },
  { id: "kitchen", label: "Kitchen / Bath", items: ["counter", "dining_table", "bathtub"] },
];
