export interface RoundSizePreset {
  inch: number;
  mm: number;
  color: string;
}

/** Standard nominal round duct sizes with a default color-code — a common site convention
 * for telling sizes apart at a glance on a printed drawing. */
export const ROUND_DUCT_PRESETS: RoundSizePreset[] = [
  { inch: 8, mm: 200, color: '#38bdf8' }, // sky
  { inch: 10, mm: 250, color: '#34d399' }, // emerald
  { inch: 12, mm: 300, color: '#f59e0b' }, // amber
  { inch: 14, mm: 350, color: '#f472b6' }, // pink
  { inch: 16, mm: 400, color: '#a78bfa' }, // violet
  { inch: 18, mm: 450, color: '#fb7185' }, // rose
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
