import type { PortSize } from './catalog/types';

export type UnitSystem = 'metric' | 'imperial';

export function mmToIn(mm: number): number {
  return mm / 25.4;
}

export function metersToFeet(m: number): number {
  return m * 3.28084;
}

export function lsToCfm(ls: number): number {
  return ls * 2.11888;
}

export function msToFpm(ms: number): number {
  return ms * 196.85;
}

export function formatSizeMm(size: PortSize | null, system: UnitSystem): string {
  if (!size) return '\u2014';
  if ('diameter' in size) {
    return system === 'metric' ? `\u00D8${size.diameter} mm` : `\u00D8${mmToIn(size.diameter).toFixed(1)} in`;
  }
  return system === 'metric'
    ? `${size.width}\u00D7${size.depth} mm`
    : `${mmToIn(size.width).toFixed(1)}\u00D7${mmToIn(size.depth).toFixed(1)} in`;
}

export interface FormattedQuantity {
  value: number;
  unit: string;
}

/** unitLabel 'ea' passes through unchanged; 'm' converts to feet under the imperial system. */
export function formatQuantity(qty: number, unitLabel: 'm' | 'ea', system: UnitSystem): FormattedQuantity {
  if (unitLabel === 'ea') return { value: qty, unit: 'ea' };
  return system === 'metric' ? { value: qty, unit: 'm' } : { value: metersToFeet(qty), unit: 'ft' };
}
