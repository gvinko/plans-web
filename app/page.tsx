"use client";

import dynamic from "next/dynamic";
import Toolbar from "../components/Toolbar";
import ControlsPanel from "../components/ControlsPanel";

// The blueprint canvas and 3D viewport both touch window/document/WebGL —
// load them client-only to avoid Next.js SSR trying to render canvas APIs.
const BlueprintCanvas = dynamic(() => import("../components/BlueprintCanvas"), { ssr: false });
const Viewport3D = dynamic(() => import("../components/Viewport3D"), { ssr: false });

export default function Page() {
  return (
    <div className="flex h-screen w-screen flex-col bg-[#0c0e12] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <h1 className="text-sm font-semibold tracking-tight">
          Plan2Print <span className="text-white/40">— Dollhouse Studio</span>
        </h1>
        <p className="text-[11px] text-white/40">FDM-ready · manifold STL/OBJ export</p>
      </header>
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[46%] min-w-[360px] flex-col gap-2 p-2">
          <BlueprintCanvas />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2 pl-0">
          <Viewport3D />
        </div>
        <div className="w-[280px] shrink-0 border-l border-white/10">
          <ControlsPanel />
        </div>
      </div>
    </div>
  );
}
