import type { FabricObject } from 'fabric';
import type { PortDef } from '../catalog/types';

export type PlandroidObjectKind = 'equipment' | 'fitting' | 'terminal' | 'duct_rigid' | 'duct_flex' | 'traced_room';

export interface PlandroidData {
  plandroidKind: PlandroidObjectKind;
  plandroidComponentId?: string; // catalog id, for equipment/fitting/terminal
  plandroidPorts: PortDef[]; // local coordinates, relative to object center
  plandroidWidthMm?: number;
  plandroidDepthMm?: number;
  plandroidDiameterMm?: number;
  plandroidLengthMm?: number;
  plandroidSnappedTo?: { objId: string; portId: string };
  /** Denormalized from an imported catalog row at placement time, so the takeoff engine
   * can label/price this item without an async DB lookup while walking canvas objects. */
  plandroidImportedMeta?: { itemName: string; category: string; unitCost: number; airflowValue?: number | null; airflowUnit?: 'L/s' | 'CFM' | null };
  /** World-space (canvas-coordinate) vertices of a traced room outline, closed loop implied (last connects to first).
   * Kept in world space rather than object-local because dimension edits rebuild the polygon from scratch —
   * see wallDimensionEdit.ts. This means dragging/rotating the whole room after tracing will desync this array
   * from the object's actual transform; the dimension tool assumes you dimension right after tracing. */
  plandroidTraceVerticesPx?: { x: number; y: number }[];
  /** Zone this room or piece of equipment belongs to — drives the color it's drawn with (rooms) or a schedule grouping (equipment). */
  plandroidZoneId?: string;
  /** Equipment/terminal schedule fields (Feature: System Schedule) — scoped to the currently open page, see SystemSchedulePanel. */
  plandroidScheduleTag?: string;
  plandroidAirflowLs?: number;
  plandroidScheduleNotes?: string;
  /** A placement can stay selectable while its movement, scale and rotation are locked. */
  plandroidLocked?: boolean;
  /** Per-child paint values are retained so the drawing can be switched back from the darker display. */
  plandroidAppearance?: { darkened?: boolean; originalPaint?: { fill?: string; stroke?: string }[] };
}

/** Fabric objects carry arbitrary extra props fine at runtime; this just gives us a typed view. */
export function getPlandroidData(obj: FabricObject): PlandroidData | null {
  const d = (obj as unknown as { plandroid?: PlandroidData }).plandroid;
  return d ?? null;
}

export function setPlandroidData(obj: FabricObject, data: PlandroidData): void {
  (obj as unknown as { plandroid: PlandroidData }).plandroid = data;
}

export function getPorts(obj: FabricObject): PortDef[] {
  return getPlandroidData(obj)?.plandroidPorts ?? [];
}

export function getPlandroidId(obj: FabricObject): string | null {
  return (obj as unknown as { plandroidId?: string }).plandroidId ?? null;
}

export function setPlandroidId(obj: FabricObject, id: string): void {
  (obj as unknown as { plandroidId: string }).plandroidId = id;
}
