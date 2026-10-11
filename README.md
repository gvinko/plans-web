# Ductplanner

HVAC ducted layout, heat load and takeoff tool for Echo Air Conditioning.
Runs in the browser and keeps every job on the computer it's used on — no server, no login, works offline.

Standalone project: separate from Plans to Print (`plans-web`) and the Apper build.

## What it does

- Projects with levels, customer/job details
- Load a plan (PDF or image), set the scale, draw equipment, ducts, pipe, drain and power runs
- **Trace rooms** with the Room tool → room-by-room **heat load** (cooling and heating kW) from room type, window facing, glass, shading, external walls, ceiling, height and people, for four NSW climates
- **Auto duct layout**: tap *Auto*, set each room's type and zone, *Generate options*, flick between Option A / B on the plan, then **Select** to add the FCU, plenum, zone motors, BTOs, outlets and return grille as normal editable parts (Undo removes it)
- Design checks, pick list / BOM, PDF export
- **Backup / Restore** on the Projects screen: one `.json` file holding every job, plan and photo

## Run it on your computer

Needs [Node.js](https://nodejs.org) 20 or newer (LTS installer, defaults are fine).

```bash
npm install        # first time only
npm start          # builds and opens http://localhost:4173
```

Or on Windows, double-click `start-ductplanner.bat`.

For working on the code: `npm run dev` (hot reload at http://localhost:5173).

## Put it online (Cloudflare Pages)

1. Create a new **empty** GitHub repo (e.g. `ductplanner`) and push this folder:
   ```bash
   git remote add origin https://github.com/<you>/ductplanner.git
   git push -u origin main
   ```
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: Framework **Vite** · Build command `npm run build` · Output directory `dist`.
4. Deploy. Open the `*.pages.dev` link in Chrome/Edge and use *Install app* in the address bar to get a desktop icon that works offline.

## Where jobs are stored

In the browser's IndexedDB for that web address on that computer. That means:

- `localhost:4173` and the Cloudflare address are **separate** stores — pick one to work from.
- Clearing browser site data deletes jobs. Use **Backup** regularly (save the file to OneDrive or a USB).
- To move jobs to another computer: Backup on one, Restore on the other.

## Heat load method

Simplified component method per room: roof/ceiling gain, wall conduction + solar, glass solar by orientation and shading + conduction, air leakage (0.7 ACH), people (130 W each) and appliances by room type. Design temperature differences by climate (`src/lib/heatLoad.js`). It's a quoting guide — confirm critical jobs with a full calc and manufacturer data.

## Code map

| Path | What |
|---|---|
| `src/components/DrawingWorkspace.jsx` | The drawing canvas, tools, checks, list, PDF export |
| `src/components/AutoLayoutDialog.jsx` | Rooms / zones / climate / unit dialog |
| `src/lib/heatLoad.js` | Room heat load calc |
| `src/lib/autoLayout.js` | Auto layout builder (two options) |
| `src/pages/Projects.jsx` | Project list, levels, backup / restore |
| `src/services/db.js`, `sdk.js` | Local IndexedDB storage |
| `src/services/backup.js` | Backup file export / import |
| `src/data/*` | Unit models and pipe sizing from the Echo costing sheet |
