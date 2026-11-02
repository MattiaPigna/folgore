import { useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Check, Clapperboard, Pencil, Plus, Trash2, X } from 'lucide-react';
import { uid } from '../../services/database';
import { GOAL_TYPE_LABEL, computeScore, creditedTeam, formatMinute, parseMinute, playerTeam, sortGoals } from '../../services/score';
import type { Goal, GoalType, Match } from '../../types';
import { confirmDialog } from '../ui';
import { GoalCardModal } from './GoalCardModal';

interface Draft {
  id: string | null;
  side: 'home' | 'away'; // team of the player
  player: string;
  minute: string;
  type: GoalType;
}

const emptyDraft = (side: 'home' | 'away' = 'home'): Draft => ({ id: null, side, player: '', minute: '', type: 'normal' });

export function GoalManager({ match, onChange }: { match: Match; onChange: (patch: Partial<Match>) => void }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState('');
  const [autoSort, setAutoSort] = useState(true);
  const [cardGoal, setCardGoal] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const ht = computeScore(match.goals, { halfOnly: true, halfEndMinute: match.halfEndMinute });
  const ft = computeScore(match.goals);
  const homeName = match.homeName || 'Casa';
  const awayName = match.awayName || 'Ospite';

  const submit = () => {
    const parsed = parseMinute(draft.minute);
    if (!parsed) {
      setError('Minuto non valido. Esempi: 12, 45+2, 90+3');
      return;
    }
    if (parsed.minute < 1 || parsed.minute > 130) {
      setError('Il minuto deve essere compreso tra 1 e 130.');
      return;
    }
    const goal: Goal = {
      id: draft.id ?? uid(),
      team: creditedTeam(draft.side, draft.type),
      player: draft.player.trim(),
      minute: parsed.minute,
      stoppage: parsed.stoppage,
      type: draft.type,
    };
    let goals = draft.id ? match.goals.map((g) => (g.id === draft.id ? goal : g)) : [...match.goals, goal];
    if (autoSort) goals = sortGoals(goals);
    onChange({ goals });
    if (!draft.id) setLastAdded(goal.id);
    setDraft(emptyDraft(draft.side));
    setError('');
  };

  const edit = (g: Goal) => {
    setDraft({ id: g.id, side: playerTeam(g), player: g.player, minute: formatMinute(g).replace("'", ''), type: g.type });
    setError('');
  };

  const remove = async (g: Goal) => {
    const ok = await confirmDialog({ title: 'Eliminare il gol?', message: `${g.player || 'Gol'} ${formatMinute(g)}`, confirmLabel: 'Elimina', danger: true });
    if (ok) onChange({ goals: match.goals.filter((x) => x.id !== g.id) });
    if (draft.id === g.id) setDraft(emptyDraft());
  };

  const move = (i: number, d: -1 | 1) => {
    const goals = [...match.goals];
    const j = i + d;
    if (j < 0 || j >= goals.length) return;
    [goals[i], goals[j]] = [goals[j], goals[i]];
    onChange({ goals });
  };

  return (
    <div className="section" style={{ gap: 14 }}>
      <div className="scoreboard">
        <div className="team" title={homeName}>{homeName}</div>
        <div>
          <div className="big">
            {ft.home} - {ft.away}
          </div>
          <div className="cap">FINALE</div>
        </div>
        <div className="team" title={awayName}>{awayName}</div>
        <div />
        <div>
          <div className="big" style={{ fontSize: 18, color: 'var(--muted)' }}>
            {ht.home} - {ht.away}
          </div>
          <div className="cap">1° TEMPO</div>
        </div>
        <div />
      </div>

      <div className="section" style={{ gap: 8 }}>
        <div className="section-title">{draft.id ? 'Modifica gol' : 'Aggiungi gol'}</div>
        <div className="btn-group">
          <button className={`btn sm ${draft.side === 'home' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, side: 'home' })} title="Squadra del marcatore">
            {homeName}
          </button>
          <button className={`btn sm ${draft.side === 'away' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, side: 'away' })}>
            {awayName}
          </button>
        </div>
        <div className="row">
          <input
            className="input sm"
            placeholder="Marcatore (es. Rossi)"
            value={draft.player}
            onChange={(e) => setDraft({ ...draft, player: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <input
            className="input sm"
            style={{ width: 78 }}
            placeholder="Min. 45+2"
            value={draft.minute}
            onChange={(e) => (setDraft({ ...draft, minute: e.target.value }), setError(''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="btn-group">
          {(['normal', 'penalty', 'own'] as GoalType[]).map((t) => (
            <button key={t} className={`btn sm ${draft.type === t ? 'active' : ''}`} onClick={() => setDraft({ ...draft, type: t })}>
              {GOAL_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {draft.type === 'own' && (
          <div className="faint small">
            Autogol di un giocatore {draft.side === 'home' ? `di ${homeName}` : `di ${awayName}`}: il gol viene assegnato a{' '}
            {draft.side === 'home' ? awayName : homeName}.
          </div>
        )}
        {error && <div className="small" style={{ color: '#fca5a5' }}>{error}</div>}
        <div className="row">
          <button className="btn sm primary" style={{ flex: 1 }} onClick={submit}>
            {draft.id ? <Check size={14} /> : <Plus size={14} />} {draft.id ? 'Salva modifica' : 'Aggiungi gol'}
          </button>
          {draft.id && (
            <button className="btn sm" onClick={() => setDraft(emptyDraft())}>
              <X size={14} /> Annulla
            </button>
          )}
        </div>
      </div>

      <div className="section" style={{ gap: 8 }}>
        <div className="row">
          <div className="section-title">Eventi ({match.goals.length})</div>
          <div className="spacer" />
          <button className="btn sm ghost" title="Riordina cronologicamente" onClick={() => onChange({ goals: sortGoals(match.goals) })} disabled={match.goals.length < 2}>
            <ArrowDownUp size={13} /> Ordina
          </button>
        </div>
        <label className="check small muted">
          <input type="checkbox" checked={autoSort} onChange={(e) => setAutoSort(e.target.checked)} /> Ordina automaticamente
        </label>
        {lastAdded && match.goals.some((g) => g.id === lastAdded) && (
          <button className="btn primary" style={{ width: '100%' }} onClick={() => (setCardGoal(lastAdded), setLastAdded(null))}>
            <Clapperboard size={15} /> Crea la card animata del gol
          </button>
        )}
        <div className="goal-list">
          {match.goals.map((g, i) => {
            const first = g.minute <= match.halfEndMinute;
            return (
              <div className="goal" key={g.id} style={draft.id === g.id ? { borderColor: 'var(--accent)' } : undefined}>
                <div className={`goal-bar ${g.team}`} />
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="goal-min">{formatMinute(g)}</span>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.player || '—'}</span>
                  </div>
                  <div className="row" style={{ gap: 5, marginTop: 3 }}>
                    <span className="faint small">{g.team === 'home' ? homeName : awayName}</span>
                    {g.type === 'penalty' && <span className="tag pen">RIG</span>}
                    {g.type === 'own' && <span className="tag own">AUT</span>}
                    <span className="tag">{first ? '1T' : '2T'}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 0 }}>
                  <button className="layer-btn" title="Su" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp size={13} />
                  </button>
                  <button className="layer-btn" title="Giù" onClick={() => move(i, 1)} disabled={i === match.goals.length - 1}>
                    <ArrowDown size={13} />
                  </button>
                  <button className="layer-btn" title="Card gol animata (video)" onClick={() => setCardGoal(g.id)}>
                    <Clapperboard size={13} />
                  </button>
                  <button className="layer-btn" title="Modifica" onClick={() => edit(g)}>
                    <Pencil size={13} />
                  </button>
                  <button className="layer-btn" title="Elimina" onClick={() => remove(g)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {!match.goals.length && <div className="faint small">Nessun gol registrato.</div>}
        </div>
      </div>

      <div className="section" style={{ gap: 8 }}>
        <div className="section-title">Opzioni</div>
        <div className="row">
          <span className="label" style={{ flex: 1 }}>Fine primo tempo al minuto</span>
          <input
            className="input sm"
            style={{ width: 70 }}
            type="number"
            min={1}
            max={90}
            value={match.halfEndMinute}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) onChange({ halfEndMinute: v });
            }}
          />
        </div>
        <div className="faint small">I gol nel recupero (es. 45+2) restano nel primo tempo.</div>
        <label className="check">
          <input type="checkbox" checked={match.penalties.enabled} onChange={(e) => onChange({ penalties: { ...match.penalties, enabled: e.target.checked } })} />
          Calci di rigore
        </label>
        {match.penalties.enabled && (
          <div className="row">
            <input
              className="input sm"
              type="number"
              min={0}
              value={match.penalties.home}
              onChange={(e) => onChange({ penalties: { ...match.penalties, home: Math.max(0, parseInt(e.target.value, 10) || 0) } })}
            />
            <span className="muted">-</span>
            <input
              className="input sm"
              type="number"
              min={0}
              value={match.penalties.away}
              onChange={(e) => onChange({ penalties: { ...match.penalties, away: Math.max(0, parseInt(e.target.value, 10) || 0) } })}
            />
          </div>
        )}
      </div>
      {cardGoal && <GoalCardModal match={match} goalId={cardGoal} onClose={() => setCardGoal(null)} />}
    </div>
  );
}
