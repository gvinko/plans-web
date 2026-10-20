// Curated official references only. A record is added here only after its indoor /
// outdoor pairing and source have been checked; this module deliberately does not
// guess a PDF URL or scrape manufacturer sites.
const OFFICIAL_DOCUMENTS = [
  {
    manufacturer: 'Fujitsu General',
    indoor: 'ARTH72KHTA-3PH',
    outdoor: 'AOTH72KRTA',
    title: 'ARTH72KHTA-3PH / AOTH72KRTA product documentation',
    url: 'https://www.fujitsugeneral.com.au/product/set-arth72khta-3ph',
    sourceUrl: 'https://www.fujitsugeneral.com.au/product/set-arth72khta-3ph',
    version: 'Official product page; checked 20 Oct 2026',
  },
];

export function manufacturerForModel(model = '') {
  const value = String(model).toUpperCase();
  if (/\b(ARTH|ARTG|ARTC|AOTH)\b|\bARTH\d|\bAOTH\d/.test(value)) return 'Fujitsu General';
  if (/\b(FDY|FBA)\w*/.test(value)) return 'Daikin';
  if (/\b(PEAD|PEA|SEZ|PUZ|SUZ)-/.test(value)) return 'Mitsubishi Electric';
  return '';
}

export function resolveEquipmentDocument(indoor, outdoor) {
  const inside = String(indoor || '').trim().toUpperCase();
  const outside = String(outdoor || '').trim().toUpperCase();
  if (!inside || !outside) return null;
  return OFFICIAL_DOCUMENTS.find((doc) => doc.indoor === inside && doc.outdoor === outside) || null;
}

export function documentWarning(indoor, outdoor) {
  const manufacturer = manufacturerForModel(indoor || outdoor);
  if (!manufacturer) return 'No recognised manufacturer or exact model number. Upload the supplier PDF after checking it.';
  if (!outdoor) return `Pair the ${manufacturer} indoor and outdoor units before attaching a verified document.`;
  return `No verified official document is recorded for this exact ${manufacturer} indoor/outdoor combination. Upload the supplier PDF after checking the model numbers.`;
}
