import {
  buildFanCoilUnit,
  buildPlenum,
  buildDiffuser,
  buildGrille,
  buildFittingStraight,
  buildFittingReducer,
  buildElbow,
} from './symbols';
import type { ComponentDef } from './types';

export const CATALOG: ComponentDef[] = [
  { id: 'fan-coil-unit', category: 'equipment', label: 'Fan Coil Unit', build: (style) => buildFanCoilUnit(style) },
  { id: 'plenum-supply', category: 'fitting', label: 'Supply Plenum', build: (style) => buildPlenum('supply', 3, style) },
  { id: 'plenum-return', category: 'fitting', label: 'Return Plenum', build: (style) => buildPlenum('return', 3, style) },
  { id: 'diffuser-round', category: 'terminal', label: 'Diffuser — Round', build: (style) => buildDiffuser('round', style) },
  { id: 'diffuser-supply4way', category: 'terminal', label: 'Diffuser — 4-Way', build: (style) => buildDiffuser('supply4way', style) },
  { id: 'diffuser-swirl', category: 'terminal', label: 'Diffuser — Swirl', build: (style) => buildDiffuser('swirl', style) },
  { id: 'diffuser-linear-slot', category: 'terminal', label: 'Grille — Linear Slot', build: (style) => buildDiffuser('linearSlot', style) },
  { id: 'grille-wall', category: 'terminal', label: 'Grille — Wall', build: (style) => buildGrille('wall', style) },
  { id: 'grille-linear-bar', category: 'terminal', label: 'Grille — Linear Bar', build: (style) => buildGrille('linearBar', style) },
  { id: 'fitting-straight', category: 'fitting', label: 'Straight Coupling', build: (style) => buildFittingStraight(style) },
  { id: 'fitting-reducer', category: 'fitting', label: 'Reducer / Transition', build: (style) => buildFittingReducer(style) },
  { id: 'fitting-elbow-90', category: 'fitting', label: '90° Elbow', build: (style) => buildElbow(90, style) },
  { id: 'fitting-elbow-45', category: 'fitting', label: '45° Elbow', build: (style) => buildElbow(45, style) },
];
