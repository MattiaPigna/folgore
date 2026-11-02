import type { League, StandingRow } from '../types';
import { StandingsImportError, normalizeRecords } from './standings';

/**
 * Tuttocampo integration.
 *
 * What Tuttocampo offers (checked on tuttocampo.it, 2 Nov 2026):
 * - Official data API: paid monthly service, available by agreement with the editorial team
 *   ("L'utilizzo delle API non è gratuito… CONTATTACI"). No public documentation or key.
 * - Free widgets ("Widget & API" page): official channel to use their data on a club's own
 *   site or device, free for sports clubs. The widget is configured by the club (logged in) and
 *   served with CORS open (Access-Control-Allow-Origin: *).
 * - Site terms of use forbid scraping the regular pages.
 *
 * So the app never reads the regular league page. AGGIORNA CLASSIFICA uses, in order: the official
 * API (if configured), the club's own standings widget (one request, only on click); otherwise
 * data is imported by the user (CSV / manual).
 */

export const TUTTOCAMPO_WIDGET_INFO = 'https://www.tuttocampo.it/WidgetApi';

export const DEFAULT_LEAGUE: League = {
  name: 'Terza Categoria · Girone A Avellino',
  region: 'Campania',
  province: 'Avellino',
  category: 'Terza Categoria',
  group: 'A',
  source: 'tuttocampo',
  url: 'https://www.tuttocampo.it/Campania/TerzaCategoria/GironeAAvellino/Classifica',
  rows: [],
  updatedAt: null,
  updateMethod: null,
  favoriteTeam: 'Folgore Lacedonia',
  widgetUrl: 'https://www.tuttocampo.it/WidgetV2/Classifica/937e009d-fbb0-451a-a33c-e064facfc937',
};

const WIDGET_RE = /https:\/\/(?:www\.)?tuttocampo\.it\/WidgetV2\/Classifica\/[0-9a-f-]{36}/i;

/** Normalizes a widget link or the pasted embed code (<iframe src="…">) to the widget URL; null if not valid. */
export function normalizeWidgetUrl(input: string): string | null {
  const m = input.match(WIDGET_RE);
  return m ? m[0].replace(/^https:\/\/tuttocampo/i, 'https://www.tuttocampo') : null;
}

/** Widget URL in use (leagues saved before the widget existed fall back to the default). */
export function widgetUrlOf(league: League): string {
  return league.widgetUrl === undefined ? DEFAULT_LEAGUE.widgetUrl ?? '' : league.widgetUrl;
}

export class StandingsUnavailableError extends Error {}

export const UNAVAILABLE_MESSAGE =
  'Recupero automatico non disponibile: non è configurato né il widget classifica Tuttocampo della società né l’API ufficiale. Incolla il link del widget nella sezione «Fonte automatica» qui sotto, oppure importa la classifica tramite CSV (o inseriscila a mano) partendo dalla pagina ufficiale.';

export function isApiConfigured(league: League): boolean {
  return !!league.api?.endpoint?.trim();
}

/** Extracts the standings array from a generic JSON payload. */
function pickArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    for (const k of ['classifica', 'standings', 'rows', 'data', 'items', 'result', 'results']) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === 'object') {
        const inner = pickArray(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Widget cell class -> row field. Values the widget does not show stay null (never invented). */
const WIDGET_COLS: [string, keyof StandingRow][] = [
  ['pt', 'pts'],
  ['pg', 'played'],
  ['vt', 'won'],
  ['pa', 'drawn'],
  ['sc', 'lost'],
  ['gf', 'gf'],
  ['gs', 'ga'],
  ['dr', 'gd'],
];

/** Parses the HTML of a Tuttocampo "Classifica" widget (table.table_ranking). */
export function parseWidgetHtml(html: string): StandingRow[] {
  const table = html.match(/<table[^>]*table_ranking[\s\S]*?<\/table>/i)?.[0];
  const body = table?.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new StandingsImportError('Il widget non contiene una tabella di classifica riconoscibile. Controlla che il link sia di un widget «Classifica».');
  const rows: StandingRow[] = [];
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = new Map<string, string>();
    for (const m of tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
      const cls = m[1].match(/class\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/) ?? [];
      for (const c of cls) if (c && !cells.has(c)) cells.set(c, m[2]);
    }
    const team = stripTags(cells.get('team') ?? '');
    if (!team) continue;
    const row: StandingRow = { pos: rows.length + 1, team, played: null, won: null, drawn: null, lost: null, gf: null, ga: null, gd: null, pts: null, logoId: null };
    for (const [cls, field] of WIDGET_COLS) {
      const v = stripTags(cells.get(cls) ?? '').replace(/^\+/, '');
      (row as any)[field] = /^-?\d+$/.test(v) ? parseInt(v, 10) : null;
    }
    rows.push(row);
  }
  if (!rows.length) throw new StandingsImportError('Il widget non contiene squadre.');
  return rows;
}

/** Reads the club's standings widget (one request). */
export async function fetchWidgetStandings(url: string): Promise<StandingRow[]> {
  const clean = normalizeWidgetUrl(url);
  if (!clean) throw new StandingsUnavailableError('Il link del widget non è valido: deve essere del tipo https://www.tuttocampo.it/WidgetV2/Classifica/…');
  let res: Response;
  try {
    res = await fetch(clean, { headers: { Accept: 'text/html' }, cache: 'no-store' });
  } catch (e) {
    throw new StandingsUnavailableError(`Impossibile contattare il widget Tuttocampo (${(e as Error).message}). Verifica la connessione e riprova, oppure importa un CSV.`);
  }
  if (!res.ok) throw new StandingsUnavailableError(`Il widget Tuttocampo ha risposto con errore ${res.status}. Verifica il link del widget, oppure importa un CSV.`);
  return parseWidgetHtml(await res.text());
}

/**
 * Fetches the standings: official API if configured, else the club's widget.
 * Throws StandingsUnavailableError when neither is available.
 */
export async function fetchStandings(league: League): Promise<{ rows: StandingRow[]; method: 'api' | 'widget' }> {
  if (isApiConfigured(league)) return { rows: await fetchApiStandings(league), method: 'api' };
  const widget = widgetUrlOf(league).trim();
  if (widget) return { rows: await fetchWidgetStandings(widget), method: 'widget' };
  throw new StandingsUnavailableError(UNAVAILABLE_MESSAGE);
}

async function fetchApiStandings(league: League): Promise<StandingRow[]> {
  const { endpoint, key } = league.api!;
  let res: Response;
  try {
    res = await fetch(endpoint.trim(), {
      headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key.trim()}`, 'X-Api-Key': key.trim() } : {}) },
    });
  } catch (e) {
    throw new StandingsUnavailableError(`Impossibile contattare l'API configurata (${(e as Error).message}). Verifica indirizzo e connessione.`);
  }
  if (res.status === 401 || res.status === 403) throw new StandingsUnavailableError('L’API ha rifiutato l’accesso: verifica la chiave API.');
  if (!res.ok) throw new StandingsUnavailableError(`L’API ha risposto con errore ${res.status}.`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new StandingsUnavailableError('La risposta dell’API non è in formato JSON.');
  }
  const records = pickArray(data);
  if (!records.length) throw new StandingsImportError('La risposta dell’API non contiene una classifica riconoscibile.');
  return normalizeRecords(records);
}
