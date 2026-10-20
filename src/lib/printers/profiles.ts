export interface PrinterProfile {
  id: string;
  name: string;
  manufacturer: string;
  buildVolumeMm: {
    x: number;
    y: number;
    z: number;
  };
  nozzleDiameterMm: number;
  defaultFitClearanceMm: number;
  notes?: string;
}

export const BUILT_IN_PRINTER_PROFILES: PrinterProfile[] = [
  {
    id: 'bambu-p1s-ams',
    name: 'Bambu Lab P1S + AMS',
    manufacturer: 'Bambu Lab',
    // Physical height is 256 mm; Bambu Studio defaults to 250 mm printable height.
    // Keep the conservative slicer-ready value until the user opts into full Z travel.
    buildVolumeMm: { x: 256, y: 256, z: 250 },
    nozzleDiameterMm: 0.4,
    defaultFitClearanceMm: 0.25,
    notes: 'AMS-equipped P1S. STL exports contain geometry only; use Bambu Studio to assign AMS slots/colours. Actual printable XY area can be restricted by cutter/plate clearance.',
  },
  {
    id: 'bambu-p1s',
    name: 'Bambu Lab P1S',
    manufacturer: 'Bambu Lab',
    buildVolumeMm: { x: 256, y: 256, z: 250 },
    nozzleDiameterMm: 0.4,
    defaultFitClearanceMm: 0.25,
    notes: 'Uses conservative 250 mm default printable Z; physical machine volume is 256 mm high.',
  },
  {
    id: 'creality-ender-3',
    name: 'Ender 3',
    manufacturer: 'Creality',
    buildVolumeMm: { x: 220, y: 220, z: 250 },
    nozzleDiameterMm: 0.4,
    defaultFitClearanceMm: 0.25,
    notes: 'Default Plans to Print profile. Verify your individual machine limits before printing.',
  },
  {
    id: 'creality-ender-3-v2',
    name: 'Ender 3 V2',
    manufacturer: 'Creality',
    buildVolumeMm: { x: 220, y: 220, z: 250 },
    nozzleDiameterMm: 0.4,
    defaultFitClearanceMm: 0.25,
    notes: 'Default Plans to Print profile. Verify your individual machine limits before printing.',
  },
  {
    id: 'creality-ender-3-pro',
    name: 'Ender 3 Pro',
    manufacturer: 'Creality',
    buildVolumeMm: { x: 220, y: 220, z: 250 },
    nozzleDiameterMm: 0.4,
    defaultFitClearanceMm: 0.25,
    notes: 'Default Plans to Print profile. Verify your individual machine limits before printing.',
  },
];

export function getPrinterProfile(id: string): PrinterProfile | undefined {
  return BUILT_IN_PRINTER_PROFILES.find((profile) => profile.id === id);
}

export function modelFitsPrinter(
  modelBoundsMm: { x: number; y: number; z: number },
  profile: PrinterProfile,
): boolean {
  return (
    modelBoundsMm.x <= profile.buildVolumeMm.x &&
    modelBoundsMm.y <= profile.buildVolumeMm.y &&
    modelBoundsMm.z <= profile.buildVolumeMm.z
  );
}

export function exceededAxes(
  modelBoundsMm: { x: number; y: number; z: number },
  profile: PrinterProfile,
): Array<'x' | 'y' | 'z'> {
  return (['x', 'y', 'z'] as const).filter(
    (axis) => modelBoundsMm[axis] > profile.buildVolumeMm[axis],
  );
}
