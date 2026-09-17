import { nanoid } from 'nanoid';
import { db } from './index';
import type { Zone } from './schema';

/** Distinct, readable-on-dark-background colors, cycled through as zones are created. */
export const ZONE_COLOR_PALETTE = [
  '#38bdf8', // sky
  '#f59e0b', // amber
  '#34d399', // emerald
  '#f472b6', // pink
  '#a78bfa', // violet
  '#fb923c', // orange
  '#4ade80', // green
  '#fb7185', // rose
];

export async function nextZoneColor(projectId: string): Promise<string> {
  const existing = await db.zones.where({ projectId }).count();
  return ZONE_COLOR_PALETTE[existing % ZONE_COLOR_PALETTE.length];
}

export async function createZone(projectId: string, name: string): Promise<Zone> {
  const zone: Zone = {
    id: nanoid(),
    projectId,
    name,
    color: await nextZoneColor(projectId),
    createdAt: Date.now(),
  };
  await db.zones.add(zone);
  return zone;
}

export async function renameZone(zoneId: string, name: string): Promise<void> {
  await db.zones.update(zoneId, { name });
}

export async function setZoneColor(zoneId: string, color: string): Promise<void> {
  await db.zones.update(zoneId, { color });
}

export async function deleteZone(zoneId: string): Promise<void> {
  await db.zones.delete(zoneId);
}
