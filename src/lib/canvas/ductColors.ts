export interface RoundSizePreset {
  inch: number;
  mm: number;
  color: string;
}

/** Function-based defaults matching common site drawing convention — green supply, red return/mains, grey flex. */
export const DEFAULT_SUPPLY_COLOR = '#22c55e';
export const DEFAULT_RETURN_COLOR = '#ef4444';
export const DEFAULT_FLEX_COLOR = '#9ca3af';

/** Standard nominal round duct sizes with a default color-code — a common site convention
 * for telling sizes apart at a glance on a printed drawing. Only applied when a size-specific
 * override hasn't been set; otherwise the supply/return function color above wins. */
export const ROUND_DUCT_PRESETS: RoundSizePreset[] = [
  { inch: 8, mm: 200, color: '#38bdf8' },
  { inch: 10, mm: 250, color: '#34d399' },
  { inch: 12, mm: 300, color: '#facc15' },
  { inch: 14, mm: 350, color: '#a855f7' },
  { inch: 16, mm: 400, color: '#f97316' },
  { inch: 18, mm: 450, color: '#ec4899' },
];

const NOMINAL_TOLERANCE_MM = 15;

export function nearestRoundPreset(diameterMm: number): RoundSizePreset | null {
  let best: RoundSizePreset | null = null;
  let bestDiff = NOMINAL_TOLERANCE_MM;
  for (const preset of ROUND_DUCT_PRESETS) {
    const diff = Math.abs(preset.mm - diameterMm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = preset;
    }
  }
  return best;
}

export function roundSizeKey(diameterMm: number): string {
  const preset = nearestRoundPreset(diameterMm);
  return `round:${preset ? preset.mm : Math.round(diameterMm)}`;
}

export function rectSizeKey(widthMm: number, depthMm: number): string {
  return `rect:${widthMm}x${depthMm}`;
}

/** overrides is Project.ductColorOverrides. fallbackColor is the app's existing default
 * (sky for flex, slate for rigid) used when there's no override and no matching preset. */
export function resolveRoundDuctColor(diameterMm: number, overrides: Record<string, string>, fallbackColor: string): string {
  const key = roundSizeKey(diameterMm);
  if (overrides[key]) return overrides[key];
  const preset = nearestRoundPreset(diameterMm);
  return preset ? preset.color : fallbackColor;
}

export function resolveRectDuctColor(widthMm: number, depthMm: number, overrides: Record<string, string>, fallbackColor: string): string {
  const key = rectSizeKey(widthMm, depthMm);
  return overrides[key] ?? fallbackColor;
}
