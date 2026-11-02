import type { Match } from '../../types';
import { TeamSelector } from '../TeamSelector/TeamSelector';

export function MatchInfoForm({ match, onChange, compact }: { match: Match; onChange: (patch: Partial<Match>) => void; compact?: boolean }) {
  const grid = compact ? 'section' : 'form-grid';
  return (
    <div className={grid}>
      <TeamSelector
        label="Squadra di casa"
        teamId={match.homeTeamId}
        fallbackName={match.homeName}
        fallbackLogo={match.homeLogoId}
        onChange={(t) => onChange({ homeTeamId: t.id, homeName: t.name, homeLogoId: t.logoId })}
      />
      <TeamSelector
        label="Squadra ospite"
        teamId={match.awayTeamId}
        fallbackName={match.awayName}
        fallbackLogo={match.awayLogoId}
        onChange={(t) => onChange({ awayTeamId: t.id, awayName: t.name, awayLogoId: t.logoId })}
      />
      {compact && (
        <div className="grid-2">
          <div className="field">
            <label>Nome casa (grafica)</label>
            <input className="input sm" value={match.homeName} onChange={(e) => onChange({ homeName: e.target.value })} />
          </div>
          <div className="field">
            <label>Nome ospite (grafica)</label>
            <input className="input sm" value={match.awayName} onChange={(e) => onChange({ awayName: e.target.value })} />
          </div>
        </div>
      )}
      <div className={compact ? 'grid-2' : 'grid-2'}>
        <div className="field">
          <label>Data</label>
          <input className={`input ${compact ? 'sm' : ''}`} type="date" value={match.date} onChange={(e) => onChange({ date: e.target.value })} />
        </div>
        <div className="field">
          <label>Orario</label>
          <input className={`input ${compact ? 'sm' : ''}`} type="time" value={match.time} onChange={(e) => onChange({ time: e.target.value })} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Giornata</label>
          <input className={`input ${compact ? 'sm' : ''}`} value={match.round} placeholder="1" onChange={(e) => onChange({ round: e.target.value })} />
        </div>
        <div className="field">
          <label>Competizione</label>
          <input className={`input ${compact ? 'sm' : ''}`} value={match.competition} placeholder="Es. Seconda Categoria" onChange={(e) => onChange({ competition: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Stadio</label>
        <input className={`input ${compact ? 'sm' : ''}`} value={match.stadium} placeholder='Es. Stadio Comunale "Tonino Arminio"' onChange={(e) => onChange({ stadium: e.target.value })} />
      </div>
      <div className="field">
        <label>Località</label>
        <input className={`input ${compact ? 'sm' : ''}`} value={match.city} placeholder="Es. Lacedonia" onChange={(e) => onChange({ city: e.target.value })} />
      </div>
    </div>
  );
}
