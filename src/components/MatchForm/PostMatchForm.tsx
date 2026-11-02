import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { uid } from '../../services/database';
import { BG_TYPES, FileError, PHOTO_MAX_SIDE, fileBaseName, pickFile, prepareImage } from '../../services/imageProcessing';
import { useApp } from '../../store/appStore';
import type { Match } from '../../types';
import { useAssetUrl } from '../ui';

export function PostMatchForm({ match, onChange }: { match: Match; onChange: (patch: Partial<Match>) => void }) {
  const addAsset = useApp((s) => s.addAsset);
  const toast = useApp((s) => s.toast);
  const photoUrl = useAssetUrl(match.photoId);

  const uploadPhoto = async () => {
    const [file] = await pickFile('.jpg,.jpeg,.png,.webp');
    if (!file) return;
    try {
      const blob = await prepareImage(file, BG_TYPES, 'la foto', PHOTO_MAX_SIDE);
      const meta = await addAsset(blob, 'photo', fileBaseName(file.name));
      onChange({ photoId: meta.id });
      toast('Foto della partita caricata.', 'success');
    } catch (e) {
      toast(e instanceof FileError ? e.message : 'Impossibile caricare la foto.', 'error');
    }
  };

  const setStat = (id: string, patch: Partial<Match['stats'][number]>) =>
    onChange({ stats: match.stats.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div className="section" style={{ gap: 14 }}>
      <div className="section">
        <div className="section-title">Foto della partita</div>
        <div className="bg-preview checker" style={{ aspectRatio: '16/10' }}>
          {photoUrl ? <img src={photoUrl} alt="" /> : <span className="faint small">Nessuna foto</span>}
        </div>
        <div className="row">
          <button className="btn sm" style={{ flex: 1 }} onClick={uploadPhoto}>
            <ImagePlus size={14} /> {match.photoId ? 'Sostituisci foto' : 'Carica foto'}
          </button>
          {match.photoId && (
            <button className="btn sm icon" title="Rimuovi foto" onClick={() => onChange({ photoId: null })}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Migliore in campo</div>
        <input className="input sm" value={match.mvp} placeholder="Es. Mario Rossi" onChange={(e) => onChange({ mvp: e.target.value })} />
      </div>
      <div className="section">
        <div className="row">
          <div className="section-title">Statistiche</div>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => onChange({ stats: [...match.stats, { id: uid(), label: '', home: '0', away: '0' }] })}>
            <Plus size={13} /> Aggiungi
          </button>
        </div>
        {match.stats.map((s) => (
          <div key={s.id} className="row" style={{ gap: 5 }}>
            <input className="input sm" style={{ width: 44, textAlign: 'center' }} value={s.home} onChange={(e) => setStat(s.id, { home: e.target.value })} />
            <input className="input sm" placeholder="Es. Tiri in porta" value={s.label} onChange={(e) => setStat(s.id, { label: e.target.value })} />
            <input className="input sm" style={{ width: 44, textAlign: 'center' }} value={s.away} onChange={(e) => setStat(s.id, { away: e.target.value })} />
            <button className="layer-btn" title="Rimuovi" onClick={() => onChange({ stats: match.stats.filter((x) => x.id !== s.id) })}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!match.stats.length && <div className="faint small">Esempi: Possesso palla, Tiri in porta, Calci d'angolo.</div>}
      </div>
      <div className="section">
        <div className="section-title">Informazioni aggiuntive</div>
        <textarea
          className="textarea"
          value={match.extraInfo}
          placeholder="Es. Prossima gara: domenica in trasferta…"
          onChange={(e) => onChange({ extraInfo: e.target.value })}
        />
      </div>
    </div>
  );
}
