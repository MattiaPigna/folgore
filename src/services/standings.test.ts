import { describe, expect, it } from 'vitest';
import { StandingsImportError, matchLogos, parseStandingsCsv, sameTeam } from './standings';
import widgetHtml from './__fixtures__/tuttocampo-widget.html?raw';
import { StandingsUnavailableError, DEFAULT_LEAGUE, fetchStandings, normalizeWidgetUrl, parseWidgetHtml } from './tuttocampo';
import { resolveLeagueText, resolveVisibility } from './bindings';
import type { Settings } from '../types';

describe('standings CSV', () => {
  it('parses the template format (semicolon, header aliases)', () => {
    const rows = parseStandingsCsv('Pos;Squadra;PT;G;V;N;P;GF;GS;DR\n2;Savignano Calcio;18;8;6;0;2;20;9;+11\n1;Folgore Lacedonia;20;8;6;2;0;22;5;17\n');
    expect(rows.map((r) => r.team)).toEqual(['Folgore Lacedonia', 'Savignano Calcio']);
    expect(rows[1]).toMatchObject({ pos: 2, pts: 18, played: 8, won: 6, drawn: 0, lost: 2, gf: 20, ga: 9, gd: 11 });
  });

  it('accepts comma/tab, alternative headers, quotes', () => {
    const rows = parseStandingsCsv('Posizione,Squadra,Punti,Giocate,Vinte,Pareggi,Perse,Gol fatti,Gol subiti\n1,"Polisportiva, Aquilonia",10,4,3,1,0,8,2');
    expect(rows[0]).toMatchObject({ team: 'Polisportiva, Aquilonia', pts: 10, gd: 6 });
    const tsv = parseStandingsCsv('Squadra\tPT\nASD Panni\t7\nSpartak Grotta\t4');
    expect(tsv.map((r) => [r.pos, r.team, r.pts])).toEqual([
      [1, 'ASD Panni', 7],
      [2, 'Spartak Grotta', 4],
    ]);
  });

  it('never invents missing values', () => {
    const [r] = parseStandingsCsv('Squadra;PT;GF\nASD Gravit;5;7');
    expect(r).toMatchObject({ pts: 5, gf: 7, ga: null, gd: null, played: null, won: null });
  });

  it('rejects files without team/points columns or with bad numbers', () => {
    expect(() => parseStandingsCsv('A;B\n1;2')).toThrow(StandingsImportError);
    expect(() => parseStandingsCsv('Squadra;G\nX;3')).toThrow(/PT/);
    expect(() => parseStandingsCsv('Squadra;PT\nX;dieci')).toThrow(/non numerico/);
  });
});

describe('team matching', () => {
  it('matches names ignoring prefixes, case, accents and years', () => {
    expect(sameTeam('A.S.D. Folgore Lacedonia', 'Folgore Lacedonia')).toBe(true);
    expect(sameTeam('Folgore', 'Folgore Lacedonia')).toBe(true);
    expect(sameTeam('Real Lacedonia', 'Folgore Lacedonia')).toBe(false);
    expect(sameTeam("S. Angelo all'Esca", 'S. ANGELO ALL ESCA')).toBe(true);
  });

  it('assigns library logos', () => {
    const rows = parseStandingsCsv('Squadra;PT\nASD Savignano Calcio 2024;3\nSconosciuta;1');
    const out = matchLogos(rows, [{ id: 't', name: 'Savignano Calcio', logoId: 'L1', createdAt: 0 }]);
    expect(out.map((r) => r.logoId)).toEqual(['L1', null]);
  });
});

describe('tuttocampo service', () => {
  it('is preconfigured on Terza Categoria Girone A Avellino', () => {
    expect(DEFAULT_LEAGUE.url).toBe('https://www.tuttocampo.it/Campania/TerzaCategoria/GironeAAvellino/Classifica');
  });
  it('without API nor widget it reports unavailability', async () => {
    await expect(fetchStandings({ ...DEFAULT_LEAGUE, widgetUrl: '' })).rejects.toBeInstanceOf(StandingsUnavailableError);
  });
  it('accepts only Tuttocampo standings widget links (also from the iframe code)', () => {
    const id = '937e009d-fbb0-451a-a33c-e064facfc937';
    expect(normalizeWidgetUrl(`<iframe src="https://tuttocampo.it/WidgetV2/Classifica/${id}" width="100%"></iframe>`)).toBe(`https://www.tuttocampo.it/WidgetV2/Classifica/${id}`);
    expect(normalizeWidgetUrl('https://example.com/WidgetV2/Classifica/' + id)).toBeNull();
    expect(normalizeWidgetUrl(DEFAULT_LEAGUE.url)).toBeNull();
  });
  it('parses the standings widget', () => {
    const rows = parseWidgetHtml(widgetHtml);
    expect(rows.length).toBe(12);
    expect(rows[0]).toMatchObject({ pos: 1, team: 'Fontanarosa Next Gen', pts: 3, played: 1, won: 1, drawn: 0, lost: 0, gf: 8, ga: 0, gd: 8 });
    expect(rows[1].team).toBe("S. Angelo All'Esca");
    expect(rows.find((r) => r.team === 'Folgore Lacedonia')).toMatchObject({ pos: 5, pts: 3, gf: 3, ga: 1, gd: 2 });
  });
});

describe('league bindings', () => {
  const settings = {
    uppercaseInfo: true,
    league: { ...DEFAULT_LEAGUE, favoriteTeam: 'Folgore Lacedonia', updatedAt: new Date(2026, 10, 2).getTime(), rows: parseStandingsCsv('Squadra;PT;DR\nFolgore Lacedonia;20;17\nASD Panni;9;') },
  } as unknown as Settings;
  it('resolves cells, highlight and update date', () => {
    expect(resolveLeagueText('st:0:team', settings)).toBe('FOLGORE LACEDONIA');
    expect(resolveLeagueText('st:0:gd', settings)).toBe('+17');
    expect(resolveLeagueText('st:1:gd', settings)).toBe('–');
    expect(resolveLeagueText('st:5:team', settings)).toBe('');
    expect(resolveVisibility('stHi:0', settings)).toBe(true);
    expect(resolveVisibility('stHi:1', settings)).toBe(false);
    expect(resolveVisibility('stRow:5', settings)).toBe(false);
    expect(resolveLeagueText('standingsUpdated', settings)).toBe('Aggiornata al 2 novembre 2026');
  });
});
