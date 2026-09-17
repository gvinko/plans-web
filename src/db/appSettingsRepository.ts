import { db } from './index';
import type { AppSettings } from './schema';

const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  companyName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  logoImage: null,
  logoWidthPx: 0,
  logoHeightPx: 0,
};

export async function getAppSettings(): Promise<AppSettings> {
  const existing = await db.appSettings.get('default');
  return existing ?? DEFAULT_SETTINGS;
}

export async function updateAppSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  const current = await getAppSettings();
  await db.appSettings.put({ ...current, ...patch, id: 'default' });
}

export async function setCompanyLogo(blob: Blob, widthPx: number, heightPx: number): Promise<void> {
  await updateAppSettings({ logoImage: blob, logoWidthPx: widthPx, logoHeightPx: heightPx });
}
