import { useState } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, FolderDown, Handshake, Moon, Sun, Trash2, Upload, Wand2, WandSparkles } from 'lucide-react';
import { useRoute } from '../../store/routeStore';
import { Dropzone, confirmDialog, useAssetUrl } from '../../components/ui';
import { SPONSOR_FOLDER_COUNT, TIER_LABELS, activeSponsors, addSponsorFile, exportSponsorsZip, importSponsorFolder, removeFlatBackground } from '../../services/sponsors';
import { db } from '../../services/database';
import { useApp } from '../../store/appStore';
import type { Sponsor, SponsorTier } from '../../types';

export function SponsorsPage() {
  const { settings, setSettings, toast, addAsset, removeAsset } = useApp();
  const go = useRoute((s) => s.go);
  const sponsors = settings.sponsors ?? [];
  const [dark, setDark] = useState(true);
  const ordered = [...sponsors].sort((a, b) => a.order - b.order);
  const active = activeSponsors(settings);

  const save = (list: Sponsor[]) => setSettings({ sponsors: list.map((s, i) => ({ ...s, order: i })) });
  const patch = (id: string, p: Partial<Sponsor>) => save(ordered.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const move = (i: number, d: -1 | 1) => {
    const list = [...ordered];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save(list);
  };

  const onFiles = async (files: File[]) => {
    let n = 0;
    for (const f of files) if (await addSponsorFile(f)) n++;
    if (n) toast(n > 1 ? `${n} sponsor aggiunti.` : 'Sponsor aggiunto.', 'success');
  };

  const toggleBackground = async (s: Sponsor) => {
    if (s.originalAssetId) {
      // Back to the untouched upload.
      patch(s.id, { assetId: s.originalAssetId, originalAssetId: s.assetId });
      return;
    }
    const rec = await db.get('assets', s.assetId);
    if (!rec) return;
    const cleaned = await removeFlatBackground(rec.blob).catch(() => null);
    if (!cleaned) {
      toast('Nessuno sfondo chiaro uniforme da rimuovere in questo logo.', 'info');
      return;
    }
    const meta = await addAsset(cleaned, 'sponsor', `${s.name} (sfondo rimosso)`);
    patch(s.id, { assetId: meta.id, originalAssetId: s.assetId });
    toast('Sfondo bianco rimosso.', 'success');
  };

  const remove = async (s: Sponsor) => {
    const ok = await confirmDialog({ title: 'Eliminare lo sponsor?', message: `"${s.name}" verrà rimosso. Nelle grafiche il suo spazio verrà nascosto.`, confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    save(ordered.filter((x) => x.id !== s.id));
    for (const id of [s.assetId, s.originalAssetId]) if (id) await removeAsset(id);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sponsor</h1>
          <p className="page-sub">Sponsor ufficiali da inserire nelle grafiche (barra sponsor, main sponsor, powered by, griglia partner).</p>
        </div>
        <div className="row">
          <button className={`btn ${dark ? 'active' : ''}`} title="Anteprima su sfondo scuro / chiaro" onClick={() => setDark((v) => !v)}>
            {dark ? <Moon size={15} /> : <Sun size={15} />} Sfondo {dark ? 'scuro' : 'chiaro'}
          </button>
          <button
            className="btn"
            disabled={!sponsors.length}
            title="Scarica tutti i loghi sponsor in un file ZIP"
            onClick={async () => {
              const n = await exportSponsorsZip().catch((e) => {
                toast(`Errore nell'esportazione: ${(e as Error).message}`, 'error');
                return 0;
              });
              if (n) toast(`${n} sponsor esportati.`, 'success');
            }}
          >
            <Download size={15} /> Scarica sponsor (ZIP)
          </button>
          <button
            className="btn"
            disabled={!SPONSOR_FOLDER_COUNT}
            title={`Importa i file della cartella sponsor/puliti (${SPONSOR_FOLDER_COUNT})`}
            onClick={async () => {
              const n = await importSponsorFolder(true);
              toast(n ? `${n} sponsor importati dalla cartella.` : 'Tutti gli sponsor della cartella sono già presenti.', n ? 'success' : 'info');
            }}
          >
            <FolderDown size={15} /> Importa dalla cartella ({SPONSOR_FOLDER_COUNT})
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Dropzone accept=".png,.svg,.jpg,.jpeg,.webp" onFiles={onFiles}>
          <Upload size={20} style={{ marginBottom: 6 }} />
          <div style={{ fontWeight: 600 }}>Aggiungi sponsor</div>
          <div className="small faint">PNG, SVG, JPG, WEBP · lo sfondo bianco uniforme viene rimosso automaticamente</div>
        </Dropzone>
      </div>

      {!ordered.length ? (
        <div className="empty">
          <Handshake size={34} />
          <div>Nessuno sponsor. Trascina qui sopra i loghi o mettili nella cartella sponsor/puliti del progetto.</div>
        </div>
      ) : (
        <>
          <div className="faint small" style={{ marginBottom: 10 }}>
            {active.length} attivi su {ordered.length}. Ordine nelle grafiche: Main sponsor, sponsor tecnico, ufficiali, partner (poi l'ordine qui sotto).
          </div>
          <div className="tiles">
            {ordered.map((s, i) => (
              <div key={s.id} className="tile" style={{ opacity: s.active ? 1 : 0.5 }}>
                <div className="tile-media" style={{ background: dark ? '#14151b' : '#f4f4f5', aspectRatio: '16/10' }}>
                  <div style={{ width: '88%', height: '78%', display: 'grid', placeItems: 'center' }}>
                    <SponsorImg assetId={s.assetId} />
                  </div>
                </div>
                <div className="tile-body">
                  <input className="input sm" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} />
                  <select className="select sm" value={s.tier} onChange={(e) => patch(s.id, { tier: e.target.value as SponsorTier })}>
                    {(Object.keys(TIER_LABELS) as SponsorTier[]).map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="layer-btn" title={s.active ? 'Disattiva (non compare nelle grafiche)' : 'Attiva'} onClick={() => patch(s.id, { active: !s.active })}>
                      {s.active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button className="layer-btn" title="Sposta prima" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="layer-btn" title="Sposta dopo" onClick={() => move(i, 1)} disabled={i === ordered.length - 1}>
                      <ArrowDown size={14} />
                    </button>
                    <button className={`layer-btn ${s.originalAssetId ? 'on' : ''}`} title={s.originalAssetId ? 'Sfondo rimosso: clicca per usare l’originale' : 'Rimuovi sfondo bianco'} onClick={() => toggleBackground(s)}>
                      <Wand2 size={14} />
                    </button>
                    <button className="layer-btn" title="Ritocca (sfondo, versione bianca, contorno…)" onClick={() => go({ page: 'studio', assetId: s.assetId })}>
                      <WandSparkles size={14} />
                    </button>
                    <div className="spacer" />
                    <button className="layer-btn" title="Elimina" onClick={() => remove(s)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SponsorImg({ assetId }: { assetId: string }) {
  const url = useAssetUrl(assetId);
  return url ? <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} draggable={false} /> : null;
}
