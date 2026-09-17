import Dexie, { type EntityTable } from 'dexie';
import type {
  Project,
  PlanPage,
  DuctRun,
  Fitting,
  Terminal,
  Equipment,
  CostItem,
  ImportedCatalogItem,
  Zone,
  AppSettings,
} from './schema';

class PlandroidDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  planPages!: EntityTable<PlanPage, 'id'>;
  ductRuns!: EntityTable<DuctRun, 'id'>;
  fittings!: EntityTable<Fitting, 'id'>;
  terminals!: EntityTable<Terminal, 'id'>;
  equipment!: EntityTable<Equipment, 'id'>;
  costItems!: EntityTable<CostItem, 'id'>;
  equipmentCatalog!: EntityTable<ImportedCatalogItem, 'id'>;
  ductworkCatalog!: EntityTable<ImportedCatalogItem, 'id'>;
  fittingsCatalog!: EntityTable<ImportedCatalogItem, 'id'>;
  zones!: EntityTable<Zone, 'id'>;
  appSettings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('plandroid_web');

    this.version(1).stores({
      projects: 'id, name, updatedAt',
      planPages: 'id, projectId, order',
      ductRuns: 'id, planPageId, zoneName',
      fittings: 'id, planPageId, type',
      terminals: 'id, planPageId, zoneName',
      equipment: 'id, planPageId, kind',
      costItems: 'id, projectId, category',
    });

    // v2 (Phase 5): imported Excel/CSV price-book tables.
    this.version(2).stores({
      projects: 'id, name, updatedAt',
      planPages: 'id, projectId, order',
      ductRuns: 'id, planPageId, zoneName',
      fittings: 'id, planPageId, type',
      terminals: 'id, planPageId, zoneName',
      equipment: 'id, planPageId, kind',
      costItems: 'id, projectId, category',
      equipmentCatalog: 'id, category, itemName',
      ductworkCatalog: 'id, category, itemName',
      fittingsCatalog: 'id, category, itemName',
    });

    // v3: zones (room/equipment color grouping) + global company branding settings.
    // Every table from prior versions must be re-listed — Dexie deletes any store omitted here.
    this.version(3).stores({
      projects: 'id, name, updatedAt',
      planPages: 'id, projectId, order',
      ductRuns: 'id, planPageId, zoneName',
      fittings: 'id, planPageId, type',
      terminals: 'id, planPageId, zoneName',
      equipment: 'id, planPageId, kind',
      costItems: 'id, projectId, category',
      equipmentCatalog: 'id, category, itemName',
      ductworkCatalog: 'id, category, itemName',
      fittingsCatalog: 'id, category, itemName',
      zones: 'id, projectId',
      appSettings: 'id',
    });
  }
}

export const db = new PlandroidDB();
