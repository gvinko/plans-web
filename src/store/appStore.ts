import { create } from 'zustand';
import type { ToolMode } from '../lib/canvas/CanvasEngine';

export type ApplicationMode = 'domestic' | 'commercial';

interface AppState {
  activeProjectId: string | null;
  activePlanPageId: string | null;
  activeTool: ToolMode;
  applicationMode: ApplicationMode;
  setActiveProject: (id: string | null) => void;
  setActivePlanPage: (id: string | null) => void;
  setActiveTool: (tool: ToolMode) => void;
  setApplicationMode: (mode: ApplicationMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeProjectId: null,
  activePlanPageId: null,
  activeTool: 'select',
  applicationMode: (localStorage.getItem('plandroid.applicationMode') === 'commercial' ? 'commercial' : 'domestic'),
  setActiveProject: (id) => set({ activeProjectId: id, activePlanPageId: null }),
  setActivePlanPage: (id) => set({ activePlanPageId: id }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setApplicationMode: (mode) => { localStorage.setItem('plandroid.applicationMode', mode); set({ applicationMode: mode }); },
}));
