// Part angles for plans that don't sit square on the sheet. Angles are degrees, clockwise on screen.

const tidy = (deg) => Math.round(deg * 10) / 10;

export function normDeg(deg) {
  const d = tidy(((Number(deg) || 0) % 360 + 360) % 360);
  return d === 360 ? 0 : d;
}

export function rotatePt(x, y, deg) {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

// The building's angle from two points along a wall: always between -45 and 45, so a wall and the
// one square to it give the same answer.
export function planAngleFrom(a, b) {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const d = ((deg % 90) + 90) % 90;
  return tidy(d > 45 ? d - 90 : d);
}

// The plan-square angle nearest to where the part already points, so it keeps facing the same way.
export function squareToPlan(rot, planAngle) {
  return normDeg(planAngle + Math.round(((rot || 0) - planAngle) / 90) * 90);
}

// Sheet metal draws at 0 / 45 / 90° to the building rather than to the sheet.
export function snapToPlan(rad, planAngle = 0) {
  const off = (planAngle * Math.PI) / 180;
  const step = Math.PI / 4;
  return off + Math.round((rad - off) / step) * step;
}
