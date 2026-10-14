import { useEffect, useMemo, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CLIMATES, ROOM_TYPES } from '@/lib/heatLoad';
import { suggestModel } from '@/lib/autoLayout';

const DIVERSITY = 0.85;
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

export default function AutoLayoutDialog({ open, onOpenChange, rooms, climate, onClimate, onRoomPatch, zoneNames, fcuLabel, modelGroups, kwOf, onGenerate }) {
  const loadKw = rooms.reduce((n, r) => n + r.kw, 0);
  const needKw = loadKw * DIVERSITY;
  const allModels = useMemo(() => modelGroups.flatMap((g) => g.models), [modelGroups]);
  const suggested = useMemo(() => suggestModel(allModels.filter((m) => /High static Single Phase R32/i.test(m)), needKw, kwOf) || suggestModel(allModels, needKw, kwOf), [allModels, needKw, kwOf]);
  const [model, setModel] = useState('');

  useEffect(() => {
    if (open) setModel(suggested);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const zonesUsed = new Set(rooms.map((r) => r.zone || 'Zone 1'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auto duct layout</DialogTitle>
          <DialogDescription>Set each room's type and zone. The heat load updates as you go; then generate layout options to preview and select.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Climate</span>
            <select className={selectClass} value={climate} onChange={(e) => onClimate(e.target.value)}>
              {Object.entries(CLIMATES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </label>

          {rooms.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No rooms yet. Use the Room tool to drag a box over each room on the plan (set the scale first), or add Zone Areas. Then come back here.
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-2 py-1.5">Room</th>
                    <th className="text-left font-medium px-2 py-1.5">Type</th>
                    <th className="text-left font-medium px-2 py-1.5">Zone</th>
                    <th className="text-right font-medium px-2 py-1.5">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{`${r.area.toFixed(1)} m²`}</div>
                      </td>
                      <td className="px-2 py-1.5 min-w-[130px]">
                        <select className={selectClass} value={r.type} onChange={(e) => onRoomPatch(r, { type: e.target.value })}>
                          {Object.entries(ROOM_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 min-w-[100px]">
                        <select className={selectClass} value={r.zone || 'Zone 1'} disabled={r.kind === 'zone'} onChange={(e) => onRoomPatch(r, { zone: e.target.value })}>
                          {zoneNames.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">{`${r.kw.toFixed(1)} kW`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total load</div>
              <div className="text-base font-semibold tabular-nums">{`${loadKw.toFixed(1)} kW`}</div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{`At ${Math.round(DIVERSITY * 100)}% diversity`}</div>
              <div className="text-base font-semibold tabular-nums">{`${needKw.toFixed(1)} kW`}</div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Zones</div>
              <div className="text-base font-semibold tabular-nums">{zonesUsed.size}</div>
            </div>
          </div>

          {fcuLabel ? (
            <p className="text-xs text-muted-foreground">{`Using the indoor unit already on the plan: ${fcuLabel}. Its supply side must be clear.`}</p>
          ) : (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Indoor unit (suggested for the load — change if you like)</span>
              <select className={selectClass} value={model} onChange={(e) => setModel(e.target.value)}>
                {modelGroups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">Heat load is a quoting guide (roof, walls, glass, air leakage, people, appliances). Edit window facing, glass area, ceiling and walls per room in the Selection panel.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!rooms.length} onClick={() => onGenerate({ model: fcuLabel ? null : model })}>
            <ApperIcon name="Sparkles" size={16} />
            Generate options
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
