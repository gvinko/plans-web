import { useEffect, useRef } from 'react';
import { StaticCanvas } from 'fabric';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { CATALOG } from '../lib/catalog/registry';
import type { ComponentCategory, ComponentDef, IconStyle } from '../lib/catalog/types';

interface ComponentPaletteProps {
  pendingComponentId: string | null;
  onSelect: (componentId: string) => void;
  onCancel: () => void;
  iconStyle: IconStyle;
}

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  equipment: 'Equipment',
  fitting: 'Fittings',
  terminal: 'Terminals',
};

function ComponentThumbnail({ component, style }: { component: ComponentDef; style: IconStyle }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const preview = new StaticCanvas(element, { width: 54, height: 44, backgroundColor: '#0f172a' });
    const object = component.build(style);
    object.set({ selectable: false, evented: false });
    object.scaleToWidth(44);
    if (object.getScaledHeight() > 34) object.scaleToHeight(34);
    object.set({ left: 27, top: 22, originX: 'center', originY: 'center' });
    preview.add(object);
    preview.renderAll();
    return () => {
      void preview.dispose();
    };
  }, [component, style]);

  return <canvas ref={canvasRef} className="w-[54px] h-11 rounded bg-slate-950 shrink-0" aria-hidden="true" />;
}

export default function ComponentPalette({ pendingComponentId, onSelect, onCancel, iconStyle }: ComponentPaletteProps) {
  const categories: ComponentCategory[] = ['equipment', 'fitting', 'terminal'];
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

      {categories.map((cat) => (
        <div key={cat} className="px-3 py-2">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{CATEGORY_LABELS[cat]}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {CATALOG.filter((c) => c.category === cat).map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                title={c.label}
                className={`min-w-0 text-center text-[10px] leading-tight px-1 py-1.5 rounded border ${
                  pendingComponentId === c.id ? 'bg-sky-700 border-sky-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <ComponentThumbnail component={c} style={iconStyle} />
                <span className="block mt-1 line-clamp-2 min-h-5">{c.label}</span>
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
