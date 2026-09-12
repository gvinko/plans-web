export type PortKind = 'duct_rect' | 'duct_round' | 'duct_flex';

export type PortSize = { width: number; depth: number } | { diameter: number };

/**
 * A connection point on a component or duct segment.
 * Coordinates are LOCAL to the Fabric object, relative to the object's own
 * center (origin 0,0) — matching every object in this app being constructed
 * with originX/originY = 'center'. angleDeg is the outward direction air
 * flows FROM this port, in the object's own unrotated local space
 * (0 = +x/right, 90 = +y/down, matching canvas/SVG convention).
 */
export interface PortDef {
  id: string;
  x: number;
  y: number;
  angleDeg: number;
  kind: PortKind;
  sizeMm: PortSize;
}

export function isRoundSize(size: PortSize): size is { diameter: number } {
  return 'diameter' in size;
}

export function portsCompatible(a: PortKind, b: PortKind): boolean {
  if (a === b) return true;
  const pair = new Set([a, b]);
  return pair.has('duct_flex') && pair.has('duct_round');
}

export type ComponentCategory = 'equipment' | 'fitting' | 'terminal';

export interface ComponentDef {
  id: string;
  category: ComponentCategory;
  label: string;
  /** Returns a fresh Fabric Group with `ports` (PortDef[]) attached as custom data. Called once per placement. */
  build: () => import('fabric').Group;
}
