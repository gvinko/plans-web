import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { createZone } from '../db/zoneRepository';

interface ZoneAssignPopoverProps {
  projectId: string;
  screenX: number;
  screenY: number;
  currentZoneId: string | null;
  onAssign: (zoneId: string | null, color: string | null) => void;
}

export default function ZoneAssignPopover({ projectId, screenX, screenY, currentZoneId, onAssign }: ZoneAssignPopoverProps) {
  const zones = useLiveQuery(() => db.zones.where({ projectId }).toArray(), [projectId]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const zone = await createZone(projectId, name);
    onAssign(zone.id, zone.color);
    setIsCreating(false);
    setNewName('');
  }

  return (
    <div
      style={{ left: screenX, top: screenY }}
      className="absolute z-20 -translate-x-1/2 -translate-y-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs font-mono shadow-xl w-48"
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Zone</div>

      <div className="space-y-1 max-h-40 overflow-y-auto">
        <button
          onClick={() => onAssign(null, null)}
          className={`w-full text-left px-2 py-1 rounded flex items-center gap-2 ${
            !currentZoneId ? 'bg-slate-700' : 'hover:bg-slate-700'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full border border-slate-500" />
          No zone
        </button>
        {zones?.map((zone) => (
          <button
            key={zone.id}
            onClick={() => onAssign(zone.id, zone.color)}
            className={`w-full text-left px-2 py-1 rounded flex items-center gap-2 truncate ${
              currentZoneId === zone.id ? 'bg-slate-700' : 'hover:bg-slate-700'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
            <span className="truncate">{zone.name}</span>
          </button>
        ))}
      </div>

      {isCreating ? (
        <div className="mt-2 flex gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Zone name"
            className="flex-1 bg-slate-900 border border-slate-600 rounded px-1.5 py-1 min-w-0"
          />
          <button onClick={handleCreate} className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500">
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="mt-2 w-full text-left px-2 py-1 rounded text-sky-400 hover:bg-slate-700"
        >
          + New Zone
        </button>
      )}
    </div>
  );
}
