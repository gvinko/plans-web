import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { createZone, renameZone, setZoneColor, deleteZone } from '../db/zoneRepository';

interface ZonesManagerDialogProps {
  projectId: string;
  onClose: () => void;
}

export default function ZonesManagerDialog({ projectId, onClose }: ZonesManagerDialogProps) {
  const zones = useLiveQuery(() => db.zones.where({ projectId }).toArray(), [projectId]);
  const [newName, setNewName] = useState('');

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    await createZone(projectId, name);
    setNewName('');
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-mono">Zones</h2>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
            Close
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {zones?.length === 0 && <p className="text-xs text-slate-500">No zones yet — trace a room, select it, and choose "+ New Zone".</p>}
          {zones?.map((zone) => (
            <div key={zone.id} className="flex items-center gap-2 text-xs">
              <input
                type="color"
                value={zone.color}
                onChange={(e) => setZoneColor(zone.id, e.target.value)}
                className="w-7 h-7 rounded border border-slate-700 bg-slate-800 cursor-pointer shrink-0"
              />
              <input
                value={zone.name}
                onChange={(e) => renameZone(zone.id, e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 min-w-0"
              />
              <button onClick={() => deleteZone(zone.id)} className="text-red-400 hover:text-red-300 shrink-0">
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="New zone name"
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs min-w-0"
          />
          <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
