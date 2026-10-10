import type { PrinterProfile } from './profiles';

const STORAGE_KEY = 'plans-to-print.custom-printers.v1';
const SELECTED_PRINTER_KEY = 'plans-to-print.selected-printer.v1';

export function loadSelectedPrinterId(profiles: PrinterProfile[]): string {
  const fallback = profiles[0]?.id ?? 'creality-ender-3';
  try {
    const stored = localStorage.getItem(SELECTED_PRINTER_KEY);
    return profiles.some((profile) => profile.id === stored) ? stored! : fallback;
  } catch {
    return fallback;
  }
}

export function saveSelectedPrinterId(id: string): void {
  try { localStorage.setItem(SELECTED_PRINTER_KEY, id); }
  catch { /* Nonpersistent environments retain the current session selection. */ }
}


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

export function isValidProfile(value: PrinterProfile): boolean {
  return Boolean(
    value &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.manufacturer === 'string' &&
      Number.isFinite(value.buildVolumeMm?.x) && value.buildVolumeMm.x > 0 &&
      Number.isFinite(value.buildVolumeMm?.y) && value.buildVolumeMm.y > 0 &&
      Number.isFinite(value.buildVolumeMm?.z) && value.buildVolumeMm.z > 0 &&
      Number.isFinite(value.nozzleDiameterMm) && value.nozzleDiameterMm > 0 &&
      Number.isFinite(value.defaultFitClearanceMm) && value.defaultFitClearanceMm >= 0,
  );
}
