"use client";

import React, { useMemo, useState } from "react";
import { useFloorPlanStore } from "../store/floorPlanStore";
import { validateDocument } from "../lib/validate";
import { exportModel, downloadFile } from "../lib/exportMesh";
import FurniturePalette from "./FurniturePalette";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-white/70">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-24 rounded border border-white/15 bg-white/5 px-2 py-1 text-right text-xs text-white outline-none focus:border-amber-500";

export default function ControlsPanel() {
  const doc = useFloorPlanStore((s) => s.doc);
  const updateDocSettings = useFloorPlanStore((s) => s.updateDocSettings);
  const updateRoofSettings = useFloorPlanStore((s) => s.updateRoofSettings);
  const updatePrintSettings = useFloorPlanStore((s) => s.updatePrintSettings);
  const selectedWallId = useFloorPlanStore((s) => s.selectedWallId);
  const updateWall = useFloorPlanStore((s) => s.updateWall);
  const removeWall = useFloorPlanStore((s) => s.removeWall);
  const selectedFurnitureId = useFloorPlanStore((s) => s.selectedFurnitureId);
  const updateFurniture = useFloorPlanStore((s) => s.updateFurniture);
  const removeFurniture = useFloorPlanStore((s) => s.removeFurniture);

  const [tab, setTab] = useState<"plan" | "furniture" | "roof" | "print">("plan");
  const [exporting, setExporting] = useState(false);

  const selectedWall = doc.walls.find((w) => w.id === selectedWallId) || null;
  const selectedFurniture = doc.furniture.find((f) => f.id === selectedFurnitureId) || null;
  const issues = useMemo(() => validateDocument(doc), [doc]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const files = exportModel(doc);
      files.forEach(downloadFile);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#12151b] p-3 text-white">
      <div className="mb-3 flex gap-1">
        {(["plan", "furniture", "roof", "print"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
              tab === t ? "bg-white/15" : "bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "plan" && (
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-white/50">Defaults</h3>
            <Field label="Wall thickness (mm)">
              <input
                type="number"
                className={inputCls}
                value={doc.defaultWallThicknessMm}
                min={2}
                max={8}
                step={0.5}
                onChange={(e) => updateDocSettings({ defaultWallThicknessMm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Wall height (mm)">
              <input
                type="number"
                className={inputCls}
                value={doc.defaultWallHeightMm}
                onChange={(e) => updateDocSettings({ defaultWallHeightMm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Snap to grid">
              <input
                type="checkbox"
                checked={doc.snapToGrid}
                onChange={(e) => updateDocSettings({ snapToGrid: e.target.checked })}
              />
            </Field>
            <Field label="Grid size (mm)">
              <input
                type="number"
                className={inputCls}
                value={doc.gridSizeMm}
                onChange={(e) => updateDocSettings({ gridSizeMm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Angle snap (°, 0=off)">
              <input
                type="number"
                className={inputCls}
                value={doc.angleSnapDeg}
                onChange={(e) => updateDocSettings({ angleSnapDeg: Number(e.target.value) })}
              />
            </Field>
          </section>

          {selectedWall && (
            <section className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <h3 className="text-xs font-semibold text-amber-300">Selected wall</h3>
              <Field label="Thickness (mm)">
                <input
                  type="number"
                  className={inputCls}
                  value={selectedWall.thicknessMm}
                  onChange={(e) => updateWall(selectedWall.id, { thicknessMm: Number(e.target.value) })}
                />
              </Field>
              <Field label="Height (mm)">
                <input
                  type="number"
                  className={inputCls}
                  value={selectedWall.heightMm}
                  onChange={(e) => updateWall(selectedWall.id, { heightMm: Number(e.target.value) })}
                />
              </Field>
              {selectedWall.openings.map((o) => (
                <div key={o.id} className="rounded border border-white/10 p-1.5 text-[11px] text-white/70">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="capitalize">{o.type}</span>
                  </div>
                  <Field label="Sill (mm)">
                    <input
                      type="number"
                      className={inputCls}
                      value={o.sillHeight}
                      onChange={(e) =>
                        useFloorPlanStore
                          .getState()
                          .updateOpening(selectedWall.id, o.id, { sillHeight: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Header (mm)">
                    <input
                      type="number"
                      className={inputCls}
                      value={o.headerHeight}
                      onChange={(e) =>
                        useFloorPlanStore
                          .getState()
                          .updateOpening(selectedWall.id, o.id, { headerHeight: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Width (mm)">
                    <input
                      type="number"
                      className={inputCls}
                      value={o.width}
                      onChange={(e) =>
                        useFloorPlanStore
                          .getState()
                          .updateOpening(selectedWall.id, o.id, { width: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
              ))}
              <button
                onClick={() => removeWall(selectedWall.id)}
                className="mt-1 w-full rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/30"
              >
                Delete wall
              </button>
            </section>
          )}
        </div>
      )}

      {tab === "furniture" && (
        <div className="space-y-3">
          <FurniturePalette />
          {selectedFurniture && (
            <section className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <h3 className="text-xs font-semibold text-amber-300">Selected piece</h3>
              <Field label="Rotation (°)">
                <input
                  type="number"
                  className={inputCls}
                  value={selectedFurniture.rotationDeg}
                  onChange={(e) => updateFurniture(selectedFurniture.id, { rotationDeg: Number(e.target.value) })}
                />
              </Field>
              <Field label="Scale ×">
                <input
                  type="number"
                  step={0.05}
                  className={inputCls}
                  value={selectedFurniture.scale}
                  onChange={(e) => updateFurniture(selectedFurniture.id, { scale: Number(e.target.value) })}
                />
              </Field>
              <button
                onClick={() => removeFurniture(selectedFurniture.id)}
                className="w-full rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/30"
              >
                Delete piece
              </button>
            </section>
          )}
        </div>
      )}

      {tab === "roof" && (
        <div className="space-y-2">
          <Field label="Enabled">
            <input
              type="checkbox"
              checked={doc.roof.enabled}
              onChange={(e) => updateRoofSettings({ enabled: e.target.checked })}
            />
          </Field>
          <Field label="Style">
            <select
              className={inputCls}
              value={doc.roof.style}
              onChange={(e) => updateRoofSettings({ style: e.target.value as any })}
            >
              <option value="gable">Gable</option>
              <option value="hip">Hip</option>
              <option value="flat">Flat</option>
            </select>
          </Field>
          <Field label="Pitch (°)">
            <input
              type="number"
              className={inputCls}
              value={doc.roof.pitchDeg}
              onChange={(e) => updateRoofSettings({ pitchDeg: Number(e.target.value) })}
            />
          </Field>
          <Field label="Overhang (mm)">
            <input
              type="number"
              className={inputCls}
              value={doc.roof.overhangMm}
              onChange={(e) => updateRoofSettings({ overhangMm: Number(e.target.value) })}
            />
          </Field>
          <Field label="Panel thickness (mm)">
            <input
              type="number"
              className={inputCls}
              value={doc.roof.thicknessMm}
              onChange={(e) => updateRoofSettings({ thicknessMm: Number(e.target.value) })}
            />
          </Field>
          <Field label="Lip height (mm)">
            <input
              type="number"
              className={inputCls}
              value={doc.roof.lipHeightMm}
              onChange={(e) => updateRoofSettings({ lipHeightMm: Number(e.target.value) })}
            />
          </Field>
          <Field label="Lip tolerance (mm)">
            <input
              type="number"
              step={0.05}
              className={inputCls}
              value={doc.roof.lipToleranceMm}
              onChange={(e) => updateRoofSettings({ lipToleranceMm: Number(e.target.value) })}
            />
          </Field>
          <p className="pt-1 text-[11px] text-white/40">
            Use the "Roof cutout" tool on the 2D canvas to place skylights / viewing voids.
          </p>
        </div>
      )}

      {tab === "print" && (
        <div className="space-y-3">
          <Field label="Scale preset">
            <select
              className={inputCls}
              value={doc.print.scalePreset}
              onChange={(e) => updatePrintSettings({ scalePreset: e.target.value as any })}
            >
              <option value="1:12">1:12</option>
              <option value="1:24">1:24</option>
              <option value="1:50">1:50</option>
              <option value="1:64">1:64</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          {doc.print.scalePreset === "custom" && (
            <Field label="Custom factor (1/n)">
              <input
                type="number"
                className={inputCls}
                value={Math.round(1 / doc.print.customScaleFactor)}
                onChange={(e) => updatePrintSettings({ customScaleFactor: 1 / Number(e.target.value) })}
              />
            </Field>
          )}
          <Field label="Target bed width (mm)">
            <input
              type="number"
              className={inputCls}
              placeholder="e.g. 220"
              value={doc.print.targetBedWidthMm ?? ""}
              onChange={(e) =>
                updatePrintSettings({ targetBedWidthMm: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <p className="text-[11px] text-white/40">
            If set, overrides the preset above and solves the scale so the longest footprint side fits an
            Ender-3-style {doc.print.targetBedWidthMm ?? 220}mm bed.
          </p>
          <Field label="Baseplate (mm)">
            <input
              type="number"
              className={inputCls}
              value={doc.print.slabThicknessMm}
              onChange={(e) => updatePrintSettings({ slabThicknessMm: Number(e.target.value) })}
            />
          </Field>
          <Field label="Furniture mode">
            <select
              className={inputCls}
              value={doc.print.mergeMode}
              onChange={(e) => updatePrintSettings({ mergeMode: e.target.value as any })}
            >
              <option value="merged">Merged (fused)</option>
              <option value="loose">Loose (play pieces)</option>
            </select>
          </Field>
          <Field label="Export format">
            <select
              className={inputCls}
              value={doc.print.exportFormat}
              onChange={(e) => updatePrintSettings({ exportFormat: e.target.value as any })}
            >
              <option value="stl">STL</option>
              <option value="obj">OBJ</option>
            </select>
          </Field>

          {issues.length > 0 && (
            <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2">
              {issues.map((iss, i) => (
                <p
                  key={i}
                  className={`text-[11px] ${iss.level === "error" ? "text-red-300" : "text-amber-300/90"}`}
                >
                  {iss.level === "error" ? "⛔" : "⚠"} {iss.message}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exporting || doc.walls.length === 0}
            className="w-full rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "Building CSG mesh…" : `Export ${doc.print.exportFormat.toUpperCase()}`}
          </button>
        </div>
      )}
    </div>
  );
}
