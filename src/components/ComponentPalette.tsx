import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { CATALOG } from '../lib/catalog/registry';
import type { ComponentCategory } from '../lib/catalog/types';

interface ComponentPaletteProps {
  pendingComponentId: string | null;
  onSelect: (componentId: string) => void;
  onCancel: () => void;
  section?: 'HVAC' | 'FITTINGS' | 'OUTLETS' | 'CONTROLS';
}

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  equipment: 'Equipment',
  fitting: 'Fittings',
  terminal: 'Terminals',
};

export default function ComponentPalette({ pendingComponentId, onSelect, onCancel, section = 'HVAC' }: ComponentPaletteProps) {
  const categories: ComponentCategory[] = section === 'FITTINGS' ? ['fitting'] : section === 'OUTLETS' ? ['terminal'] : ['equipment'];
  const visibleCatalog = CATALOG.filter((item) => {
    if (section === 'FITTINGS') return item.category === 'fitting';
    if (section === 'OUTLETS') return item.category === 'terminal';
    if (section === 'CONTROLS') return item.id.startsWith('wall-') || item.id.startsWith('zone-motor-');
    return item.category === 'equipment' && !item.id.startsWith('wall-') && !item.id.startsWith('zone-motor-');
  });
  const importedEquipment = useLiveQuery(() => db.equipmentCatalog.toArray(), []);
  const importedFittings = useLiveQuery(() => db.fittingsCatalog.toArray(), []);

  return (
    <aside className="w-56 shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-y-auto">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-400">CATALOG</span>
        {pendingComponentId && (
          <button className="text-xs text-red-400 hover:text-red-300" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {section === 'HVAC' && <div className="px-3 py-3 border-b border-slate-700">
        <h3 className="text-[10px] uppercase tracking-wide text-sky-400 mb-2">Ducted Indoor Unit — choose brand</h3>
        <div className="grid grid-cols-2 gap-1">
          {['Daikin','Fujitsu','ActronAir','Mitsubishi Electric'].map((b)=><button key={b} onClick={()=>onSelect(`indoor-unit|Standard Ducted|${b}|Ducted|`)} className="text-left text-xs px-2 py-2 rounded bg-sky-900 hover:bg-sky-800">{b}</button>)}
        </div>
      </div>}

      {categories.map((cat) => (
        <div key={cat} className="px-3 py-2">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{CATEGORY_LABELS[cat]}</h3>
          <div className="space-y-1">
            {visibleCatalog.filter((c) => c.category === cat).map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded ${
                  pendingComponentId === c.id ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {(importedEquipment?.length || importedFittings?.length) ? (
        <div className="px-3 py-2 border-t border-slate-700">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Imported Price Book</h3>
          <div className="space-y-1">
            {[...(importedEquipment ?? []), ...(importedFittings ?? [])].map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                title={item.dimensions ?? undefined}
                className={`w-full text-left text-xs px-2 py-1.5 rounded truncate ${
                  pendingComponentId === item.id ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {item.itemName}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
