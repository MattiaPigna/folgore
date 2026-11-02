import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, ExternalLink, FolderOpen, RefreshCw, Settings2 } from 'lucide-react';
import { LogoImg, Spinner } from './ui';
import { fetchNextMatch, nextMatchUrlOf, normalizeNextMatchUrl, type NextMatchInfo } from '../services/nextMatch';
import { sameTeam } from '../services/standings';
import { DEFAULT_LEAGUE } from '../services/tuttocampo';
import { useApp } from '../store/appStore';
import { useRoute } from '../store/routeStore';
import type { Match, Team } from '../types';

/** Suggests the next match from the club's Tuttocampo "Prossima partita" widget. */
export function NextMatchCard({ onUse }: { onUse: (patch: Partial<Match>) => void }) {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const teams = useApp((s) => s.teams);
  const matches = useApp((s) => s.matches);
  const go = useRoute((s) => s.go);
  const league = settings.league ?? DEFAULT_LEAGUE;
  const url = nextMatchUrlOf(league);
  const [info, setInfo] = useState<NextMatchInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(false);
  const [editLink, setEditLink] = useState(false);
  const [draft, setDraft] = useState(url);

  const load = async (u = url) => {
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      setInfo(await fetchNextMatch(u));
    } catch (e) {
      setInfo(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const findTeam = (name: string): Team | undefined => teams.find((t) => sameTeam(t.name, name));

  const s = useMemo(() => {
    if (!info) return null;
    const home = findTeam(info.home);
    const away = findTeam(info.away);
    const isHome = (m: Match) => (home && m.homeTeamId === home.id) || sameTeam(m.homeName, info.home);
    // Venue: from the last archived match played at home by the same team (never invented).
    const venue = [...matches].sort((a, b) => b.date.localeCompare(a.date)).find((m) => isHome(m) && m.stadium.trim());
    // Round: only when every team in the standings has played the same number of matches.
    const played = league.rows.map((r) => r.played);
    const round = played.length && played.every((p) => p !== null && p === played[0]) ? String((played[0] ?? 0) + 1) : null;
    const existing = matches.find((m) => m.date === info.date && isHome(m) && ((away && m.awayTeamId === away.id) || sameTeam(m.awayName, info.away)));
    return { home, away, venue, round, existing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, teams, matches, league.rows]);

  const use = () => {
    if (!info || !s) return;
    const p: Partial<Match> = {
      homeTeamId: s.home?.id ?? null,
      homeName: s.home?.name ?? info.home,
      homeLogoId: s.home?.logoId ?? null,
      awayTeamId: s.away?.id ?? null,
      awayName: s.away?.name ?? info.away,
      awayLogoId: s.away?.logoId ?? null,
      competition: league.category,
    };
    if (info.date) p.date = info.date;
    if (info.time) p.time = info.time;
    if (s.venue) Object.assign(p, { stadium: s.venue.stadium, city: s.venue.city });
    if (s.round) p.round = s.round;
    onUse(p);
    setUsed(true);
  };

  const saveLink = () => {
    const clean = draft.trim() ? normalizeNextMatchUrl(draft) : '';
    if (clean === null) return;
    setSettings({ league: { ...league, nextMatchWidgetUrl: clean } });
    setDraft(clean);
    setEditLink(false);
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0, flex: 1 }}>
          <CalendarClock size={16} /> Prossima partita · da Tuttocampo
        </div>
        <button className="btn sm ghost" onClick={() => load()} disabled={busy || !url} title="Aggiorna dal widget">
          {busy ? <Spinner /> : <RefreshCw size={14} />}
        </button>
        <button className="btn sm ghost" onClick={() => setEditLink((v) => !v)} title="Link del widget">
          <Settings2 size={14} />
        </button>
      </div>

      {editLink && (
        <div className="row wrap" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="field" style={{ flex: 1, minWidth: 280 }}>
            <label>Link widget «Prossima partita» (o codice iframe)</label>
            <input className="input" value={draft} placeholder="https://www.tuttocampo.it/WidgetV2/ProssimaPartita/…" onChange={(e) => setDraft(e.target.value)} />
            {draft.trim() && !normalizeNextMatchUrl(draft) && <span className="small" style={{ color: 'var(--warn)' }}>Link non valido: deve essere un widget «Prossima partita» di tuttocampo.it.</span>}
          </div>
          <button className="btn sm primary" onClick={saveLink} disabled={!!draft.trim() && !normalizeNextMatchUrl(draft)}>
            Salva
          </button>
          {url && (
            <a className="btn sm" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Anteprima
            </a>
          )}
        </div>
      )}

      {!url ? (
        <div className="muted small">Nessun widget configurato. Premi l’icona ⚙ e incolla il link del widget «Prossima partita» di Tuttocampo.</div>
      ) : busy && !info ? (
        <div className="row muted small">
          <Spinner /> Lettura del widget…
        </div>
      ) : error ? (
        <div className="small" style={{ color: 'var(--warn)' }}>{error} Puoi comunque inserire i dati a mano qui sotto.</div>
      ) : info && s ? (
        <div className="row wrap" style={{ gap: 18, alignItems: 'center' }}>
          <div className="row" style={{ gap: 10, flex: '1 1 360px' }}>
            <LogoImg assetId={s.home?.logoId} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {s.home?.name ?? info.home} <span className="muted">vs</span> {s.away?.name ?? info.away}
              </div>
              <div className="muted small" style={{ marginTop: 2 }}>
                {info.dateLabel || 'Data non indicata'}
                {info.state ? ` · ${info.state}` : ''}
              </div>
              <div className="faint small" style={{ marginTop: 4, lineHeight: 1.5 }}>
                {league.category}
                {s.round ? ` · Giornata ${s.round} (stimata dalla classifica)` : ''}
                {s.venue ? ` · ${s.venue.stadium}${s.venue.city ? `, ${s.venue.city}` : ''} (dall’ultima gara in casa)` : ' · Stadio da inserire'}
                {(!s.home || !s.away) && ` · ${[!s.home && info.home, !s.away && info.away].filter(Boolean).join(' e ')} non in libreria (senza logo)`}
              </div>
            </div>
            <LogoImg assetId={s.away?.logoId} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            {s.existing && (
              <button className="btn" onClick={() => go({ page: 'editor', matchId: s.existing!.id, kind: 'matchday' })} title="Questa partita è già nell'archivio">
                <FolderOpen size={15} /> Apri quella in archivio
              </button>
            )}
            <button className={`btn ${used ? '' : 'primary'}`} onClick={use}>
              {used ? <Check size={15} /> : <CalendarClock size={15} />} {used ? 'Dati inseriti' : 'Usa questi dati'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
