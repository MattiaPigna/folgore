import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Download, FlipHorizontal, FlipVertical, Pipette, RotateCcw, RotateCw, Save, Search, Sparkles, Undo2, Wand2 } from 'lucide-react';
import { SliderRow, Spinner, confirmDialog, useAssetUrl } from '../../components/ui';
import { db } from '../../services/database';
import { downloadBlob, slugify } from '../../services/export';
import { DEFAULT_PARAMS, RECIPES, STUDIO_FX, canvasToBlob, pickColor, processImage, type MonoMode, type StudioParams } from '../../services/imageStudio';
import { useApp } from '../../store/appStore';
import { useRoute } from '../../store/routeStore';
import type { AssetMeta } from '../../types';

type Section = 'sponsor' | 'logo' | 'photo';

const PREVIEW_SIDE = 900;
const FINAL_SIDE = 2400;

const BGS: { id: string; label: string; css: string }[] = [
  { id: 'dark', label: 'Scuro', css: '#14151b' },
  { id: 'light', label: 'Chiaro', css: '#f4f4f5' },
  { id: 'red', label: 'Rosso', css: '#9f1239' },
  { id: 'checker', label: 'Trasparenza', css: '' },
];

const pct = (v: number) => `${Math.round(v * 100)}`;

function baseName(name: string) {
  return name.replace(/\s*\((ritoccato|sfondo rimosso)\)\s*$/i, '');
}

function Thumb({ id }: { id: string }) {
  const url = useAssetUrl(id);
  return url ? <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : null;
}

export function ImageStudioPage() {
  const { route, go } = useRoute();
  const { assets, settings, toast, addAsset, setSettings, setAssetArchived, replaceAssetEverywhere, removeAsset } = useApp();
  const [q, setQ] = useState('');
  const [section, setSection] = useState<Section>('sponsor');
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [params, setParams] = useState<StudioParams>(DEFAULT_PARAMS);
  const [view, setView] = useState<'after' | 'before'>('after');
  const [bg, setBg] = useState('dark');
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const selectedId = route.assetId ?? null;
  const selected = assets.find((a) => a.id === selectedId) ?? null;
  const originals = settings.assetOriginals ?? {};

  // Library lists (archived = replaced versions are hidden).
  const sponsorAssets = (settings.sponsors ?? [])
    .map((s) => ({ meta: assets.find((a) => a.id === s.assetId), label: s.name }))
    .filter((x): x is { meta: AssetMeta; label: string } => !!x.meta);
  const lists: Record<Section, { meta: AssetMeta; label: string }[]> = {
    sponsor: sponsorAssets,
    logo: assets.filter((a) => a.kind === 'logo' && !a.archived).map((a) => ({ meta: a, label: a.name })),
    photo: assets.filter((a) => (a.kind === 'background' || a.kind === 'photo' || a.kind === 'image') && !a.archived).map((a) => ({ meta: a, label: a.name })),
  };
  const list = lists[section].filter((x) => x.label.toLowerCase().includes(q.toLowerCase()));

  // Open the section of the selected image.
  useEffect(() => {
    if (!selected) return;
    if (sponsorAssets.some((x) => x.meta.id === selected.id)) setSection('sponsor');
    else if (selected.kind === 'logo') setSection('logo');
    else if (selected.kind !== 'sponsor') setSection('photo');
  }, [selectedId]);

  // Load the image.
  useEffect(() => {
    let alive = true;
    setBitmap(null);
    setPreview(null);
    setParams(DEFAULT_PARAMS);
    setPicking(false);
    if (!selectedId) return;
    (async () => {
      const rec = await db.get('assets', selectedId);
      if (!rec || !alive) return;
      const bmp = await createImageBitmap(rec.blob);
      if (alive) setBitmap(bmp);
    })().catch(() => toast('Impossibile aprire questa immagine.', 'error'));
    return () => {
      alive = false;
    };
  }, [selectedId, toast]);

  // Live preview (debounced).
  useEffect(() => {
    if (!bitmap) return;
    const t = window.setTimeout(() => {
      const geometryOnly: StudioParams = { ...DEFAULT_PARAMS, rotate: params.rotate, flipX: params.flipX, flipY: params.flipY, crop: params.crop };
      beforeRef.current = processImage(bitmap, geometryOnly, PREVIEW_SIDE);
      const out = view === 'before' || picking ? beforeRef.current : processImage(bitmap, params, PREVIEW_SIDE);
      setPreview(out.toDataURL('image/png'));
    }, 90);
    return () => window.clearTimeout(t);
  }, [bitmap, params, view, picking]);

  const set = (p: Partial<StudioParams>) => setParams((cur) => ({ ...cur, ...p }));
  const isDefault = useMemo(() => JSON.stringify(params) === JSON.stringify(DEFAULT_PARAMS), [params]);

  const onPreviewClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!picking || !beforeRef.current || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    const c = beforeRef.current;
    // object-fit: contain -> map the click to image pixels
    const s = Math.min(r.width / c.width, r.height / c.height);
    const ox = r.left + (r.width - c.width * s) / 2;
    const oy = r.top + (r.height - c.height * s) / 2;
    const x = (e.clientX - ox) / s;
    const y = (e.clientY - oy) / s;
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
    set({ bgColor: pickColor(c, x, y), bgMode: params.bgMode === 'off' ? 'everywhere' : params.bgMode });
    setPicking(false);
  };

  const save = async () => {
    if (!bitmap || !selected) return;
    setBusy(true);
    try {
      const blob = await canvasToBlob(processImage(bitmap, params, FINAL_SIDE));
      const meta = await addAsset(blob, selected.kind, `${baseName(selected.name)} (ritoccato)`);
      const original = originals[selected.id] ?? selected.id;
      await replaceAssetEverywhere(selected.id, meta.id);
      await setAssetArchived(selected.id, true);
      const map = { ...(useApp.getState().settings.assetOriginals ?? {}), [meta.id]: original };
      delete map[selected.id];
      await setSettings({ assetOriginals: map });
      go({ page: 'studio', assetId: meta.id });
      toast('Immagine aggiornata ovunque: sponsor, squadre, partite e classifica.', 'success');
    } catch (e) {
      toast(`Salvataggio non riuscito: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!selected) return;
    const original = originals[selected.id];
    if (!original) return;
    const ok = await confirmDialog({ title: 'Ripristinare l’originale?', message: 'L’immagine originale tornerà in uso al posto di questa versione ritoccata.', confirmLabel: 'Ripristina' });
    if (!ok) return;
    await setAssetArchived(original, false);
    await replaceAssetEverywhere(selected.id, original);
    const map = { ...(useApp.getState().settings.assetOriginals ?? {}) };
    delete map[selected.id];
    await setSettings({ assetOriginals: map });
    const current = selected.id;
    go({ page: 'studio', assetId: original });
    await removeAsset(current);
    toast('Originale ripristinato.', 'success');
  };

  const download = async () => {
    if (!bitmap || !selected) return;
    downloadBlob(await canvasToBlob(processImage(bitmap, params, FINAL_SIDE)), `${slugify(baseName(selected.name))}.png`);
  };

  const bgCss = BGS.find((b) => b.id === bg)!;

  return (
    <div className="studio">
      {/* ---------- list ---------- */}
      <aside className="panel">
        <div className="panel-tabs">
          {(
            [
              ['sponsor', 'Sponsor'],
              ['logo', 'Loghi'],
              ['photo', 'Foto e sfondi'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`panel-tab ${section === id ? 'active' : ''}`} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="panel-scroll">
          <div className="search">
            <Search size={14} />
            <input className="input sm" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {list.map(({ meta, label }) => (
              <button key={meta.id} className={`studio-item ${meta.id === selectedId ? 'active' : ''}`} onClick={() => go({ page: 'studio', assetId: meta.id })} title={label}>
                <div className="studio-thumb checker">
                  <Thumb id={meta.id} />
                </div>
                <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {originals[meta.id] && <Sparkles size={10} color="var(--accent)" />} {label}
                </span>
              </button>
            ))}
          </div>
          {!list.length && <div className="faint small">Nessuna immagine in questa sezione.</div>}
        </div>
      </aside>

      {/* ---------- preview ---------- */}
      <div className="studio-stage">
        <div className="studio-bar">
          <div className="title" style={{ fontWeight: 600 }}>{selected ? baseName(selected.name) : 'Ritocco immagini'}</div>
          <div className="spacer" />
          {selected && (
            <>
              <div className="btn-group">
                <button className={`btn sm ${view === 'before' ? 'active' : ''}`} onClick={() => setView('before')}>
                  Prima
                </button>
                <button className={`btn sm ${view === 'after' ? 'active' : ''}`} onClick={() => setView('after')}>
                  Dopo
                </button>
              </div>
              <div className="btn-group">
                {BGS.map((b) => (
                  <button key={b.id} className={`btn sm ${bg === b.id ? 'active' : ''}`} onClick={() => setBg(b.id)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className={`studio-canvas ${bg === 'checker' ? 'checker' : ''}`} style={bg === 'checker' ? undefined : { background: bgCss.css }}>
          {!selected ? (
            <div className="faint" style={{ textAlign: 'center', lineHeight: 1.6 }}>
              Scegli un’immagine a sinistra.
              <br />
              Puoi sistemare sponsor e loghi (sfondo, versione bianca leggibile, contorno) e migliorare le foto.
            </div>
          ) : !preview ? (
            <Spinner />
          ) : (
            <img ref={imgRef} src={preview} alt="" onClick={onPreviewClick} style={{ cursor: picking ? 'crosshair' : 'default' }} draggable={false} />
          )}
          {picking && <div className="studio-hint">Clicca sul colore da rendere trasparente</div>}
        </div>
      </div>

      {/* ---------- tools ---------- */}
      <aside className="panel right">
        <div className="panel-scroll">
          {!selected || !bitmap ? (
            <div className="faint small">Nessuna immagine selezionata.</div>
          ) : (
            <>
              <div className="section">
                <div className="section-title">
                  <Wand2 size={12} /> Ricette rapide
                </div>
                <div className="add-grid">
                  {RECIPES.map((r) => (
                    <button
                      key={r.id}
                      className="add-btn"
                      title={r.hint}
                      onClick={() => setParams({ ...DEFAULT_PARAMS, rotate: params.rotate, flipX: params.flipX, flipY: params.flipY, crop: params.crop, ...r.params })}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="section">
                <div className="section-title">
                  <Sparkles size={12} /> Effetti
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {STUDIO_FX.map((f) => (
                    <button key={f.id} className={`btn sm ${params.effect === f.id ? 'active' : ''}`} style={{ padding: '0 4px' }} title={f.hint} onClick={() => set({ effect: f.id })}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {params.effect !== 'none' && (
                  <SliderRow label="Intensità" min={0.05} max={1} step={0.01} value={params.effectAmount} onChange={(v) => set({ effectAmount: v })} format={pct} />
                )}
              </div>

              <div className="section">
                <div className="section-title">Sfondo</div>
                <div className="btn-group">
                  {(
                    [
                      ['off', 'Tieni'],
                      ['edges', 'Togli dai bordi'],
                      ['everywhere', 'Togli ovunque'],
                    ] as const
                  ).map(([m, l]) => (
                    <button key={m} className={`btn sm ${params.bgMode === m ? 'active' : ''}`} onClick={() => set({ bgMode: m })}>
                      {l}
                    </button>
                  ))}
                </div>
                {params.bgMode !== 'off' && (
                  <>
                    <SliderRow label="Tolleranza" min={0} max={1} step={0.01} value={params.bgTolerance} onChange={(v) => set({ bgTolerance: v })} format={pct} />
                    <div className="row">
                      <span
                        className="checker"
                        style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-2)', background: params.bgColor ? `rgb(${params.bgColor.join(',')})` : undefined }}
                        title={params.bgColor ? 'Colore scelto' : 'Automatico (colore del bordo)'}
                      />
                      <button className={`btn sm ${picking ? 'active' : ''}`} onClick={() => setPicking((v) => !v)}>
                        <Pipette size={13} /> Scegli dall’immagine
                      </button>
                      {params.bgColor && (
                        <button className="btn sm ghost" onClick={() => set({ bgColor: null })}>
                          Auto
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="section">
                <div className="section-title">Versione a un colore</div>
                <div className="btn-group">
                  {(
                    [
                      ['off', 'No'],
                      ['darkToColor', 'Scuri'],
                      ['lightToColor', 'Chiari'],
                      ['silhouette', 'Sagoma'],
                    ] as [MonoMode, string][]
                  ).map(([m, l]) => (
                    <button key={m} className={`btn sm ${params.mono === m ? 'active' : ''}`} onClick={() => set({ mono: m })} title={m === 'darkToColor' ? 'Le parti scure prendono il colore, le chiare diventano trasparenti' : m === 'lightToColor' ? 'Le parti chiare prendono il colore, le scure diventano trasparenti' : m === 'silhouette' ? 'Tutto il logo nel colore scelto (sagoma piena)' : 'Colori originali'}>
                      {l}
                    </button>
                  ))}
                </div>
                {params.mono !== 'off' && (
                  <>
                    <div className="row">
                      <input type="color" className="swatch" value={params.monoColor} onChange={(e) => set({ monoColor: e.target.value })} />
                      <button className="btn sm" onClick={() => set({ monoColor: '#ffffff' })}>
                        Bianco
                      </button>
                      <button className="btn sm" onClick={() => set({ monoColor: '#000000' })}>
                        Nero
                      </button>
                      <button className="btn sm" onClick={() => set({ monoColor: '#e11d48' })}>
                        Rosso
                      </button>
                    </div>
                    {params.mono !== 'silhouette' && (
                      <>
                        <SliderRow label="Soglia" min={0.05} max={0.95} step={0.01} value={params.monoThreshold} onChange={(v) => set({ monoThreshold: v })} format={pct} />
                        <SliderRow label="Morbidezza" min={0.01} max={0.6} step={0.01} value={params.monoSoftness} onChange={(v) => set({ monoSoftness: v })} format={pct} />
                        <div className="faint small">Alza la soglia se mancano dettagli, abbassala se il logo diventa una macchia.</div>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="section">
                <div className="section-title">Contorno adesivo</div>
                <SliderRow label="Spessore" min={0} max={40} step={1} value={params.outline} onChange={(v) => set({ outline: v })} format={(v) => `${v}`} />
                {params.outline > 0 && (
                  <div className="row">
                    <span className="label" style={{ flex: 1 }}>Colore contorno</span>
                    <input type="color" className="swatch" value={params.outlineColor} onChange={(e) => set({ outlineColor: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="section">
                <div className="section-title">Regolazioni</div>
                <SliderRow label="Luminosità" min={-0.6} max={0.6} step={0.01} value={params.brightness} onChange={(v) => set({ brightness: v })} format={pct} />
                <SliderRow label="Contrasto" min={-0.6} max={0.8} step={0.01} value={params.contrast} onChange={(v) => set({ contrast: v })} format={pct} />
                <SliderRow label="Saturazione" min={-1} max={1} step={0.01} value={params.saturation} onChange={(v) => set({ saturation: v })} format={pct} />
                <SliderRow label="Nitidezza" min={0} max={1} step={0.01} value={params.sharpen} onChange={(v) => set({ sharpen: v })} format={pct} />
                <label className="check small">
                  <input type="checkbox" checked={params.grayscale} onChange={(e) => set({ grayscale: e.target.checked })} /> Bianco e nero
                </label>
              </div>

              <div className="section">
                <div className="section-title">
                  <Crop size={12} /> Forma e ritaglio
                </div>
                <div className="btn-group">
                  <button className="btn sm" title="Ruota a sinistra" onClick={() => set({ rotate: (((params.rotate + 270) % 360) as StudioParams['rotate']) })}>
                    <RotateCcw size={13} />
                  </button>
                  <button className="btn sm" title="Ruota a destra" onClick={() => set({ rotate: (((params.rotate + 90) % 360) as StudioParams['rotate']) })}>
                    <RotateCw size={13} />
                  </button>
                  <button className={`btn sm ${params.flipX ? 'active' : ''}`} title="Specchia orizzontale" onClick={() => set({ flipX: !params.flipX })}>
                    <FlipHorizontal size={13} />
                  </button>
                  <button className={`btn sm ${params.flipY ? 'active' : ''}`} title="Specchia verticale" onClick={() => set({ flipY: !params.flipY })}>
                    <FlipVertical size={13} />
                  </button>
                </div>
                {(['l', 'r', 't', 'b'] as const).map((k) => (
                  <SliderRow
                    key={k}
                    label={{ l: 'Sinistra', r: 'Destra', t: 'Alto', b: 'Basso' }[k]}
                    min={0}
                    max={0.45}
                    step={0.005}
                    value={params.crop[k]}
                    onChange={(v) => set({ crop: { ...params.crop, [k]: v } })}
                    format={pct}
                  />
                ))}
                <label className="check small">
                  <input type="checkbox" checked={params.trim} onChange={(e) => set({ trim: e.target.checked })} /> Togli i margini vuoti
                </label>
              </div>

              <div className="section">
                <button className="btn primary" onClick={save} disabled={busy || isDefault}>
                  {busy ? <Spinner /> : <Save size={14} />} Salva nuova versione
                </button>
                <div className="faint small">La nuova versione sostituisce questa immagine in sponsor, squadre, partite e classifica. L’originale resta salvato.</div>
                <div className="row wrap">
                  <button className="btn sm" onClick={() => setParams(DEFAULT_PARAMS)} disabled={isDefault}>
                    <Undo2 size={13} /> Annulla modifiche
                  </button>
                  <button className="btn sm" onClick={download}>
                    <Download size={13} /> Scarica PNG
                  </button>
                  {originals[selected.id] && (
                    <button className="btn sm danger" onClick={restore}>
                      Ripristina originale
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
