import { angleDeg, distance, normalizeDeg, type Vec2 } from './geometry';

const ORTHO_TOLERANCE_DEG = 15;
const CARDINALS_DEG = [0, 90, 180, 270];

/** If the raw angle from `from` to `to` is within 15° of a cardinal direction, projects `to`
 * exactly onto that cardinal ray (same distance from `from`, corrected angle). Otherwise returns `to` unchanged. */
export function snapToOrtho(from: Vec2, to: Vec2): Vec2 {
  if (from.x === to.x && from.y === to.y) return to;

  const rawAngle = normalizeDeg(angleDeg(from, to));
  const dist = distance(from, to);

  let nearestCardinal = CARDINALS_DEG[0];
  let smallestDiff = Infinity;
  for (const cardinal of CARDINALS_DEG) {
    const diff = Math.min(Math.abs(rawAngle - cardinal), 360 - Math.abs(rawAngle - cardinal));
    if (diff < smallestDiff) {
      smallestDiff = diff;
      nearestCardinal = cardinal;
    }
  }

  if (smallestDiff > ORTHO_TOLERANCE_DEG) return to;

  const rad = (nearestCardinal * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * dist, y: from.y + Math.sin(rad) * dist };
}
