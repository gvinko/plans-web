import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../db/schema';
import { getAppSettings, updateAppSettings, setCompanyLogo } from '../db/appSettingsRepository';

interface CompanySettingsDialogProps {
  onClose: () => void;
}

export default function CompanySettingsDialog({ onClose }: CompanySettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAppSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!settings?.logoImage) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(settings.logoImage);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [settings?.logoImage]);

  async function handleField(patch: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await updateAppSettings(patch);
  }

  async function handleLogoUpload(file: File) {
    const bitmap = await createImageBitmap(file);
    await setCompanyLogo(file, bitmap.width, bitmap.height);
    bitmap.close();
    setSettings(await getAppSettings());
  }

  if (!settings) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-mono">Company Details</h2>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700">
            Close
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-slate-500">Used automatically on every PDF export title block from now on.</p>

          <div className="flex items-center gap-3">
            <div className="w-20 h-14 rounded border border-slate-700 bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[10px] text-slate-600">No logo</span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700"
            >
              {logoPreviewUrl ? 'Replace Logo' : 'Upload Logo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
                e.target.value = '';
              }}
            />
          </div>

          <input
            value={settings.companyName}
            onChange={(e) => handleField({ companyName: e.target.value })}
            placeholder="Company Name (e.g. Echo Air Conditioning)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <input
            value={settings.contactName}
            onChange={(e) => handleField({ contactName: e.target.value })}
            placeholder="Your Name"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <input
            value={settings.contactPhone}
            onChange={(e) => handleField({ contactPhone: e.target.value })}
            placeholder="Phone"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
          <input
            value={settings.contactEmail}
            onChange={(e) => handleField({ contactEmail: e.target.value })}
            placeholder="Email"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5"
          />
        </div>
      </div>
    </div>
  );
}
