import { useMemo, useRef, useState } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/services/localDb';
import { searchSources, scanWatch, crossCheck } from '@/lib/specs';

const WORDS_KEY = 'dp-watch-words';
const readWords = () => { try { const v = JSON.parse(localStorage.getItem(WORDS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeWords = (w) => { try { localStorage.setItem(WORDS_KEY, JSON.stringify(w)); } catch { /* blocked */ } };

// One hit: where it is, the clause, and the sentence with the match picked out.
function Hit({ h, onOpen }) {
  const s = h.snippet;
  const len = (h.match || '').length || 0;
  const body = len && s.at >= 0 ? (
    <>{s.text.slice(0, s.at)}<mark className="bg-amber-200 dark:bg-amber-700 rounded px-0.5">{s.text.slice(s.at, s.at + len)}</mark>{s.text.slice(s.at + len)}</>
  ) : s.text;
  return (
    <button type="button" onClick={() => onOpen(h)} className="w-full text-left rounded-md border border-border px-2 py-1.5 hover:bg-muted">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ApperIcon name={h.kind === 'spec' ? 'FileText' : 'Layers'} size={12} />
        <span className="truncate">{`${h.name} · page ${h.page}${h.clause ? ` · clause ${h.clause}` : ''}`}</span>
        <ApperIcon name="ExternalLink" size={11} className="ml-auto shrink-0" />
      </div>
      <div className="text-xs leading-snug">{s.pre ? '…' : ''}{body}{s.post ? '…' : ''}</div>
    </button>
  );
}

/**
 * docs: [{ id, key, name, size, addedOn, pages: string[], scanned }]  (project.specDocs_c)
 * plans: [{ id, name, pages: string[] }]  (each level's plan PDF text)
 * bomRows: [{ name, qty }]
 */
export default function SpecsDialog({ open, onOpenChange, docs, plans, bomRows, onAddFiles, onRemoveDoc, onOpenLevel, busy }) {
  const [tab, setTab] = useState('check');
  const [q, setQ] = useState('');
  const [words, setWords] = useState(readWords);
  const [newWord, setNewWord] = useState('');
  const [openId, setOpenId] = useState(null);
  const fileRef = useRef(null);

  const sources = useMemo(() => [
    ...docs.map((d) => ({ id: d.id, kind: 'spec', name: d.name, pages: d.pages || [] })),
    ...plans.filter((p) => p.pages?.some(Boolean)).map((p) => ({ id: p.id, kind: 'plan', name: p.name, pages: p.pages })),
  ], [docs, plans]);
  const results = useMemo(() => (q.trim().length >= 2 ? searchSources(sources, q) : []), [sources, q]);
  const watch = useMemo(() => (open ? scanWatch(sources, words) : []), [open, sources, words]);
  const cross = useMemo(() => crossCheck(watch, bomRows), [watch, bomRows]);
  const groups = useMemo(() => [...new Set(watch.map((w) => w.group))], [watch]);
  const scanned = docs.filter((d) => d.scanned);
  const plansWithText = plans.filter((p) => p.pages?.some(Boolean)).length;

  async function openHit(h) {
    if (h.kind === 'plan') { onOpenLevel(h.sourceId); onOpenChange(false); return; }
    const doc = docs.find((d) => d.id === h.sourceId);
    const rec = doc && await db.files.get(doc.key);
    if (!rec?.blob) return;
    const url = URL.createObjectURL(rec.blob);
    window.open(`${url}#page=${h.page}`, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const addWord = () => {
    const w = newWord.trim();
    if (!w || words.some((x) => x.toLowerCase() === w.toLowerCase())) return;
    const next = [...words, w];
    setWords(next); writeWords(next); setNewWord('');
  };
  const dropWord = (w) => { const next = words.filter((x) => x !== w); setWords(next); writeWords(next); };

  const tabBtn = (id, label) => (
    <button key={id} type="button" onClick={() => setTab(id)} className={`rounded px-2.5 py-1 text-xs font-medium ${tab === id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90svh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Specs & plan check</DialogTitle>
          <DialogDescription>Upload the spec, then search it and the plans, and see what to allow for. Keyword search, not AI — read the clauses it finds.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {tabBtn('check', `Things to check${watch.length ? ` (${watch.length})` : ''}`)}
            {tabBtn('cross', `vs parts list${cross.filter((c) => c.missing).length ? ` ⚠${cross.filter((c) => c.missing).length}` : ''}`)}
            {tabBtn('search', 'Search')}
            {tabBtn('docs', `Documents (${docs.length})`)}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) onAddFiles(f); }} />
          <Button size="sm" className="ml-auto" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ApperIcon name={busy ? 'Loader2' : 'Upload'} size={14} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Reading…' : 'Upload spec PDF'}
          </Button>
        </div>
        {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
        {scanned.length > 0 && <p className="text-xs text-amber-700">{`${scanned.map((d) => d.name).join(', ')} look${scanned.length === 1 ? 's' : ''} scanned (no text in the PDF), so ${scanned.length === 1 ? 'it' : 'they'} can't be searched yet.`}</p>}
        {!sources.length && !busy && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Upload the mechanical spec (PDF). Plan text is picked up automatically from plan PDFs loaded from now on — for plans loaded before today, load the PDF again on that level.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
          {tab === 'search' && (
            <>
              <Input autoFocus className="h-9" placeholder="Search the spec and plans, e.g. fire damper, lined, R1.5" value={q} onChange={(e) => setQ(e.target.value)} />
              {q.trim().length >= 2 && <p className="text-xs text-muted-foreground">{`${results.length}${results.length >= 300 ? '+' : ''} found`}</p>}
              {results.map((h, i) => <Hit key={i} h={h} onOpen={openHit} />)}
            </>
          )}

          {tab === 'check' && (
            <>
              {sources.length > 0 && !watch.length && <p className="text-sm text-muted-foreground">Nothing on the watch list found.</p>}
              {groups.map((g) => (
                <div key={g}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{g}</div>
                  <div className="space-y-1">
                    {watch.filter((w) => w.group === g).map((w) => (
                      <div key={w.id} className="rounded-md border border-border">
                        <button type="button" onClick={() => setOpenId(openId === w.id ? null : w.id)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted rounded-md">
                          <ApperIcon name={openId === w.id ? 'ChevronDown' : 'ChevronRight'} size={14} />
                          <span className="font-medium">{w.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{`${w.count} mention${w.count === 1 ? '' : 's'}`}</span>
                        </button>
                        {openId === w.id && <div className="space-y-1 px-2 pb-2">{w.hits.map((h, i) => <Hit key={i} h={h} onOpen={openHit} />)}{w.count > w.hits.length && <p className="text-[11px] text-muted-foreground">{`First ${w.hits.length} shown — use Search for the rest.`}</p>}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-border p-2 space-y-2">
                <div className="text-xs font-medium">My words (also checked on every job)</div>
                <div className="flex flex-wrap gap-1">
                  {words.map((w) => <span key={w} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{w}<button type="button" aria-label={`Remove ${w}`} onClick={() => dropWord(w)}>×</button></span>)}
                  {!words.length && <span className="text-xs text-muted-foreground">e.g. polyplan, Bradflo, roof penetration</span>}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addWord(); }}>
                  <Input className="h-8" placeholder="Add a word or phrase" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
                  <Button type="submit" size="sm" variant="outline">Add</Button>
                </form>
              </div>
            </>
          )}

          {tab === 'cross' && (
            <>
              <p className="text-xs text-muted-foreground">Items the spec or plans mention, checked against this level's parts list (including takeoff counts and custom parts).</p>
              {!cross.length && <p className="text-sm text-muted-foreground">Nothing to cross-check yet.</p>}
              {cross.map((c) => (
                <div key={c.id} className={`rounded-md border p-2 text-sm ${c.missing ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <ApperIcon name={c.missing ? 'TriangleAlert' : 'CircleCheck'} size={15} className={c.missing ? 'text-amber-600' : 'text-emerald-600'} />
                    <span className="font-medium">{c.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{`${c.mentions} mention${c.mentions === 1 ? '' : 's'}`}</span>
                  </div>
                  <div className="mt-0.5 text-xs">{c.missing ? 'Mentioned, but nothing like it on your parts list.' : `On your list: ${c.onList.map((r) => `${r.qty} × ${r.name}`).join('; ')}`}</div>
                  {c.hit && <div className="mt-1"><Hit h={c.hit} onOpen={openHit} /></div>}
                </div>
              ))}
            </>
          )}

          {tab === 'docs' && (
            <>
              {docs.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                  <ApperIcon name="FileText" size={15} />
                  <span className="truncate">{d.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{`${d.pages?.length || 0} pages${d.scanned ? ' · scanned' : ''}`}</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => openHit({ kind: 'spec', sourceId: d.id, page: 1 })}>Open</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => onRemoveDoc(d)}>Remove</Button>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">{`Plan text found on ${plansWithText} of ${plans.length} level${plans.length === 1 ? '' : 's'}.`}{plansWithText < plans.length ? ' Levels with no text: plan was an image or scan, or loaded before today (load its PDF again to pick it up).' : ''}</div>
              <p className="text-[11px] text-muted-foreground">Specs are saved with this project on this computer and included in backups.</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
