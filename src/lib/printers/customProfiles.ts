import type { PrinterProfile } from './profiles';

const STORAGE_KEY = 'plans-to-print.custom-printers.v1';

export function loadCustomPrinterProfiles(): PrinterProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PrinterProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidProfile);
  } catch {
    return [];
  }
}

export function saveCustomPrinterProfiles(profiles: PrinterProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Could not save printer profiles.');
  }
}

function isValidProfile(value: PrinterProfile): boolean {
  return Boolean(
    value &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.manufacturer === 'string' &&
      Number.isFinite(value.buildVolumeMm?.x) &&
      Number.isFinite(value.buildVolumeMm?.y) &&
      Number.isFinite(value.buildVolumeMm?.z) &&
      Number.isFinite(value.nozzleDiameterMm) &&
      Number.isFinite(value.defaultFitClearanceMm),
  );
}
