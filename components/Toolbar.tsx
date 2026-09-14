"use client";

import React from "react";
import { useFloorPlanStore, ToolMode } from "../store/floorPlanStore";

const TOOLS: { id: ToolMode; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "draw-wall", label: "Draw walls" },
  { id: "place-door", label: "Place door" },
  { id: "place-window", label: "Place window" },
  { id: "roof-cutout", label: "Roof cutout" },
  { id: "calibrate", label: "Calibrate" },
];

export default function Toolbar() {
  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-white/10 bg-[#12151b] px-3 py-2">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
            tool === t.id ? "bg-amber-500 text-black" : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
