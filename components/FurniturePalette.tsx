"use client";

import React from "react";
import { useFloorPlanStore } from "../store/floorPlanStore";
import { FURNITURE_CATEGORIES, FURNITURE_LIBRARY } from "../lib/furniture";
import { FurniturePrimitiveId } from "../lib/types";

export default function FurniturePalette() {
  const active = useFloorPlanStore((s) => s.activeFurniturePrimitive);
  const setActive = useFloorPlanStore((s) => s.setActiveFurniturePrimitive);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const tool = useFloorPlanStore((s) => s.tool);

  const pick = (id: FurniturePrimitiveId) => {
    setActive(id);
    setTool("place-furniture");
  };

  return (
    <div className="space-y-3">
      {FURNITURE_CATEGORIES.map((cat) => (
        <div key={cat.id}>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-white/40">{cat.label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {cat.items.map((id) => {
              const def = FURNITURE_LIBRARY[id];
              const isActive = tool === "place-furniture" && active === id;
              return (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  className={`rounded border px-2 py-1.5 text-left text-xs transition ${
                    isActive
                      ? "border-amber-500 bg-amber-500/10 text-amber-300"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {def.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {tool === "place-furniture" && (
        <p className="text-[11px] text-white/40">Click anywhere in the 3D view to drop the selected piece.</p>
      )}
    </div>
  );
}
