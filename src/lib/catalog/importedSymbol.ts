import { Rect, FabricText, Group } from 'fabric';
import type { PortDef } from './types';
import { parseDimensionsToPortSize } from './parseDimensions';
import { setPlandroidData } from '../canvas/plandroidData';
import type { ImportedCatalogItem } from '../../db/schema';

export function buildImportedCatalogSymbol(item: ImportedCatalogItem): Group {
  const w = 90;
  const h = 40;
  const size = parseDimensionsToPortSize(item.dimensions);
  const kind: PortDef['kind'] = 'diameter' in size ? 'duct_round' : 'duct_rect';

  const footprint = new Rect({
    left: 0,
    top: 0,
    width: w,
    height: h,
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: 'transparent',
    selectable: false,
    evented: false,
  });
  const body = new Rect({
    left: 0,
    top: 0,
    width: w - 10,
    height: h - 10,
    originX: 'center',
    originY: 'center',
    fill: '#312e81',
    stroke: '#94a3b8',
    strokeWidth: 1.5,
    rx: 3,
    ry: 3,
  });
  const label = new FabricText(item.itemName.length > 16 ? `${item.itemName.slice(0, 15)}\u2026` : item.itemName, {
    left: 0,
    top: 0,
    fontSize: 8,
    fill: '#e2e8f0',
    originX: 'center',
    originY: 'center',
  });

  const group = new Group([footprint, body, label], { originX: 'center', originY: 'center' });

  const ports: PortDef[] = [
    { id: 'in', x: -w / 2, y: 0, angleDeg: 180, kind, sizeMm: size },
    { id: 'out', x: w / 2, y: 0, angleDeg: 0, kind, sizeMm: size },
  ];

  setPlandroidData(group, {
    plandroidKind: 'fitting',
    plandroidComponentId: item.id,
    plandroidPorts: ports,
    plandroidImportedMeta: {
      itemName: item.itemName,
      category: item.category,
      unitCost: item.sellPrice || item.baseCost || 0,
    },
  });

  return group;
}
