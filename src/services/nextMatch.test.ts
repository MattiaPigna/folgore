import { describe, expect, it } from 'vitest';
import html from './__fixtures__/tuttocampo-next.html?raw';
import { normalizeNextMatchUrl, parseItalianDate, parseNextMatchHtml } from './nextMatch';

describe('next match widget', () => {
  it('parses teams, date and time', () => {
    const m = parseNextMatchHtml(html, new Date(2026, 10, 2));
    expect(m).toMatchObject({ home: 'La Grav It', away: 'Folgore Lacedonia', date: '2026-11-07', time: '14:30', state: 'Partita da giocare' });
  });
  it('picks the closest year (season across new year)', () => {
    expect(parseItalianDate('Dom. 4 gennaio 15:00', new Date(2026, 11, 28))).toEqual({ date: '2027-01-04', time: '15:00' });
    expect(parseItalianDate('Sab. 27 dicembre', new Date(2027, 0, 3))).toEqual({ date: '2026-12-27', time: null });
  });
  it('accepts only next-match widget links', () => {
    expect(normalizeNextMatchUrl('<iframe src="https://tuttocampo.it/WidgetV2/ProssimaPartita/06969dc4-6e14-4d13-8215-ce46f0b0a974">')).toBe(
      'https://www.tuttocampo.it/WidgetV2/ProssimaPartita/06969dc4-6e14-4d13-8215-ce46f0b0a974',
    );
    expect(normalizeNextMatchUrl('https://www.tuttocampo.it/WidgetV2/Classifica/937e009d-fbb0-451a-a33c-e064facfc937')).toBeNull();
  });
});
