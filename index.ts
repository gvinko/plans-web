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

    // v2 (Phase 5): imported Excel/CSV price-book tables. Every table from v1 must be
    // re-listed here — Dexie deletes any store omitted from a later version's stores().
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
  }
}

export const db = new PlandroidDB();
