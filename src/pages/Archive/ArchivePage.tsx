import { useMemo, useState } from 'react';
import { Archive, CalendarDays, Copy, FileArchive, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { LogoImg, Spinner, confirmDialog } from '../../components/ui';
import { formatItalianDate } from '../../services/bindings';
import { exportZip } from '../../services/export';
import { computeScore } from '../../services/score';
import { useApp } from '../../store/appStore';
import { useRoute } from '../../store/routeStore';
import type { Match } from '../../types';
import { GRAPHIC_KINDS } from '../../types';

export function ArchivePage() {
  const matches = useApp((s) => s.matches);
  const go = useRoute((s) => s.go);
  const [q, setQ] = useState('');
  const sorted = useMemo(
    () =>
      matches
        .filter((m) => `${m.homeName} ${m.awayName} ${m.stadium} ${m.competition}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt),
    [matches, q],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Archivio partite</h1>
          <p className="page-sub">Riapri, modifica, duplica o esporta i progetti salvati.</p>
        </div>
        <div className="row">
          <div className="search" style={{ width: 260 }}>
            <Search size={14} />
            <input className="input" placeholder="Cerca partita…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn primary" onClick={() => go({ page: 'new' })}>
            <Plus size={15} /> Nuova partita
          </button>
        </div>
      </div>
      {!sorted.length ? (
        <div className="empty">
          <Archive size={34} />
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{matches.length ? 'Nessun risultato' : 'Nessuna partita salvata'}</div>
          <div>Crea la prima partita per iniziare a realizzare le grafiche.</div>
          {!matches.length && (
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => go({ page: 'new' })}>
              <Plus size={15} /> Nuova partita
            </button>
          )}
        </div>
      ) : (
        <div className="match-list">
          {sorted.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const go = useRoute((s) => s.go);
  const { duplicateMatch, removeMatch, toast, templates, settings } = useApp();
  const [busy, setBusy] = useState(false);
  const score = computeScore(match.goals);
  const done = GRAPHIC_KINDS.filter((k) => match.graphics[k]).length;
  const open = () => go({ page: 'editor', matchId: match.id, kind: 'matchday' });

  const zip = async () => {
    setBusy(true);
    try {
      await exportZip(match, templates, settings, 'png');
      toast('Pacchetto ZIP esportato.', 'success');
    } catch (e) {
      toast(`Esportazione non riuscita: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="match-card">
      <div className="match-hero" onClick={open}>
        <div className="match-team">
          <LogoImg assetId={match.homeLogoId} />
          <span className="name">{match.homeName || 'Casa'}</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="match-score">{match.goals.length ? `${score.home} - ${score.away}` : 'VS'}</div>
          {match.penalties.enabled && (
            <div className="small muted">
              d.c.r. {match.penalties.home}-{match.penalties.away}
            </div>
          )}
        </div>
        <div className="match-team">
          <LogoImg assetId={match.awayLogoId} />
          <span className="name">{match.awayName || 'Ospite'}</span>
        </div>
      </div>
      <div className="match-meta">
        <span className="row" style={{ gap: 5 }}>
          <CalendarDays size={13} /> {match.date ? formatItalianDate(match.date) : '—'} {match.time && `· ${match.time}`}
        </span>
        {match.stadium && (
          <span className="row" style={{ gap: 5 }}>
            <MapPin size={13} /> {match.stadium}
          </span>
        )}
        <span className="faint">
          {done}/{GRAPHIC_KINDS.length} grafiche{match.round ? ` · G${match.round}` : ''}
        </span>
      </div>
      <div className="match-actions">
        <button className="btn sm primary" onClick={open}>
          <Pencil size={13} /> Apri
        </button>
        <button className="btn sm" onClick={zip} disabled={busy} title="Esporta tutte le grafiche in ZIP">
          {busy ? <Spinner /> : <FileArchive size={13} />} ZIP
        </button>
        <div className="spacer" />
        <button
          className="btn sm icon"
          title="Duplica"
          onClick={async () => {
            const c = await duplicateMatch(match.id);
            if (c) toast('Partita duplicata.', 'success');
          }}
        >
          <Copy size={13} />
        </button>
        <button
          className="btn sm icon danger"
          title="Elimina"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Eliminare la partita?',
              message: `${match.homeName} – ${match.awayName}: verranno eliminati dati, marcatori e grafiche. L'operazione non è reversibile.`,
              confirmLabel: 'Elimina',
              danger: true,
            });
            if (ok) {
              await removeMatch(match.id);
              toast('Partita eliminata.');
            }
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
