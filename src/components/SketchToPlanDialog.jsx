import { useEffect, useMemo, useRef, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { analyseSketch, cleanImage, findPaper, findRooms, fitInWorld, rotateImage90, scaleFromGrid, toSketchItems, warpImage } from '@/lib/sketchPlan';

const PHOTO_EDGE = 1600; // working size of the photo; the stored original is never touched
const SHEET_EDGE = 1200; // size of the straightened sheet the walls are found on
export const SKETCH_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SKETCH_MAX_BYTES = 40 * 1024 * 1024;

// Why a file can't be used, or '' when it can. PDFs are turned into an image by the caller first.
export function sketchFileProblem(file) {
  if (!file) return 'No file chosen.';
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const okType = SKETCH_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name || '');
  if (!pdf && !okType) return 'Use a JPG, PNG or WebP photo, or a PDF.';
  if (file.size > SKETCH_MAX_BYTES) return 'That file is over 40 MB. Use a smaller photo.';
  if (!file.size) return 'That file is empty.';
  return '';
}

async function decode(blob) {
  let src; let w; let h;
  try {
    src = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    w = src.width; h = src.height;
  } catch {
    src = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('This image could not be opened.'));
      im.src = URL.createObjectURL(blob);
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  if (!w || !h) throw new Error('This image could not be opened.');
  const k = Math.min(1, PHOTO_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { w: d.width, h: d.height, data: d.data };
}

function toBlob(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.w; canvas.height = img.h;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

const confColour = (c) => (c >= 0.8 ? '#16a34a' : c >= 0.6 ? '#d97706' : '#dc2626');
const MEANINGS = [['room', 'Room name'], ['zone', 'Zone number'], ['note', 'Note on the plan']];
const STEPS = [['page', 'Clean image'], ['review', 'Review walls'], ['scale', 'Scale']];

/**
 * source: { file (the untouched upload), image (Blob to read: the photo, or page 1 of a PDF) }
 * onDone({ original, underlay (Blob), items (PlanDroid sketch items), scale | null, counts })
 */
export default function SketchToPlanDialog({ open, onOpenChange, source, worldW, worldH, onDone }) {
  const [stage, setStage] = useState('page');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [quad, setQuad] = useState(null);
  const [paperFound, setPaperFound] = useState(false);
  const [hideGraph, setHideGraph] = useState(true);
  const [res, setRes] = useState(null); // { w, h, walls, notes, gaps, grid, warnings }
  const [shots, setShots] = useState(null); // { sheetBlob, cleanBlob, sheetUrl, cleanUrl }
  const [labels, setLabels] = useState({});
  const [activeNote, setActiveNote] = useState(null);
  const [includeRooms, setIncludeRooms] = useState(true);
  const [pane, setPane] = useState('plan'); // phone: which of the two views is showing
  const [squareMm, setSquareMm] = useState('');
  const [underlay, setUnderlay] = useState('clean');
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  async function showPhoto(img) {
    const paper = findPaper(img);
    setPhoto(img); setQuad(paper.quad); setPaperFound(paper.found);
    const blob = await toBlob(img);
    setPhotoUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
  }

  useEffect(() => {
    if (!open || !source?.image) return undefined;
    let dead = false;
    setStage('page'); setError(''); setRes(null); setShots(null); setLabels({}); setActiveNote(null); setSquareMm(''); setPhoto(null); setIncludeRooms(true); setUnderlay('clean');
    setBusy('Opening the photo…');
    decode(source.image).then(async (img) => { if (!dead) { await showPhoto(img); setBusy(''); } }).catch((err) => { if (!dead) { setError(err?.message || 'This image could not be opened.'); setBusy(''); } });
    return () => { dead = true; };
  }, [open, source]);

  const rooms = useMemo(() => (res ? findRooms(res.walls, res.w, res.h) : []), [res]);
  const kept = res ? res.walls.filter((w) => !w.off) : [];
  const fit = res ? fitInWorld(res.w, res.h, worldW, worldH) : null;
  const scale = res && fit ? scaleFromGrid(res.grid, squareMm, fit) : null;
  const size = useMemo(() => {
    if (!kept.length) return null;
    const xs = kept.flatMap((w) => [w.x1, w.x2]); const ys = kept.flatMap((w) => [w.y1, w.y2]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }, [res]);

  function cornerDown(event, i) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = i;
  }
  function cornerMove(event) {
    if (dragRef.current == null || !svgRef.current || !photo) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(photo.w, ((event.clientX - r.left) / r.width) * photo.w));
    const y = Math.max(0, Math.min(photo.h, ((event.clientY - r.top) / r.height) * photo.h));
    setQuad((q) => q.map((p, i) => (i === dragRef.current ? { x, y } : p)));
  }

  async function detect() {
    setBusy('Straightening the page and finding walls…'); setError('');
    await new Promise((r) => setTimeout(r, 40)); // let the message paint before the heavy work
    try {
      const sheet = warpImage(photo, quad, SHEET_EDGE);
      const out = analyseSketch(sheet, { suppressGraph: hideGraph });
      const clean = cleanImage(sheet, { suppressGraph: hideGraph });
      const [sheetBlob, cleanBlob] = await Promise.all([toBlob(sheet), toBlob(clean)]);
      setShots((old) => {
        if (old) { URL.revokeObjectURL(old.sheetUrl); URL.revokeObjectURL(old.cleanUrl); }
        return { sheetBlob, cleanBlob, sheetUrl: URL.createObjectURL(sheetBlob), cleanUrl: URL.createObjectURL(cleanBlob) };
      });
      setRes(out); setLabels({}); setActiveNote(null); setStage('review');
    } catch (err) {
      setError(`Could not read this sketch: ${err?.message || 'unknown error'}`);
    }
    setBusy('');
  }

  function toggleWall(id) {
    setRes((r) => ({ ...r, walls: r.walls.map((w) => (w.id === id ? { ...w, off: !w.off } : w)) }));
  }

  function finish() {
    const labelList = Object.entries(labels).map(([i, l]) => ({ ...res.notes[Number(i)], ...l })).filter((l) => String(l.text || '').trim());
    const { items } = toSketchItems({ ...res, rooms }, { worldW, worldH, newId: () => crypto.randomUUID(), includeRooms, labels: labelList });
    onDone({
      original: source.file,
      underlay: underlay === 'clean' ? shots.cleanBlob : shots.sheetBlob,
      items,
      scale,
      counts: { walls: kept.length, rooms: includeRooms ? rooms.length : 0, labels: labelList.length, gaps: res.gaps.length },
    });
  }

  const sw = res ? Math.max(4, res.w / 220) : 4;
  const stepNo = STEPS.findIndex((s) => s[0] === stage);
  const note = activeNote != null && res ? res.notes[activeNote] : null;
  const noteVal = (activeNote != null && labels[activeNote]) || { text: '', meaning: 'note' };

  const overlay = res && (
    <svg viewBox={`0 0 ${res.w} ${res.h}`} className="absolute inset-0 size-full" data-testid="s2p-overlay">
      {includeRooms && rooms.map((r, i) => (
        <rect key={`r${i}`} data-room x={r.x1} y={r.y1} width={r.x2 - r.x1} height={r.y2 - r.y1} fill={r.est ? '#f59e0b' : '#3b82f6'} fillOpacity={0.14} />
      ))}
      {res.notes.map((n, i) => {
        const l = labels[i]?.text?.trim();
        return (
          <g key={`n${i}`} data-note={i} onClick={() => setActiveNote(i)} style={{ cursor: 'pointer' }}>
            <rect x={n.x - 4} y={n.y - 4} width={n.w + 8} height={n.h + 8} rx={3} fill={l ? '#7c3aed' : 'transparent'} fillOpacity={l ? 0.85 : 0} stroke={activeNote === i ? '#2563eb' : '#7c3aed'} strokeWidth={activeNote === i ? 3 : 1.5} strokeDasharray={l ? undefined : '5 3'} />
            {l && <text x={n.x + n.w / 2} y={n.y + n.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.max(12, res.w / 60)} fontWeight="700" fill="#fff">{l}</text>}
          </g>
        );
      })}
      {res.walls.map((w) => (
        <g key={w.id} data-wall={w.id} data-off={w.off ? '1' : '0'} onClick={() => toggleWall(w.id)} style={{ cursor: 'pointer' }}>
          <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="transparent" strokeWidth={sw * 5} />
          <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={w.off ? '#94a3b8' : confColour(w.conf)} strokeWidth={w.off ? sw * 0.6 : sw} strokeDasharray={w.off ? `${sw * 1.5} ${sw}` : undefined} strokeLinecap="square" />
        </g>
      ))}
      {res.gaps.map((g, i) => <circle key={`g${i}`} cx={g.x} cy={g.y} r={sw * 2.2} fill="none" stroke="#dc2626" strokeWidth={2} style={{ pointerEvents: 'none' }} />)}
    </svg>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-[1100px] max-h-[96dvh] overflow-y-auto p-3 sm:p-5 gap-3" data-testid="s2p-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ApperIcon name="PencilRuler" size={18} />Sketch to Plan</DialogTitle>
          <DialogDescription>Turn a photo of a hand-drawn plan into walls and rooms you can edit. Nothing leaves this device.</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap items-center gap-1 text-[11px]">
          {STEPS.map(([key, label], i) => (
            <li key={key} className={`rounded-full px-2 py-0.5 border ${i === stepNo ? 'border-primary bg-primary text-primary-foreground' : i < stepNo ? 'border-primary/40 text-foreground' : 'border-border text-muted-foreground'}`}>{`${i + 1}. ${label}`}</li>
          ))}
          <li className="rounded-full px-2 py-0.5 border border-border text-muted-foreground">4. Open in PlanDroid</li>
        </ol>

        {error && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">{error}</div>}
        {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="s2p-busy"><ApperIcon name="Loader" size={15} className="animate-spin" />{busy}</div>}

        {stage === 'page' && photo && (
          <>
            <p className="text-sm">
              {paperFound ? 'The page edges were found. ' : 'The page edges could not be found, so the whole photo is used. '}
              Drag the four corners onto the corners of the paper (or of the area you want) so it can be straightened.
            </p>
            <div className="relative mx-auto w-full max-w-[560px] select-none">
              <img src={photoUrl} alt="Your sketch photo" className="block w-full rounded-md border border-border" draggable={false} />
              {quad && (
                <svg ref={svgRef} viewBox={`0 0 ${photo.w} ${photo.h}`} className="absolute inset-0 size-full touch-none" onPointerMove={cornerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
                  <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} fill="#2563eb" fillOpacity={0.08} stroke="#2563eb" strokeWidth={photo.w / 250} />
                  {quad.map((p, i) => (
                    <g key={i} data-corner={i} onPointerDown={(event) => cornerDown(event, i)} style={{ cursor: 'grab' }}>
                      <circle cx={p.x} cy={p.y} r={photo.w / 16} fill="transparent" />
                      <circle cx={p.x} cy={p.y} r={photo.w / 55} fill="#fff" stroke="#2563eb" strokeWidth={photo.w / 200} />
                    </g>
                  ))}
                </svg>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => showPhoto(rotateImage90(photo))}><ApperIcon name="RotateCw" size={14} />Turn 90°</Button>
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setQuad([{ x: 0, y: 0 }, { x: photo.w, y: 0 }, { x: photo.w, y: photo.h }, { x: 0, y: photo.h }]); }}>Use whole photo</Button>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={hideGraph} onChange={(event) => setHideGraph(event.target.checked)} />Hide graph-paper lines</label>
              <Button className="ml-auto" disabled={!!busy} onClick={detect} data-testid="s2p-detect">Find walls<ApperIcon name="ArrowRight" size={14} /></Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Shadows and uneven light are evened out automatically. Your original photo is kept as it is.</p>
          </>
        )}

        {stage === 'review' && res && shots && (
          <>
            <div className="flex md:hidden rounded-md border border-border p-0.5 text-xs w-fit">
              {[['sketch', 'Your sketch'], ['plan', 'Found plan']].map(([k, l]) => (
                <button key={k} type="button" data-pane={k} onClick={() => setPane(k)} className={`px-3 py-1 rounded ${pane === k ? 'bg-primary text-primary-foreground' : ''}`}>{l}</button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <figure className={`${pane === 'sketch' ? '' : 'hidden'} md:block`}>
                <figcaption className="hidden md:block text-[11px] text-muted-foreground mb-1">Your sketch, straightened</figcaption>
                <img src={shots.sheetUrl} alt="Your sketch, straightened" className="block w-full rounded-md border border-border" />
              </figure>
              <figure className={`${pane === 'plan' ? '' : 'hidden'} md:block`}>
                <figcaption className="hidden md:block text-[11px] text-muted-foreground mb-1">Found plan — tap a wall to leave it out, tap writing to say what it is</figcaption>
                <div className="relative rounded-md border border-border overflow-hidden bg-white">
                  <img src={shots.cleanUrl} alt="" className="block w-full opacity-40" />
                  {overlay}
                </div>
              </figure>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="s2p-counts">
              <span><b>{kept.length}</b> walls</span>
              <span><b>{rooms.length}</b> closed rooms</span>
              <span><b>{res.notes.length}</b> bits of writing</span>
              <span className="flex items-center gap-1"><i className="inline-block w-4 h-1 bg-green-600" />clear</span>
              <span className="flex items-center gap-1"><i className="inline-block w-4 h-1 bg-amber-600" />check</span>
              <span className="flex items-center gap-1"><i className="inline-block w-4 h-1 bg-red-600" />doubtful</span>
              <span className="flex items-center gap-1"><i className="inline-block w-4 h-0.5 bg-slate-400" />left out</span>
              <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full border-2 border-red-600" />end not joined</span>
            </div>
            {res.warnings.length > 0 && (
              <ul className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs space-y-0.5" data-testid="s2p-warnings">
                {res.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}

            {note && (
              <form className="flex flex-wrap items-end gap-2 rounded-md border border-primary/50 bg-primary/5 p-2" data-testid="s2p-note" onSubmit={(event) => { event.preventDefault(); setActiveNote(null); }}>
                <label className="flex flex-col gap-1 text-xs grow min-w-40">
                  <span className="text-muted-foreground">What does this say? (it is not read automatically)</span>
                  <Input autoFocus className="h-9" placeholder="e.g. Bed 2, or 7" value={noteVal.text} onChange={(event) => setLabels((m) => ({ ...m, [activeNote]: { ...noteVal, text: event.target.value } }))} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">It is a…</span>
                  <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={noteVal.meaning} onChange={(event) => setLabels((m) => ({ ...m, [activeNote]: { ...noteVal, meaning: event.target.value } }))}>
                    {MEANINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <Button type="submit" size="sm" className="h-9">Done</Button>
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setLabels((m) => { const n = { ...m }; delete n[activeNote]; return n; }); setActiveNote(null); }}>Leave it on the sketch</Button>
              </form>
            )}
            <p className="text-[11px] text-muted-foreground">Writing and numbers stay on the sketch underneath unless you type them in here. A number is never taken as a size, load or airflow.</p>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStage('page')}><ApperIcon name="ArrowLeft" size={14} />Back</Button>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={includeRooms} onChange={(event) => setIncludeRooms(event.target.checked)} />Add room boxes</label>
              <Button className="ml-auto" disabled={!kept.length} onClick={() => setStage('scale')} data-testid="s2p-to-scale">Next: scale<ApperIcon name="ArrowRight" size={14} /></Button>
            </div>
          </>
        )}

        {stage === 'scale' && res && (
          <>
            {res.grid ? (
              <div className="space-y-2">
                <p className="text-sm">Graph squares were found on the page. What does <b>one square</b> stand for on site? Leave it blank if you didn't draw to the squares.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="number" inputMode="numeric" min="1" className="h-9 w-32" placeholder="mm per square" value={squareMm} onChange={(event) => setSquareMm(event.target.value)} data-testid="s2p-square" />
                  <span className="text-sm text-muted-foreground">mm</span>
                  {[250, 500, 1000].map((v) => <Button key={v} type="button" variant="outline" size="sm" onClick={() => setSquareMm(String(v))}>{v >= 1000 ? `${v / 1000} m` : `${v} mm`}</Button>)}
                </div>
                {scale && size && (
                  <p className="text-sm" data-testid="s2p-size">That makes the building about <b>{((size.w * fit.k) / scale.pxPerM).toFixed(1)} m × {((size.h * fit.k) / scale.pxPerM).toFixed(1)} m</b> overall. If that looks wrong, change the figure or leave it blank.</p>
                )}
              </div>
            ) : (
              <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">No graph-paper grid was found on this page, so a scale can't be worked out from it.</div>
            )}
            {!scale && <p className="text-sm text-muted-foreground" data-testid="s2p-noscale">No scale will be set. Once the plan is open, use <b>Set scale</b> (K) and mark one wall you know the length of. Until then, sizes and areas are not real.</p>}
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span>Show underneath:</span>
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={underlay} onChange={(event) => setUnderlay(event.target.value)}>
                <option value="clean">Cleaned-up sketch</option>
                <option value="photo">Straightened photo</option>
              </select>
            </label>
            <p className="text-[11px] text-muted-foreground">Every wall and room comes in marked "from sketch — check" (dashed orange) until you verify it. You can drag, split, delete and redraw them like any other wall.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStage('review')}><ApperIcon name="ArrowLeft" size={14} />Back</Button>
              <Button className="ml-auto" onClick={finish} data-testid="s2p-open">Open in PlanDroid<ApperIcon name="Check" size={14} /></Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
