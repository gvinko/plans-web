import {
  buildFanCoilUnit,
  buildCondenser,
  buildPlenum,
  buildDiffuser,
  buildGrille,
  buildFittingStraight,
  buildFittingReducer,
  buildElbow,
  buildWye,
  buildBranchDamper,
  buildBto,
  buildZoneMotor,
  buildWallSensor,
} from './symbols';
import type { ComponentDef } from './types';

const BTO_SIZES = [
  '16 / 14 / 14', '16 / 14 / 10', '14 / 14 / 12', '14 / 14 / 10',
  '14 / 12 / 12', '14 / 12 / 10', '14 / 10 / 10', '12 / 10 / 10',
  '12 / 10 / 08', '10 / 08 / 08', '14 / 10 / 10 / 10', '16 / 10 / 10 / 10',
];

const ZONE_MOTOR_SIZES = [
  { mm: 250, inch: 10 }, { mm: 300, inch: 12 }, { mm: 350, inch: 14 }, { mm: 400, inch: 16 },
];

export const CATALOG: ComponentDef[] = [
  { id: 'fan-coil-unit', category: 'equipment', label: 'Fan Coil Unit', build: (style) => buildFanCoilUnit(style) },
  { id: 'condenser', category: 'equipment', label: 'Condenser (Outdoor Unit)', build: (style) => buildCondenser(style) },
  { id: 'plenum-supply-2way', category: 'fitting', label: 'Supply Plenum — 2-Way', build: (style) => buildPlenum('supply', 2, style) },
  { id: 'plenum-supply-3way', category: 'fitting', label: 'Supply Plenum — 3-Way', build: (style) => buildPlenum('supply', 3, style) },
  { id: 'plenum-return', category: 'fitting', label: 'Return Plenum', build: (style) => buildPlenum('return', 3, style) },
  { id: 'diffuser-round', category: 'terminal', label: 'Diffuser — Round', build: (style) => buildDiffuser('round', style) },
  { id: 'diffuser-supply4way', category: 'terminal', label: 'Diffuser — 4-Way', build: (style) => buildDiffuser('supply4way', style) },
  { id: 'diffuser-swirl', category: 'terminal', label: 'Diffuser — Swirl', build: (style) => buildDiffuser('swirl', style) },
  { id: 'diffuser-linear-slot', category: 'terminal', label: 'Grille — Linear Slot', build: (style) => buildDiffuser('linearSlot', style) },
  { id: 'grille-wall', category: 'terminal', label: 'Grille — Wall', build: (style) => buildGrille('wall', style) },
  { id: 'grille-linear-bar', category: 'terminal', label: 'Grille — Linear Bar', build: (style) => buildGrille('linearBar', style) },
  { id: 'grille-return-air', category: 'terminal', label: 'Grille — Return Air (Eggcrate)', build: (style) => buildGrille('returnAirEggcrate', style) },
  { id: 'fitting-straight', category: 'fitting', label: 'Straight Coupling', build: (style) => buildFittingStraight(style) },
  { id: 'fitting-reducer', category: 'fitting', label: 'Reducer / Transition', build: (style) => buildFittingReducer(style) },
  { id: 'fitting-elbow-90', category: 'fitting', label: '90° Elbow', build: (style) => buildElbow(90, style) },
  { id: 'fitting-elbow-45', category: 'fitting', label: '45° Elbow', build: (style) => buildElbow(45, style) },
  { id: 'fitting-wye', category: 'fitting', label: 'Y-Piece (Wye)', build: (style) => buildWye(style) },
  { id: 'fitting-damper', category: 'fitting', label: 'Branch Damper', build: (style) => buildBranchDamper(style) },
  ...BTO_SIZES.map((size) => ({
    id: `bto-${size.replace(/\s*\/\s*/g, '-')}`,
    category: 'fitting' as const,
    label: `${size.split('/').length === 4 ? 'DBTO' : 'BTO'} — ${size}`,
    build: (style: Parameters<typeof buildBto>[1]) => buildBto(size, style),
  })),
  { id: 'wall-sensor', category: 'equipment', label: 'Wall Sensor', build: (style) => buildWallSensor(style) },
  ...ZONE_MOTOR_SIZES.map(({ mm, inch }) => ({
    id: `zone-motor-${mm}`,
    category: 'equipment' as const,
    label: `Zone Motor — Ø${mm} mm (${inch}″)`,
    build: (style: Parameters<typeof buildZoneMotor>[1]) => buildZoneMotor(mm, style),
  })),

];
