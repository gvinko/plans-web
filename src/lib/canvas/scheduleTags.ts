import type { Canvas } from 'fabric';
import { getPlandroidData } from './plandroidData';

const PREFIX_BY_COMPONENT_ID: Record<string, string> = {
  'fan-coil-unit': 'FCU',
  'plenum-supply-2way': 'PLN-S',
  'plenum-supply-3way': 'PLN-S',
  'plenum-return': 'PLN-R',
  'diffuser-supply4way': 'DIFF',
  'diffuser-swirl': 'DIFF',
  'diffuser-linear-slot': 'GRL',
  'fitting-straight': 'CPL',
  'fitting-reducer': 'RED',
  'fitting-elbow-90': 'ELB',
  'fitting-elbow-45': 'ELB',
};

function prefixFor(componentId: string, label: string): string {
  if (PREFIX_BY_COMPONENT_ID[componentId]) return PREFIX_BY_COMPONENT_ID[componentId];
  const letters = label.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  return letters || 'ITEM';
}

/** Scoped to the current page's live canvas (schedule tags are per-page, matching the schedule panel's own scope). */
export function nextScheduleTag(canvas: Canvas, componentId: string, label: string): string {
  const prefix = prefixFor(componentId, label);
  let maxN = 0;
  for (const obj of canvas.getObjects()) {
    const tag = getPlandroidData(obj)?.plandroidScheduleTag;
    if (!tag || !tag.startsWith(`${prefix}-`)) continue;
    const n = Number(tag.slice(prefix.length + 1));
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  return `${prefix}-${maxN + 1}`;
}
