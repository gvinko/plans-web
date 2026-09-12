import type { PortSize } from './types';

const DEFAULT_SIZE: PortSize = { width: 300, depth: 200 };

/** "400x250", "400×250mm", "Ø200", "D250", a bare "250" (assumed round neck) — best-effort, sheets aren't standardized. */
export function parseDimensionsToPortSize(dimensions: string | null): PortSize {
  if (!dimensions) return DEFAULT_SIZE;
  const trimmed = dimensions.trim();

  if (/^[Øø]/.test(trimmed) || /^d\s*\d/i.test(trimmed) || /diameter/i.test(trimmed)) {
    const n = parseFloat(trimmed.replace(/[^\d.]/g, ''));
    if (Number.isFinite(n)) return { diameter: n };
  }

  const wxd = trimmed.match(/(\d+(?:\.\d+)?)\s*[x×X]\s*(\d+(?:\.\d+)?)/);
  if (wxd) return { width: parseFloat(wxd[1]), depth: parseFloat(wxd[2]) };

  const bareNumber = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (bareNumber) return { diameter: parseFloat(bareNumber[1]) };

  return DEFAULT_SIZE;
}

export function sizeMatches(a: PortSize, b: PortSize, toleranceMm = 5): boolean {
  if ('diameter' in a && 'diameter' in b) return Math.abs(a.diameter - b.diameter) <= toleranceMm;
  if ('width' in a && 'width' in b) {
    return Math.abs(a.width - b.width) <= toleranceMm && Math.abs(a.depth - b.depth) <= toleranceMm;
  }
  return false;
}
