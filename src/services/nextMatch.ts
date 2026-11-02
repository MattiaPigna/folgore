import type { League } from '../types';
import { DEFAULT_LEAGUE, StandingsUnavailableError } from './tuttocampo';

/**
 * Club's Tuttocampo "Prossima partita" widget (official, free for clubs, CORS open).
 * Read once when the user opens "Nuova partita" or presses "Aggiorna"; used only to suggest data.
 */

export const DEFAULT_NEXT_MATCH_WIDGET = 'https://www.tuttocampo.it/WidgetV2/ProssimaPartita/06969dc4-6e14-4d13-8215-ce46f0b0a974';

const NEXT_RE = /https:\/\/(?:www\.)?tuttocampo\.it\/WidgetV2\/ProssimaPartita\/[0-9a-f-]{36}/i;

export interface NextMatchInfo {
  home: string;
  away: string;
  /** yyyy-mm-dd, null when the widget shows no date. */
  date: string | null;
  /** hh:mm, null when not shown. */
  time: string | null;
  /** Text shown by the widget, e.g. "Partita da giocare". */
  state: string;
  /** Original date text, e.g. "Sab. 7 novembre 14:30". */
  dateLabel: string;
}

export function normalizeNextMatchUrl(input: string): string | null {
  const m = input.match(NEXT_RE);
  return m ? m[0].replace(/^https:\/\/tuttocampo/i, 'https://www.tuttocampo') : null;
}

/** Widget URL in use (undefined = default, '' = disabled). */
export function nextMatchUrlOf(league: League | undefined): string {
  const v = (league ?? DEFAULT_LEAGUE).nextMatchWidgetUrl;
  return v === undefined ? DEFAULT_NEXT_MATCH_WIDGET : v;
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function decode(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "Sab. 7 novembre 14:30" -> date + time. The widget has no year: the closest date to `now`
 * (a match is at most a few weeks away or just played) is chosen.
 */
export function parseItalianDate(label: string, now = new Date()): { date: string | null; time: string | null } {
  const t = label.match(/(\d{1,2})[:.](\d{2})/);
  const time = t ? `${pad(Number(t[1]))}:${t[2]}` : null;
  const d = label.toLowerCase().match(/(\d{1,2})\s+([a-zà]+)(?:\s+(\d{4}))?/);
  const month = d ? MONTHS.findIndex((m) => d[2].startsWith(m.slice(0, 3))) : -1;
  if (!d || month < 0) {
    const n = label.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!n) return { date: null, time };
    const y = n[3] ? (n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])) : closestYear(Number(n[2]) - 1, Number(n[1]), now);
    return { date: `${y}-${pad(Number(n[2]))}-${pad(Number(n[1]))}`, time };
  }
  const day = Number(d[1]);
  const year = d[3] ? Number(d[3]) : closestYear(month, day, now);
  return { date: `${year}-${pad(month + 1)}-${pad(day)}`, time };
}

function closestYear(month: number, day: number, now: Date): number {
  const y = now.getFullYear();
  return [y - 1, y, y + 1].reduce((best, c) =>
    Math.abs(new Date(c, month, day).getTime() - now.getTime()) < Math.abs(new Date(best, month, day).getTime() - now.getTime()) ? c : best,
  );
}

export function parseNextMatchHtml(html: string, now = new Date()): NextMatchInfo {
  const team = (side: 'home' | 'away') => {
    const block = html.match(new RegExp(`class="${side}-team[^"]*"[^>]*>([\\s\\S]*?)</a>`, 'i'))?.[1] ?? '';
    return decode(block.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '') || decode(block.match(/alt="logo ([^"]*)"/i)?.[1] ?? '');
  };
  const home = team('home');
  const away = team('away');
  if (!home || !away) throw new StandingsUnavailableError('Il widget non contiene una partita riconoscibile. Controlla che il link sia di un widget «Prossima partita».');
  const dateLabel = decode(html.match(/<span class="date"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '');
  const state = decode(html.match(/<span class="match-state"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '');
  return { home, away, state, dateLabel, ...parseItalianDate(dateLabel, now) };
}

export async function fetchNextMatch(url: string): Promise<NextMatchInfo> {
  const clean = normalizeNextMatchUrl(url);
  if (!clean) throw new StandingsUnavailableError('Link non valido: deve essere un widget «Prossima partita» di tuttocampo.it (WidgetV2/ProssimaPartita/…).');
  let res: Response;
  try {
    res = await fetch(clean, { headers: { Accept: 'text/html' }, cache: 'no-store' });
  } catch (e) {
    throw new StandingsUnavailableError(`Impossibile contattare il widget Tuttocampo (${(e as Error).message}).`);
  }
  if (!res.ok) throw new StandingsUnavailableError(`Il widget Tuttocampo ha risposto con errore ${res.status}.`);
  return parseNextMatchHtml(await res.text());
}
