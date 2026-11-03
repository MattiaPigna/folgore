import type { Goal, GoalType } from '../types';

export interface Score {
  home: number;
  away: number;
}

/** Chronological comparison: minute first, then added time. */
export function compareGoals(a: Pick<Goal, 'minute' | 'stoppage'>, b: Pick<Goal, 'minute' | 'stoppage'>): number {
  return a.minute - b.minute || (a.stoppage || 0) - (b.stoppage || 0);
}

export function sortGoals<T extends Pick<Goal, 'minute' | 'stoppage'>>(goals: T[]): T[] {
  return [...goals].sort(compareGoals);
}

/**
 * A goal belongs to the first half when its base minute is <= the half end minute.
 * Added time belongs to its base minute (45+2 is first half when the half ends at 45).
 */
export function isFirstHalf(goal: Pick<Goal, 'minute'>, halfEndMinute = 45): boolean {
  return goal.minute <= halfEndMinute;
}

/** `team` is always the credited team (own goals already point to the beneficiary). */
export function computeScore(goals: Goal[], opts: { halfOnly?: boolean; halfEndMinute?: number } = {}): Score {
  const halfEnd = opts.halfEndMinute ?? 45;
  const s: Score = { home: 0, away: 0 };
  for (const g of goals) {
    if (opts.halfOnly && !isFirstHalf(g, halfEnd)) continue;
    s[g.team] += 1;
  }
  return s;
}

/** Score right before and right after a given goal, in chronological order (storage order isn't authoritative). */
export function scoreAround(goals: Goal[], goalId: string): { prev: Score; next: Score } | null {
  const sorted = sortGoals(goals);
  const i = sorted.findIndex((g) => g.id === goalId);
  if (i < 0) return null;
  return { prev: computeScore(sorted.slice(0, i)), next: computeScore(sorted.slice(0, i + 1)) };
}

/** Given the team of the player who scored and the goal type, returns the credited team. */
export function creditedTeam(playerTeam: 'home' | 'away', type: GoalType): 'home' | 'away' {
  if (type !== 'own') return playerTeam;
  return playerTeam === 'home' ? 'away' : 'home';
}

/** Inverse of creditedTeam: team of the player who scored. */
export function playerTeam(goal: Pick<Goal, 'team' | 'type'>): 'home' | 'away' {
  return creditedTeam(goal.team, goal.type);
}

export function formatMinute(g: Pick<Goal, 'minute' | 'stoppage'>): string {
  return g.stoppage > 0 ? `${g.minute}+${g.stoppage}'` : `${g.minute}'`;
}

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  normal: 'Gol',
  penalty: 'Rigore',
  own: 'Autogol',
};

export const GOAL_TYPE_SUFFIX: Record<GoalType, string> = {
  normal: '',
  penalty: ' (Rig.)',
  own: ' (Aut.)',
};

export function formatGoal(g: Goal): string {
  const name = g.player.trim() || '—';
  return `${name} – ${formatMinute(g)}${GOAL_TYPE_SUFFIX[g.type]}`;
}

/** Parses "45+2", "67", "90 + 3'" into minute/stoppage. */
export function parseMinute(input: string): { minute: number; stoppage: number } | null {
  const m = input.replace(/['’\s]/g, '').match(/^(\d{1,3})(?:\+(\d{1,2}))?$/);
  if (!m) return null;
  return { minute: parseInt(m[1], 10), stoppage: m[2] ? parseInt(m[2], 10) : 0 };
}
