import { create } from 'zustand';
import type { ToolMode } from '../lib/canvas/CanvasEngine';

interface AppState {
  activeProjectId: string | null;
  activePlanPageId: string | null;
  activeTool: ToolMode;
  setActiveProject: (id: string | null) => void;
  setActivePlanPage: (id: string | null) => void;
  setActiveTool: (tool: ToolMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeProjectId: null,
  activePlanPageId: null,
  activeTool: 'select',
  setActiveProject: (id) => set({ activeProjectId: id, activePlanPageId: null }),
  setActivePlanPage: (id) => set({ activePlanPageId: id }),
  setActiveTool: (tool) => set({ activeTool: tool }),
}));
