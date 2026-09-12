import { db } from '../../db';
import type { PlandroidRecordLike } from './takeoff';

function extractObjects(json: unknown): PlandroidRecordLike[] {
  const objects = (json as { objects?: unknown[] } | null)?.objects;
  return Array.isArray(objects) ? (objects as PlandroidRecordLike[]) : [];
}

export async function collectProjectRecords(
  projectId: string,
  livePageId: string | null,
  liveCanvasJson: unknown | null,
): Promise<PlandroidRecordLike[]> {
  const pages = await db.planPages.where({ projectId }).toArray();
  const records: PlandroidRecordLike[] = [];

  for (const page of pages) {
    if (page.id === livePageId && liveCanvasJson) {
      records.push(...extractObjects(liveCanvasJson));
    } else if (page.canvasJSON) {
      records.push(...extractObjects(JSON.parse(page.canvasJSON)));
    }
  }

  return records;
}
