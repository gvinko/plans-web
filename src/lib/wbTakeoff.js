// Ductplanner -> WorkBrain take-off (format `ductplanner-takeoff` v1).
// Ductplanner never prices anything. It sends the bill of materials; WorkBrain matches each
// line to the WorkBrain Rates sheet and prices only what it can match. See
// gvinko/workbrain contracts/ductplanner-takeoff.md.

export const WORKBRAIN_URL = 'https://workbrain-7pz.pages.dev/';
const MAX_LINES = 500;

const clip = (s, n) => String(s ?? '').slice(0, n);

// "Ducted Unit — FDUA125KXLE6" -> "FDUA125KXLE6". WorkBrain tries this when the full name doesn't match.
const lastPart = (name) => {
  const parts = String(name).split(' — ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
};

/** equipment: the BOM memo ({ groups: [{ name, rows: [{ name, qty, note }] }] }). Existing gear is not sent. */
export function buildTakeoff({ equipment, project = {}, page = {} }) {
  const lines = equipment.groups
    .flatMap((g) => g.rows.map((r) => ({
      group: clip(g.name, 80),
      ref: clip(r.name, 200),
      alt: clip(lastPart(r.name), 120),
      qty: Number(r.qty) || 0,
      note: clip(r.note, 200),
    })))
    .filter((l) => l.ref && l.qty > 0)
    .slice(0, MAX_LINES);
  return {
    format: 'ductplanner-takeoff',
    version: 1,
    sentAt: new Date().toISOString(),
    job: {
      wbJobId: project.wbJobId_c || '',
      wbJobRef: project.wbJobRef_c || '',
      customer: clip(project.Name, 200),
      suburb: clip(project.suburb_c, 120),
      address: clip(project.address_c, 300),
      drawing: clip(page.Name || page.level_c, 120),
      revision: clip(project.revision_c, 10),
    },
    lines,
  };
}

function base64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function takeoffLink(pkg) {
  return `${WORKBRAIN_URL}#wbTakeoff=${base64url(JSON.stringify(pkg))}`;
}
