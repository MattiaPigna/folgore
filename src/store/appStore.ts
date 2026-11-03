import { create } from 'zustand';
import { deleteAsset, renameAsset, saveAsset } from '../services/assets';
import { db, uid } from '../services/database';
import { registerCustomFont, unregisterCustomFont } from '../services/fonts';
import { BUILTIN_TEMPLATE_IDS } from '../editor/layouts';
import { DEFAULT_LEAGUE } from '../services/tuttocampo';
import type { AssetKind, AssetMeta, FontRecord, GraphicKind, Match, Settings, Team, Template } from '../types';
import { FORMAT_PRESETS, GRAPHIC_KINDS } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  uppercaseInfo: true,
  defaultFormat: { preset: 'portrait', width: FORMAT_PRESETS.portrait.width, height: FORMAT_PRESETS.portrait.height },
  defaultTemplates: { ...BUILTIN_TEMPLATE_IDS },
  jpgQuality: 0.95,
  snapEnabled: true,
  matchdayPrefix: 'MATCHDAY',
  league: DEFAULT_LEAGUE,
};

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export function emptyMatch(settings: Settings): Match {
  const now = Date.now();
  return {
    id: uid(),
    homeTeamId: null,
    awayTeamId: null,
    homeName: '',
    awayName: '',
    homeLogoId: null,
    awayLogoId: null,
    date: new Date().toISOString().slice(0, 10),
    time: '15:00',
    stadium: '',
    city: '',
    round: '1',
    competition: '',
    halfEndMinute: 45,
    goals: [],
    penalties: { enabled: false, home: 0, away: 0 },
    mvp: '',
    stats: [],
    extraInfo: '',
    photoId: null,
    graphics: { matchday: null, halftime: null, fulltime: null, postmatch: null, standings: null },
    templateIds: { ...settings.defaultTemplates },
    goalVideo: null,
    createdAt: now,
    updatedAt: now,
  };
}

interface AppState {
  loaded: boolean;
  teams: Team[];
  assets: AssetMeta[];
  matches: Match[];
  templates: Template[];
  fonts: FontRecord[];
  settings: Settings;
  toasts: Toast[];

  init: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;

  addAsset: (blob: Blob, kind: AssetKind, name: string) => Promise<AssetMeta>;
  renameAsset: (id: string, name: string) => Promise<void>;
  setAssetArchived: (id: string, archived: boolean) => Promise<void>;
  /** Points every team, match, sponsor and standings row using `oldId` to `newId`. */
  replaceAssetEverywhere: (oldId: string, newId: string) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;

  saveTeam: (team: Team) => Promise<void>;
  /** Creates a team for the given library logo (or returns the team already using it). */
  teamFromLogo: (logoId: string) => Promise<Team | undefined>;
  removeTeam: (id: string) => Promise<void>;

  saveMatch: (match: Match) => Promise<void>;
  updateMatch: (id: string, patch: Partial<Match> | ((m: Match) => Partial<Match>)) => Promise<Match | undefined>;
  removeMatch: (id: string) => Promise<void>;
  duplicateMatch: (id: string) => Promise<Match | undefined>;

  saveTemplate: (t: Template) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;

  addFont: (rec: FontRecord) => Promise<void>;
  removeFont: (id: string) => Promise<void>;

  setSettings: (patch: Partial<Settings>) => Promise<void>;
}

function metaOf(a: { id: string; kind: AssetKind; name: string; mime: string; createdAt: number; archived?: boolean }): AssetMeta {
  return { id: a.id, kind: a.kind, name: a.name, mime: a.mime, createdAt: a.createdAt, archived: a.archived };
}

/** Serializes match writes so rapid edits never persist out of order. */
let writeChain: Promise<unknown> = Promise.resolve();
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const p = writeChain.then(fn, fn);
  writeChain = p.catch(() => undefined);
  return p;
}

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  teams: [],
  assets: [],
  matches: [],
  templates: [],
  fonts: [],
  settings: DEFAULT_SETTINGS,
  toasts: [],

  async init() {
    const [teams, assets, matches, templates, fonts, settings] = await Promise.all([
      db.getAll('teams'),
      db.getAll('assets'),
      db.getAll('matches'),
      db.getAll('templates'),
      db.getAll('fonts'),
      db.getSettings(),
    ]);
    const merged: Settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      defaultTemplates: { ...DEFAULT_SETTINGS.defaultTemplates, ...settings?.defaultTemplates },
      // The default league (Tuttocampo, Terza Categoria Girone A Avellino) is always preconfigured.
      league: { ...DEFAULT_LEAGUE, ...settings?.league },
    };
    for (const f of fonts) {
      try {
        await registerCustomFont(f);
      } catch (e) {
        console.warn('Font non caricato', f.family, e);
      }
    }
    set({
      loaded: true,
      teams: teams.sort((a, b) => a.name.localeCompare(b.name)),
      assets: assets.map(metaOf),
      matches: matches.sort((a, b) => b.updatedAt - a.updatedAt),
      templates: templates.sort((a, b) => a.createdAt - b.createdAt),
      fonts,
      settings: merged,
    });
  },

  toast(text, kind = 'info') {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3200);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async addAsset(blob, kind, name) {
    const rec = await saveAsset(blob, kind, name);
    const meta = metaOf(rec);
    set((s) => ({ assets: [...s.assets, meta] }));
    return meta;
  },
  async setAssetArchived(id, archived) {
    const rec = await db.get('assets', id);
    if (rec) await db.put('assets', { ...rec, archived });
    set((s) => ({ assets: s.assets.map((a) => (a.id === id ? { ...a, archived } : a)) }));
  },
  async replaceAssetEverywhere(oldId, newId) {
    const st = get();
    for (const t of st.teams) if (t.logoId === oldId) await st.saveTeam({ ...t, logoId: newId });
    for (const m of st.matches) {
      if (m.homeLogoId === oldId || m.awayLogoId === oldId || m.photoId === oldId) {
        await get().updateMatch(m.id, {
          homeLogoId: m.homeLogoId === oldId ? newId : m.homeLogoId,
          awayLogoId: m.awayLogoId === oldId ? newId : m.awayLogoId,
          photoId: m.photoId === oldId ? newId : m.photoId,
        });
      }
    }
    const settings = get().settings;
    const patch: Partial<Settings> = {};
    if (settings.sponsors?.some((s) => s.assetId === oldId)) {
      patch.sponsors = settings.sponsors.map((s) => (s.assetId === oldId ? { ...s, assetId: newId } : s));
    }
    if (settings.league?.rows.some((r) => r.logoId === oldId)) {
      patch.league = { ...settings.league, rows: settings.league.rows.map((r) => (r.logoId === oldId ? { ...r, logoId: newId } : r)) };
    }
    if (Object.keys(patch).length) await get().setSettings(patch);
  },
  async renameAsset(id, name) {
    await renameAsset(id, name);
    set((s) => ({ assets: s.assets.map((a) => (a.id === id ? { ...a, name } : a)) }));
  },
  async removeAsset(id) {
    await deleteAsset(id);
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
  },

  async saveTeam(team) {
    await db.put('teams', team);
    set((s) => {
      const exists = s.teams.some((t) => t.id === team.id);
      const teams = exists ? s.teams.map((t) => (t.id === team.id ? team : t)) : [...s.teams, team];
      return { teams: teams.sort((a, b) => a.name.localeCompare(b.name)) };
    });
  },
  async teamFromLogo(logoId) {
    const existing = get().teams.find((t) => t.logoId === logoId);
    if (existing) return existing;
    const logo = get().assets.find((a) => a.id === logoId);
    if (!logo) return undefined;
    const name = teamNameFromFile(logo.name);
    // Reattach to a same-named team that lost its logo instead of duplicating it.
    const sameName = get().teams.find((t) => !t.logoId && t.name.toLowerCase() === name.toLowerCase());
    if (sameName) {
      const updated = { ...sameName, logoId };
      await get().saveTeam(updated);
      return updated;
    }
    const team: Team = { id: uid(), name, logoId, createdAt: Date.now() };
    await get().saveTeam(team);
    return team;
  },
  async removeTeam(id) {
    await db.delete('teams', id);
    set((s) => ({ teams: s.teams.filter((t) => t.id !== id) }));
  },

  async saveMatch(match) {
    const m = { ...match, updatedAt: Date.now() };
    set((s) => {
      const exists = s.matches.some((x) => x.id === m.id);
      return { matches: exists ? s.matches.map((x) => (x.id === m.id ? m : x)) : [m, ...s.matches] };
    });
    await queue(() => db.put('matches', m));
  },
  async updateMatch(id, patch) {
    const cur = get().matches.find((m) => m.id === id);
    if (!cur) return undefined;
    const p = typeof patch === 'function' ? patch(cur) : patch;
    const next: Match = { ...cur, ...p, updatedAt: Date.now() };
    set((s) => ({ matches: s.matches.map((x) => (x.id === id ? next : x)) }));
    await queue(() => db.put('matches', next));
    return next;
  },
  async removeMatch(id) {
    const m = get().matches.find((x) => x.id === id);
    set((s) => ({ matches: s.matches.filter((x) => x.id !== id) }));
    await queue(() => db.delete('matches', id));
    // Delete per-match images (backgrounds, photo) no longer referenced elsewhere.
    if (m) {
      const ids = new Set<string>();
      if (m.photoId) ids.add(m.photoId);
      for (const k of GRAPHIC_KINDS) {
        for (const o of m.graphics[k]?.json?.objects ?? []) {
          if (o.role === 'background' && o.assetId) ids.add(o.assetId);
        }
      }
      const stillUsed = JSON.stringify(get().matches) + JSON.stringify(get().templates);
      for (const aid of ids) {
        if (!stillUsed.includes(aid)) await get().removeAsset(aid);
      }
    }
  },
  async duplicateMatch(id) {
    const cur = get().matches.find((m) => m.id === id);
    if (!cur) return undefined;
    const now = Date.now();
    const copy: Match = { ...structuredClone(cur), id: uid(), createdAt: now, updatedAt: now };
    await get().saveMatch(copy);
    return copy;
  },

  async saveTemplate(t) {
    await db.put('templates', t);
    set((s) => {
      const exists = s.templates.some((x) => x.id === t.id);
      return { templates: exists ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] };
    });
  },
  async removeTemplate(id) {
    await db.delete('templates', id);
    set((s) => ({ templates: s.templates.filter((x) => x.id !== id) }));
    const st = get().settings;
    const dt = { ...st.defaultTemplates };
    let changed = false;
    for (const k of GRAPHIC_KINDS as GraphicKind[]) {
      if (dt[k] === id) {
        dt[k] = BUILTIN_TEMPLATE_IDS[k];
        changed = true;
      }
    }
    if (changed) await get().setSettings({ defaultTemplates: dt });
  },

  async addFont(rec) {
    await registerCustomFont(rec);
    await db.put('fonts', rec);
    set((s) => ({ fonts: [...s.fonts, rec] }));
  },
  async removeFont(id) {
    const f = get().fonts.find((x) => x.id === id);
    unregisterCustomFont(id);
    await db.delete('fonts', id);
    if (f) await get().removeAsset(f.assetId);
    set((s) => ({ fonts: s.fonts.filter((x) => x.id !== id) }));
  },

  async setSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await db.putSettings(next);
  },
}));

export function teamLogoId(teams: Team[], teamId: string | null): string | null {
  return teams.find((t) => t.id === teamId)?.logoId ?? null;
}

/** Logos in the library that are not yet linked to any team. */
export function orphanLogos(s: Pick<AppState, 'assets' | 'teams'>): AssetMeta[] {
  const used = new Set(s.teams.map((t) => t.logoId));
  return s.assets.filter((a) => a.kind === 'logo' && !a.archived && !used.has(a.id));
}

/**
 * Turns a logo file name into a team name:
 * "Stemma Savignano Calcio 2024(5)" -> "Savignano Calcio".
 */
export function teamNameFromFile(name: string): string {
  let n = name
    .replace(/\(\d+\)/g, ' ')
    .replace(/\s+con\s+.*$/i, ' ')
    .replace(/^(emblema|stemma|scudetto|logo|crest)\b/i, ' ')
    .replace(/^\s*(circolare|sportivo|calcistico|ufficiale)\b/i, ' ')
    .replace(/^\s*(del|della|dello|dei)\b/i, ' ')
    .replace(/\b(crest|emblema|stemma|logo)\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) n = name.trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

if (import.meta.env.DEV) (window as any).__app = useApp;
