import {
  buildFanCoilUnit,
  buildPlenum,
  buildDiffuser,
  buildFittingStraight,
  buildFittingReducer,
  buildElbow,
} from './symbols';
import type { ComponentDef } from './types';

export const CATALOG: ComponentDef[] = [
  { id: 'fan-coil-unit', category: 'equipment', label: 'Fan Coil Unit', build: buildFanCoilUnit },
  { id: 'plenum-supply', category: 'fitting', label: 'Supply Plenum', build: () => buildPlenum('supply', 3) },
  { id: 'plenum-return', category: 'fitting', label: 'Return Plenum', build: () => buildPlenum('return', 3) },
  { id: 'diffuser-supply4way', category: 'terminal', label: 'Diffuser — 4-Way', build: () => buildDiffuser('supply4way') },
  { id: 'diffuser-swirl', category: 'terminal', label: 'Diffuser — Swirl', build: () => buildDiffuser('swirl') },
  { id: 'diffuser-linear-slot', category: 'terminal', label: 'Grille — Linear Slot', build: () => buildDiffuser('linearSlot') },
  { id: 'fitting-straight', category: 'fitting', label: 'Straight Coupling', build: buildFittingStraight },
  { id: 'fitting-reducer', category: 'fitting', label: 'Reducer / Transition', build: buildFittingReducer },
  { id: 'fitting-elbow-90', category: 'fitting', label: '90° Elbow', build: () => buildElbow(90) },
  { id: 'fitting-elbow-45', category: 'fitting', label: '45° Elbow', build: () => buildElbow(45) },
];
