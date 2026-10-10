import { nanoid } from 'nanoid';
import { db } from './index';
import type { Project, PlanPage, StlAsset } from './schema';
import { isValidMeshTransform, MAX_STL_FILE_BYTES } from '../lib/stl/stl';

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
  const updated = await db.planPages.update(planPageId, { canvasJSON });
  if (updated !== 1) throw new Error('Plan page no longer exists, so the drawing was not saved.');
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
    [db.projects, db.planPages, db.ductRuns, db.fittings, db.terminals, db.equipment, db.costItems, db.zones, db.stlAssets],
    async () => {
      const pages = await db.planPages.where({ projectId }).toArray();
      const pageIds = pages.map((p) => p.id);
      // A newly created project may not have a page yet. Avoid anyOf([]) in that case.
      if (pageIds.length > 0) {
        await db.ductRuns.where('planPageId').anyOf(pageIds).delete();
        await db.fittings.where('planPageId').anyOf(pageIds).delete();
        await db.terminals.where('planPageId').anyOf(pageIds).delete();
        await db.equipment.where('planPageId').anyOf(pageIds).delete();
      }
      await db.costItems.where({ projectId }).delete();
      await db.zones.where({ projectId }).delete();
      await db.stlAssets.where({ projectId }).delete();
      await db.planPages.where({ projectId }).delete();
      await db.projects.delete(projectId);
    },
  );
}


export async function createStlAsset(projectId: string, file: File): Promise<StlAsset> {
  if (file.size > MAX_STL_FILE_BYTES) throw new Error('STL exceeds the 100 MB storage limit.');
  const now = Date.now();
  const asset: StlAsset = {
    id: nanoid(),
    projectId,
    name: file.name.replace(/\.stl$/i, '') || 'Imported STL',
    sourceFile: file,
    transform: {
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rotateXDeg: 0,
      rotateYDeg: 0,
      rotateZDeg: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  await db.stlAssets.add(asset);
  await touchProject(projectId);
  return asset;
}

export async function updateStlAssetTransform(
  id: string,
  transform: StlAsset['transform'],
): Promise<void> {
  if (!isValidMeshTransform(transform)) throw new Error('Invalid STL scale or rotation: edits not saved.');
  const asset = await db.stlAssets.get(id);
  if (!asset) throw new Error('The STL asset no longer exists.');
  if (Object.keys(transform).every((key) => transform[key as keyof typeof transform] === asset.transform[key as keyof typeof transform])) return;
  const updated = await db.stlAssets.update(id, { transform, updatedAt: Date.now() });
  if (updated !== 1) throw new Error('Could not save STL transform.');
  await touchProject(asset.projectId);
}

export async function deleteStlAsset(id: string): Promise<void> {
  const asset = await db.stlAssets.get(id);
  await db.stlAssets.delete(id);
  if (asset) await touchProject(asset.projectId);
}


export async function renameProject(projectId: string, name: string): Promise<void> {
  const nextName = name.trim();
  if (!nextName) throw new Error('Project name cannot be empty.');
  const updated = await db.projects.update(projectId, { name: nextName, updatedAt: Date.now() });
  if (updated !== 1) throw new Error('Project no longer exists.');
}

export async function duplicateProject(projectId: string): Promise<Project> {
  const source = await db.projects.get(projectId);
  if (!source) throw new Error('Project no longer exists.');

  const now = Date.now();
  const copy: Project = {
    ...source,
    id: nanoid(),
    name: `${source.name} — Copy`,
    createdAt: now,
    updatedAt: now,
    revision: 'A',
    ductColorOverrides: { ...source.ductColorOverrides },
  };

  await db.transaction('rw', [db.projects, db.planPages, db.stlAssets], async () => {
    await db.projects.add(copy);

    const pages = await db.planPages.where({ projectId }).sortBy('order');
    for (const page of pages) {
      await db.planPages.add({
        ...page,
        id: nanoid(),
        projectId: copy.id,
        scale: {
          ...page.scale,
          referencePoints: page.scale.referencePoints
            ? [
                { ...page.scale.referencePoints[0] },
                { ...page.scale.referencePoints[1] },
              ]
            : null,
        },
      });
    }

    const assets = await db.stlAssets.where({ projectId }).toArray();
    for (const asset of assets) {
      await db.stlAssets.add({
        ...asset,
        id: nanoid(),
        projectId: copy.id,
        transform: { ...asset.transform },
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  return copy;
}
