import { computeScore, formatGoal, formatMinute, isFirstHalf, scoreAround } from './score';
import { sameTeam } from './standings';
import { activeSponsors, mainSponsor } from './sponsorUtils';
import type { GraphicKind, Match, Settings } from '../types';

export type TextBinding =
  | 'matchdayLabel'
  | 'competition'
  | 'stadium'
  | 'city'
  | 'date'
  | 'time'
  | 'dateTime'
  | 'dateLong'
  | 'dateStacked'
  | 'roundCompetition'
  | 'timeOnly'
  | 'homeName'
  | 'awayName'
  | 'score'
  | 'homeScore'
  | 'awayScore'
  | 'penalties'
  | 'scorersHome'
  | 'scorersAway'
  | 'scorersAll'
  | 'mvp'
  | 'stats'
  | 'extra';

export type ImageBinding = 'homeLogo' | 'awayLogo' | 'photo' | 'spMain' | 'clubLogo';

export type Binding = TextBinding | ImageBinding;

export const TEXT_BINDING_LABELS: Record<TextBinding, string> = {
  matchdayLabel: 'Giornata (MATCHDAY 1°)',
  competition: 'Competizione',
  stadium: 'Stadio',
  city: 'Località',
  date: 'Data',
  time: 'Orario',
  dateTime: 'Data e orario',
  dateLong: 'Data estesa (Domenica 1 Novembre)',
  dateStacked: 'Data su due righe',
  roundCompetition: 'Giornata + competizione',
  timeOnly: 'Orario senza "ORE"',
  homeName: 'Nome squadra casa',
  awayName: 'Nome squadra ospite',
  score: 'Risultato',
  homeScore: 'Gol casa',
  awayScore: 'Gol ospite',
  penalties: 'Calci di rigore',
  scorersHome: 'Marcatori casa',
  scorersAway: 'Marcatori ospite',
  scorersAll: 'Tutti i marcatori',
  mvp: 'Migliore in campo',
  stats: 'Statistiche',
  extra: 'Informazioni aggiuntive',
};

export const IMAGE_BINDING_LABELS: Record<ImageBinding, string> = {
  homeLogo: 'Logo squadra casa',
  awayLogo: 'Logo squadra ospite',
  photo: 'Foto della partita',
  spMain: 'Main sponsor',
  clubLogo: 'Logo squadra evidenziata (classifica)',
};

export function isImageBinding(b: string | undefined): b is ImageBinding {
  return b === 'homeLogo' || b === 'awayLogo' || b === 'photo' || b === 'spMain' || b === 'clubLogo' || !!b?.startsWith('stLogo:') || !!b?.startsWith('sp:');
}

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
const MONTHS = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];

const WEEKDAYS_LONG = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS_TITLE = MONTHS.map((m) => m.charAt(0) + m.slice(1).toLowerCase());

/** "2026-11-01" -> "Domenica 1 Novembre" */
export function formatLongDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_TITLE[d.getMonth()]}`;
}

/** "2026-10-31" -> "SAB 31 OTTOBRE 2026" */
export function formatItalianDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Score is half-time for HALF TIME graphics, final otherwise. */
export function scoreFor(match: Match, kind: GraphicKind) {
  return computeScore(match.goals, { halfOnly: kind === 'halftime', halfEndMinute: match.halfEndMinute });
}

export function goalsFor(match: Match, kind: GraphicKind) {
  // Stored order is authoritative (the goal manager keeps it chronological by default).
  const goals = match.goals;
  return kind === 'halftime' ? goals.filter((g) => isFirstHalf(g, match.halfEndMinute)) : goals;
}

export function resolveText(binding: TextBinding, match: Match, kind: GraphicKind, settings: Settings): string {
  const up = (s: string) => (settings.uppercaseInfo ? s.toUpperCase() : s);
  const score = scoreFor(match, kind);
  const goals = goalsFor(match, kind);
  switch (binding) {
    case 'matchdayLabel':
      return `${settings.matchdayPrefix || 'MATCHDAY'} ${match.round || ''}${match.round ? '°' : ''}`.trim();
    case 'competition':
      return up(match.competition);
    case 'stadium':
      return up(match.stadium);
    case 'city':
      return up(match.city);
    case 'date':
      return match.date ? formatItalianDate(match.date) : '';
    case 'time':
      return match.time ? `ORE ${match.time}` : '';
    case 'dateTime':
      return [match.date ? formatItalianDate(match.date) : '', match.time ? `ORE ${match.time}` : ''].filter(Boolean).join(' · ');
    case 'dateLong':
      return match.date ? (settings.uppercaseInfo ? formatLongDate(match.date).toUpperCase() : formatLongDate(match.date)) : '';
    case 'dateStacked': {
      if (!match.date) return '';
      const long = formatLongDate(match.date);
      const i = long.lastIndexOf(' ');
      const stacked = i > 0 ? `${long.slice(0, i)}\n${long.slice(i + 1)}` : long;
      return settings.uppercaseInfo ? stacked.toUpperCase() : stacked;
    }
    case 'roundCompetition':
      return up([match.round ? `${match.round}ª giornata` : '', match.competition].filter(Boolean).join(' '));
    case 'timeOnly':
      return match.time;
    case 'homeName':
      return up(match.homeName);
    case 'awayName':
      return up(match.awayName);
    case 'score':
      return `${score.home} - ${score.away}`;
    case 'homeScore':
      return String(score.home);
    case 'awayScore':
      return String(score.away);
    case 'penalties':
      return match.penalties.enabled && kind !== 'halftime' && kind !== 'matchday'
        ? `d.c.r. ${match.penalties.home} - ${match.penalties.away}`
        : '';
    case 'scorersHome':
      return goals.filter((g) => g.team === 'home').map(formatGoal).join('\n');
    case 'scorersAway':
      return goals.filter((g) => g.team === 'away').map(formatGoal).join('\n');
    case 'scorersAll':
      return goals.map(formatGoal).join('\n');
    case 'mvp':
      return up(match.mvp);
    case 'stats':
      return match.stats
        .filter((s) => s.label.trim())
        .map((s) => `${s.home}   ${up(s.label)}   ${s.away}`)
        .join('\n');
    case 'extra':
      return match.extraInfo;
  }
}

export function imageAssetFor(binding: ImageBinding, match: Match, settings?: Settings): string | null {
  if (binding.startsWith('stLogo:')) return settings?.league?.rows[Number(binding.slice(7))]?.logoId ?? null;
  if (binding === 'spMain') return settings ? mainSponsor(settings)?.assetId ?? null : null;
  if (binding === 'clubLogo') {
    const league = settings?.league;
    return league?.rows.find((r) => league.favoriteTeam && sameTeam(r.team, league.favoriteTeam))?.logoId ?? null;
  }
  if (binding.startsWith('sp:')) return settings ? activeSponsors(settings)[Number(binding.slice(3))]?.assetId ?? null : null;
  if (binding === 'homeLogo') return match.homeLogoId;
  if (binding === 'awayLogo') return match.awayLogoId;
  return match.photoId;
}

/* ---------- league standings (CLASSIFICA) ---------- */

export type StandingField = 'pos' | 'team' | 'pts' | 'played' | 'won' | 'drawn' | 'lost' | 'gf' | 'ga' | 'gd';

/** Text bindings fed by the league: "leagueName", "standingsUpdated", "st:<row>:<field>". */
export function isLeagueBinding(b: string): boolean {
  return b === 'leagueName' || b === 'standingsUpdated' || b.startsWith('st:');
}

/** Visibility bindings: "stRow:<row>" (row exists), "stHi:<row>" (row is the highlighted team). */
export function isVisibilityBinding(b: string): boolean {
  return b.startsWith('stRow:') || b.startsWith('stHi:') || b.startsWith('spSlot:');
}

const MONTHS_LOWER = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function formatUpdated(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_LOWER[d.getMonth()]} ${d.getFullYear()}`;
}

export function resolveLeagueText(binding: string, settings: Settings): string {
  const league = settings.league;
  const up = (s: string) => (settings.uppercaseInfo ? s.toUpperCase() : s);
  if (binding === 'leagueName') return league ? up(league.name) : '';
  if (binding === 'standingsUpdated') {
    if (!league?.updatedAt) return 'Classifica non ancora aggiornata';
    return `Aggiornata al ${formatUpdated(league.updatedAt)}`;
  }
  const [, idx, field] = binding.split(':');
  const row = league?.rows[Number(idx)];
  if (!row) return '';
  if (field === 'team') return up(row.team);
  const v = row[field as Exclude<StandingField, 'team'>] as number | null;
  if (v === null || v === undefined) return '–';
  if (field === 'gd' && v > 0) return `+${v}`;
  return String(v);
}

export function resolveVisibility(binding: string, settings: Settings): boolean {
  if (binding.startsWith('spSlot:')) return !!activeSponsors(settings)[Number(binding.slice(7))];
  const league = settings.league;
  const idx = Number(binding.split(':')[1]);
  const row = league?.rows[idx];
  if (!row) return false;
  if (binding.startsWith('stHi:')) return !!league?.favoriteTeam && sameTeam(row.team, league.favoriteTeam);
  return true;
}

/* ---------- goal video (per-goal data, not tied to a GraphicKind) ---------- */

export type GoalBinding = 'goal:scorer' | 'goal:minute' | 'goal:teamName' | 'goal:scoreAfter' | 'goal:topLabel';

export const GOAL_BINDING_LABELS: Record<GoalBinding, string> = {
  'goal:scorer': 'Marcatore',
  'goal:minute': 'Minuto e tipo gol',
  'goal:teamName': 'Squadra che segna',
  'goal:scoreAfter': 'Risultato dopo il gol',
  'goal:topLabel': 'Giornata e competizione',
};

export function isGoalBinding(b: string | undefined): b is GoalBinding {
  return !!b && b.startsWith('goal:');
}

/** Resolves a `goal:*` binding for a specific goal. Empty string if the goal no longer exists. */
export function resolveGoalText(binding: GoalBinding, match: Match, goalId: string, settings: Settings): string {
  const goal = match.goals.find((g) => g.id === goalId);
  if (!goal) return '';
  const up = (s: string) => (settings.uppercaseInfo ? s.toUpperCase() : s);
  const teamName = goal.team === 'home' ? match.homeName : match.awayName;
  switch (binding) {
    case 'goal:scorer':
      return goal.player.trim() || teamName;
    case 'goal:minute':
      return [formatMinute(goal), goal.type === 'penalty' ? 'SU RIGORE' : goal.type === 'own' ? 'AUTOGOL' : ''].filter(Boolean).join('  ·  ');
    case 'goal:teamName':
      return up(teamName);
    case 'goal:scoreAfter': {
      const around = scoreAround(match.goals, goalId);
      return around ? `${around.next.home} - ${around.next.away}` : '0 - 0';
    }
    case 'goal:topLabel':
      return up([match.competition.trim(), match.round.trim() ? `${match.round.trim()}ª GIORNATA` : ''].filter(Boolean).join(' · '));
  }
}
