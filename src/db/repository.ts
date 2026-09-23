import { nanoid } from 'nanoid';
import { db } from './index';
import type { Project, PlanPage } from './schema';

export async function createProject(name: string, designer = ''): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: nanoid(),
    name,
    designer,
    client: '',
    unitSystem: 'metric',
    iconStyle: 'professional',
    ductColorOverrides: {},
    createdAt: now,
    updatedAt: now,
    revision: 'A',
  };
  await db.projects.add(project);
  return project;
}

export async function createPlanPage(projectId: string, name: string): Promise<PlanPage> {
  const pages = await db.planPages.where({ projectId }).toArray();
  const page: PlanPage = {
    id: nanoid(),
    projectId,
    name,
    order: pages.length,
    backgroundImage: null,
    backgroundImageWidthPx: 0,
    backgroundImageHeightPx: 0,
    scale: { pxPerMm: null, calibratedAt: null, referencePoints: null, referenceLengthMm: null },
    northAngleDeg: 0,
    canvasJSON: null,
    sketchImage: null,
    sketchWidthPx: 0,
    sketchHeightPx: 0,
    sketchOpacity: 0.35,
  };
  await db.planPages.add(page);
  return page;
}

export async function touchProject(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: Date.now() });
}

export async function saveCanvasState(planPageId: string, canvasJSON: string): Promise<void> {
  await db.planPages.update(planPageId, { canvasJSON });
}

export async function setPageScale(
  planPageId: string,
  referencePoints: [{ x: number; y: number }, { x: number; y: number }],
  referenceLengthMm: number,
): Promise<number> {
  const [p1, p2] = referencePoints;
  const pxDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const pxPerMm = pxDist / referenceLengthMm;
  await db.planPages.update(planPageId, {
    scale: { pxPerMm, calibratedAt: Date.now(), referencePoints, referenceLengthMm },
  });
  return pxPerMm;
}

export async function setUnitSystem(projectId: string, unitSystem: Project['unitSystem']): Promise<void> {
  await db.projects.update(projectId, { unitSystem });
}

export async function setIconStyle(projectId: string, iconStyle: Project['iconStyle']): Promise<void> {
  await db.projects.update(projectId, { iconStyle });
}

export async function setDuctColorOverride(projectId: string, sizeKey: string, colorHex: string | null): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) return;
  const overrides = { ...project.ductColorOverrides };
  if (colorHex) overrides[sizeKey] = colorHex;
  else delete overrides[sizeKey];
  await db.projects.update(projectId, { ductColorOverrides: overrides });
}

export async function setBackgroundImage(
  planPageId: string,
  blob: Blob,
  widthPx: number,
  heightPx: number,
): Promise<void> {
  await db.planPages.update(planPageId, {
    backgroundImage: blob,
    backgroundImageWidthPx: widthPx,
    backgroundImageHeightPx: heightPx,
    // new raster invalidates any prior calibration — real-world reference no longer applies
    scale: { pxPerMm: null, calibratedAt: null, referencePoints: null, referenceLengthMm: null },
  });
}

export async function setSketchOverlay(planPageId: string, blob: Blob, widthPx: number, heightPx: number): Promise<void> {
  await db.planPages.update(planPageId, {
    sketchImage: blob,
    sketchWidthPx: widthPx,
    sketchHeightPx: heightPx,
    sketchOpacity: 0.35,
  });
}

export async function setSketchOpacity(planPageId: string, opacity: number): Promise<void> {
  await db.planPages.update(planPageId, { sketchOpacity: opacity });
}

export async function deleteProjectCascade(projectId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.planPages, db.ductRuns, db.fittings, db.terminals, db.equipment, db.costItems],
    async () => {
      const pages = await db.planPages.where({ projectId }).toArray();
      const pageIds = pages.map((p) => p.id);
      await db.ductRuns.where('planPageId').anyOf(pageIds).delete();
      await db.fittings.where('planPageId').anyOf(pageIds).delete();
      await db.terminals.where('planPageId').anyOf(pageIds).delete();
      await db.equipment.where('planPageId').anyOf(pageIds).delete();
      await db.costItems.where({ projectId }).delete();
      await db.planPages.where({ projectId }).delete();
      await db.projects.delete(projectId);
    },
  );
}
