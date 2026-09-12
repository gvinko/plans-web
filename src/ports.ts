import { Point, util, type FabricObject } from 'fabric';
import type { PortDef, PortKind } from '../catalog/types';
import { portsCompatible } from '../catalog/types';
import { getPorts } from './plandroidData';
import { normalizeDeg, type Vec2 } from './geometry';

export interface WorldPort {
  obj: FabricObject;
  port: PortDef;
  worldX: number;
  worldY: number;
  worldAngleDeg: number;
}

/** Ports are authored relative to each object's own unrotated center — transformPoint with the object's full matrix maps that local point into current canvas coordinates, correctly accounting for its live position/rotation/scale. */
export function getWorldPorts(obj: FabricObject): WorldPort[] {
  const ports = getPorts(obj);
  if (ports.length === 0) return [];
  const matrix = obj.calcTransformMatrix();
  const objAngle = obj.angle ?? 0;
  return ports.map((port) => {
    const p = util.transformPoint(new Point(port.x, port.y), matrix);
    return { obj, port, worldX: p.x, worldY: p.y, worldAngleDeg: normalizeDeg(port.angleDeg + objAngle) };
  });
}

export interface SnapMatch {
  movingPort: WorldPort;
  targetPort: WorldPort;
  distance: number;
}

/** Best compatible-kind port pair within radius, between the moving object's live ports and every other object's ports. */
export function findSnapMatch(
  movingCandidates: WorldPort[],
  allObjects: FabricObject[],
  excludeObj: FabricObject,
  radiusPx: number,
): SnapMatch | null {
  let best: SnapMatch | null = null;
  for (const obj of allObjects) {
    if (obj === excludeObj) continue;
    for (const target of getWorldPorts(obj)) {
      for (const moving of movingCandidates) {
        if (!portsCompatible(moving.port.kind, target.port.kind)) continue;
        const d = Math.hypot(target.worldX - moving.worldX, target.worldY - moving.worldY);
        if (d <= radiusPx && (!best || d < best.distance)) {
          best = { movingPort: moving, targetPort: target, distance: d };
        }
      }
    }
  }
  return best;
}

/** Used while drawing a new duct — snaps the click point itself to a nearby compatible port before the segment even exists. */
export function findNearestPortToPoint(
  point: Vec2,
  objects: FabricObject[],
  compatibleKind: PortKind,
  radiusPx: number,
): WorldPort | null {
  let best: WorldPort | null = null;
  let bestDist = radiusPx;
  for (const obj of objects) {
    for (const wp of getWorldPorts(obj)) {
      if (!portsCompatible(compatibleKind, wp.port.kind)) continue;
      const d = Math.hypot(wp.worldX - point.x, wp.worldY - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = wp;
      }
    }
  }
  return best;
}
