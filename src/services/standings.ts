import type { StandingRow, Team } from '../types';

export class StandingsImportError extends Error {}

type Field = Exclude<keyof StandingRow, 'logoId'>;

const NUMERIC: Field[] = ['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts'];

/** Column header aliases (lower-case, letters/digits/# only). "p" = perse, "n" = pareggi, as on Italian tables. */
const ALIASES: Record<Field, string[]> = {
  pos: ['pos', 'posizione', 'position', 'rank', '#', 'pos#', 'cl', 'clas'],
  team: ['squadra', 'team', 'club', 'societa', 'societ', 'nome'],
  pts: ['pt', 'pti', 'punti', 'pts', 'points'],
  played: ['g', 'pg', 'gio', 'giocate', 'partite', 'gp', 'played', 'mp'],
  won: ['v', 'vinte', 'vittorie', 'w', 'won'],
  drawn: ['n', 'pareggi', 'pareggiate', 'pa', 'x', 'd', 'drawn'],
  lost: ['p', 'perse', 'sconfitte', 's', 'l', 'lost'],
  gf: ['gf', 'golfatti', 'fatti', 'rf', 'retifatte', 'f'],
  ga: ['gs', 'golsubiti', 'subiti', 'rs', 'retisubite', 'ga'],
  gd: ['dr', 'diff', 'differenzareti', 'gd', 'dif', 'differenza'],
};

function headerKey(h: string): Field | null {
  const k = h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, '');
  for (const [field, list] of Object.entries(ALIASES) as [Field, string[]][]) {
    if (list.includes(k)) return field;
  }
  return null;
}

/** Splits CSV/TSV text, honouring quotes. Delimiter is auto-detected (; , or tab). */
export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const delim = ['\t', ';', ','].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === delim && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/^\+/, '').replace(/[°.]$/, '');
  if (s === '' || s === '-' || s === '–') return null;
  if (!/^-?\d+$/.test(s)) throw new StandingsImportError(`Valore non numerico: "${v}"`);
  return parseInt(s, 10);
}

/**
 * Normalizes raw records (from CSV or an API) into standing rows.
 * Missing values stay null: nothing is invented. Only derived values are computed
 * (goal difference from GF/GS, position from row order).
 */
export function normalizeRecords(records: Record<string, unknown>[]): StandingRow[] {
  const rows: StandingRow[] = [];
  const errors: string[] = [];
  records.forEach((rec, i) => {
    const mapped: Partial<Record<Field, unknown>> = {};
    for (const [k, v] of Object.entries(rec)) {
      const f = headerKey(k);
      if (f && mapped[f] === undefined) mapped[f] = v;
    }
    const team = String(mapped.team ?? '').trim();
    if (!team) {
      errors.push(`Riga ${i + 1}: nome squadra mancante.`);
      return;
    }
    try {
      const row: StandingRow = {
        pos: toInt(mapped.pos) ?? 0,
        team,
        played: null,
        won: null,
        drawn: null,
        lost: null,
        gf: null,
        ga: null,
        gd: null,
        pts: null,
        logoId: null,
      };
      for (const f of NUMERIC) (row as any)[f] = toInt(mapped[f]);
      if (row.gd === null && row.gf !== null && row.ga !== null) row.gd = row.gf - row.ga;
      rows.push(row);
    } catch (e) {
      errors.push(`Riga ${i + 1} (${team}): ${(e as Error).message}`);
    }
  });
  if (errors.length) throw new StandingsImportError(errors.slice(0, 6).join('\n') + (errors.length > 6 ? `\n…e altri ${errors.length - 6} errori.` : ''));
  if (!rows.length) throw new StandingsImportError('Nessuna squadra trovata nei dati.');
  rows.forEach((r, i) => {
    if (!r.pos) r.pos = i + 1;
  });
  return rows.sort((a, b) => a.pos - b.pos);
}

/** Parses CSV/TSV text with a header row into standing rows. */
export function parseStandingsCsv(text: string): StandingRow[] {
  const table = parseDelimited(text);
  if (table.length < 2) throw new StandingsImportError('Il file deve contenere una riga di intestazione e almeno una squadra.');
  const header = table[0];
  const known = header.map(headerKey);
  if (!known.includes('team')) {
    throw new StandingsImportError(
      `Colonna "Squadra" non trovata nell'intestazione (${header.join(', ')}). Usa il modello CSV: Pos;Squadra;PT;G;V;N;P;GF;GS;DR`,
    );
  }
  if (!known.includes('pts')) throw new StandingsImportError('Colonna "PT" (punti) non trovata nell\'intestazione.');
  const records = table.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
  return normalizeRecords(records);
}

export const CSV_TEMPLATE = 'Pos;Squadra;PT;G;V;N;P;GF;GS;DR\n1;Nome squadra;0;0;0;0;0;0;0;0\n';

export function standingsToCsv(rows: StandingRow[]): string {
  const v = (n: number | null) => (n === null ? '' : String(n));
  return (
    'Pos;Squadra;PT;G;V;N;P;GF;GS;DR\n' +
    rows.map((r) => [r.pos, `"${r.team.replace(/"/g, '""')}"`, v(r.pts), v(r.played), v(r.won), v(r.drawn), v(r.lost), v(r.gf), v(r.ga), v(r.gd)].join(';')).join('\n') +
    '\n'
  );
}

/* ---------- team name matching (standings name -> library team/logo) ---------- */

const NOISE = new Set(['asd', 'ssd', 'as', 'ac', 'us', 'fc', 'sc', 'ss', 'pol', 'polisportiva', 'calcio', 'football', 'club', 'sporting', 'associazione', 'sportiva', 'dilettantistica', 'societa', 'a', 's', 'd', 'srl', 'scarl', 'gs', 'cs', 'usd', 'asc']);

const ARTICLES = new Set(['la', 'il', 'lo', 'le', 'i', 'gli', 'l']);

export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t) && !/^(19|20)\d{2}$/.test(t));
}

export function sameTeam(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const sa = new Set(ta);
  const common = tb.filter((t) => sa.has(t)).length;
  // All tokens of the shorter name appear in the longer one ("Folgore" ~ "A.S.D. Folgore Lacedonia").
  if (common >= Math.min(ta.length, tb.length)) return true;
  // Same letters, different spacing ("La Grav It" ~ "Gravit"), ignoring a leading article.
  const glue = (t: string[]) => t.filter((x, i) => !(i === 0 && t.length > 1 && ARTICLES.has(x))).join('');
  const ga = glue(ta);
  return ga.length >= 5 && ga === glue(tb);
}

/** Fills logoId for each row from the team library (keeps manual choices). */
export function matchLogos(rows: StandingRow[], teams: Team[], keepExisting = true): StandingRow[] {
  return rows.map((r) => {
    if (keepExisting && r.logoId) return r;
    const t = teams.find((x) => x.logoId && sameTeam(x.name, r.team));
    return { ...r, logoId: t?.logoId ?? null };
  });
}
