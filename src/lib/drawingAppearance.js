// A consistent, neutral architectural layer keeps colour reserved for ductwork.
export const DRAWING_INK = '#334155';

export function zoneAreaStyle(selected = false) {
  return {
    backgroundColor: 'transparent',
    border: selected ? '3px dashed #2563eb' : '2px dashed #94a3b8',
  };
}

export function roomDraftStyle() {
  return { fill: 'none', stroke: DRAWING_INK, strokeWidth: 3, strokeDasharray: '8 5' };
}

export function ductCornerRadius({ width = 0, inv = 1, isSheet = false, scaled = false, isFlex = false, hasBends = false } = {}) {
  // A scaled sheet-metal run must retain square engineered corners.
  if (isSheet && scaled) return 0;
  if (!isFlex) return hasBends ? 6 : 10;
  const viewScale = Number.isFinite(inv) && inv > 0 ? inv : 1;
  const ductWidth = Number.isFinite(width) && width > 0 ? width : 0;
  return Math.max(10 * viewScale, Math.min(ductWidth * 1.5, 45 * viewScale));
}
