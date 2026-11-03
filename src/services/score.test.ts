import { describe, expect, it } from 'vitest';
import { computeScore, creditedTeam, formatGoal, parseMinute, playerTeam, scoreAround, sortGoals } from './score';
import type { Goal } from '../types';

let n = 0;
const g = (team: 'home' | 'away', minute: number, stoppage = 0, type: Goal['type'] = 'normal', player = 'X'): Goal => ({
  id: String(n++), team, player, minute, stoppage, type,
});

describe('score', () => {
  it('spec example: Folgore Lacedonia – Savignano Calcio', () => {
    const goals = [g('home', 12, 0, 'normal', 'Rossi'), g('away', 35, 0, 'normal', 'Bianchi'), g('home', 67, 0, 'normal', 'Verdi')];
    expect(computeScore(goals, { halfOnly: true })).toEqual({ home: 1, away: 1 });
    expect(computeScore(goals)).toEqual({ home: 2, away: 1 });
  });

  it('first-half stoppage counts at half time, 90+3 only at full time', () => {
    const goals = [g('home', 45, 2), g('away', 90, 3), g('away', 46)];
    expect(computeScore(goals, { halfOnly: true })).toEqual({ home: 1, away: 0 });
    expect(computeScore(goals)).toEqual({ home: 1, away: 2 });
  });

  it('custom half end minute', () => {
    const goals = [g('home', 40), g('away', 44)];
    expect(computeScore(goals, { halfOnly: true, halfEndMinute: 40 })).toEqual({ home: 1, away: 0 });
  });

  it('own goal credits the opponent', () => {
    expect(creditedTeam('home', 'own')).toBe('away');
    expect(creditedTeam('away', 'own')).toBe('home');
    expect(creditedTeam('home', 'penalty')).toBe('home');
    const own = g(creditedTeam('home', 'own'), 10, 0, 'own');
    expect(computeScore([own])).toEqual({ home: 0, away: 1 });
    expect(playerTeam(own)).toBe('home');
  });

  it('sorts chronologically including stoppage', () => {
    const sorted = sortGoals([g('home', 90, 1), g('home', 45, 2), g('home', 46), g('home', 45)]);
    expect(sorted.map((x) => `${x.minute}+${x.stoppage}`)).toEqual(['45+0', '45+2', '46+0', '90+1']);
  });

  it('formats and parses minutes', () => {
    expect(formatGoal(g('home', 67, 0, 'penalty', 'Neri'))).toBe("Neri – 67' (Rig.)");
    expect(formatGoal(g('home', 45, 2, 'normal', 'Verdi'))).toBe("Verdi – 45+2'");
    expect(parseMinute("45+2'")).toEqual({ minute: 45, stoppage: 2 });
    expect(parseMinute('67')).toEqual({ minute: 67, stoppage: 0 });
    expect(parseMinute('abc')).toBeNull();
  });
});

describe('scoreAround', () => {
  // Goals stored out of order: must use chronological order regardless.
  const goals = [g('home', 80, 0, 'normal', 'c'), g('away', 12, 0, 'normal', 'a'), g('home', 45, 2, 'own', 'own'), g('home', 45, 1, 'normal', 'b')];
  const idOf = (player: string) => goals.find((x) => x.player === player)!.id;
  it('shows the score right after that goal, not the final score', () => {
    expect(scoreAround(goals, idOf('a'))).toEqual({ prev: { home: 0, away: 0 }, next: { home: 0, away: 1 } });
    expect(scoreAround(goals, idOf('b'))).toEqual({ prev: { home: 0, away: 1 }, next: { home: 1, away: 1 } });
    expect(scoreAround(goals, idOf('own'))).toEqual({ prev: { home: 1, away: 1 }, next: { home: 2, away: 1 } });
    expect(scoreAround(goals, idOf('c'))).toEqual({ prev: { home: 2, away: 1 }, next: { home: 3, away: 1 } });
  });
  it('returns null for an unknown goal', () => {
    expect(scoreAround(goals, 'x')).toBeNull();
  });
});
