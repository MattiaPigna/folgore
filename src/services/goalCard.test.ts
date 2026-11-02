import { describe, expect, it } from 'vitest';
import { scoreAround } from './goalCard';
import type { Goal, Match } from '../types';

const g = (id: string, team: 'home' | 'away', minute: number, stoppage = 0, type: Goal['type'] = 'normal'): Goal => ({ id, team, player: id, minute, stoppage, type });

describe('goal card score', () => {
  // Goals stored out of order: the card must use chronological order.
  const match = { goals: [g('c', 'home', 80), g('a', 'away', 12), g('own', 'home', 45, 2, 'own'), g('b', 'home', 45, 1)] } as Match;
  it('shows the score right after that goal, not the final score', () => {
    expect(scoreAround(match, 'a')).toEqual({ prev: { home: 0, away: 0 }, next: { home: 0, away: 1 } });
    expect(scoreAround(match, 'b')).toEqual({ prev: { home: 0, away: 1 }, next: { home: 1, away: 1 } });
    expect(scoreAround(match, 'own')).toEqual({ prev: { home: 1, away: 1 }, next: { home: 2, away: 1 } });
    expect(scoreAround(match, 'c')).toEqual({ prev: { home: 2, away: 1 }, next: { home: 3, away: 1 } });
  });
  it('returns null for an unknown goal', () => {
    expect(scoreAround(match, 'x')).toBeNull();
  });
});
