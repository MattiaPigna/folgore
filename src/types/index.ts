export type GraphicKind = 'matchday' | 'halftime' | 'fulltime' | 'postmatch' | 'standings';

export const GRAPHIC_KINDS: GraphicKind[] = ['matchday', 'halftime', 'fulltime', 'postmatch', 'standings'];

export const KIND_LABELS: Record<GraphicKind, string> = {
  matchday: 'MATCHDAY',
  halftime: 'HALF TIME',
  fulltime: 'FULL TIME',
  postmatch: 'POST MATCH',
  standings: 'CLASSIFICA',
};

export type AssetKind = 'logo' | 'background' | 'photo' | 'image' | 'font' | 'sponsor';

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  blob: Blob;
  createdAt: number;
  /** Replaced by a retouched version: hidden from the libraries but kept for "restore". */
  archived?: boolean;
}

/** Asset metadata without the blob, kept in memory for listings. */
export interface AssetMeta {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  createdAt: number;
  archived?: boolean;
}

export interface Team {
  id: string;
  name: string;
  logoId: string | null;
  createdAt: number;
}

export type GoalType = 'normal' | 'penalty' | 'own';

export interface Goal {
  id: string;
  /** Team credited with the goal. For own goals this is the team that benefits. */
  team: 'home' | 'away';
  player: string;
  minute: number;
  /** Added time, 0 if none. */
  stoppage: number;
  type: GoalType;
}

export interface StatRow {
  id: string;
  label: string;
  home: string;
  away: string;
}

export type FormatPreset = 'portrait' | 'story' | 'square' | 'custom';

export interface FormatSpec {
  preset: FormatPreset;
  width: number;
  height: number;
}

export const FORMAT_PRESETS: Record<Exclude<FormatPreset, 'custom'>, FormatSpec & { label: string }> = {
  portrait: { preset: 'portrait', width: 1080, height: 1350, label: 'Post verticale · 1080×1350' },
  story: { preset: 'story', width: 1080, height: 1920, label: 'Storia · 1080×1920' },
  square: { preset: 'square', width: 1080, height: 1080, label: 'Quadrato · 1080×1080' },
};

export interface GraphicDoc {
  format: FormatSpec;
  /** Fabric canvas JSON. Image sources are stored as `asset:<id>` references. */
  json: any;
  templateId: string | null;
  updatedAt: number;
}

export interface Match {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  homeLogoId: string | null;
  awayLogoId: string | null;
  date: string; // yyyy-mm-dd
  time: string; // hh:mm
  stadium: string;
  city: string;
  round: string;
  competition: string;
  halfEndMinute: number;
  goals: Goal[];
  penalties: { enabled: boolean; home: number; away: number };
  mvp: string;
  stats: StatRow[];
  extraInfo: string;
  photoId: string | null;
  graphics: Record<GraphicKind, GraphicDoc | null>;
  templateIds: Record<GraphicKind, string>;
  /** Format used when a graphic is first created from a built-in template. */
  format?: FormatSpec;
  createdAt: number;
  updatedAt: number;
}

export interface Template {
  id: string;
  name: string;
  kind: GraphicKind;
  format: FormatSpec;
  /** null for built-in templates (generated programmatically). */
  json: any | null;
  thumbnail: string | null;
  builtIn: boolean;
  createdAt: number;
}

export interface FontRecord {
  id: string;
  family: string;
  fileName: string;
  assetId: string;
  createdAt: number;
}

export interface Settings {
  uppercaseInfo: boolean;
  defaultFormat: FormatSpec;
  defaultTemplates: Record<GraphicKind, string>;
  jpgQuality: number;
  snapEnabled: boolean;
  matchdayPrefix: string;
  /** File names from loghi/puliti already imported (deleted logos are not re-imported). */
  importedLogoFiles?: string[];
  /** League followed for the CLASSIFICA graphic. */
  league?: League;
  /** Official sponsors, used by sponsor bars / badges in the graphics. */
  sponsors?: Sponsor[];
  /** File names from sponsor/ already imported (deleted sponsors are not re-imported). */
  importedSponsorFiles?: string[];
  /** Retouched asset id -> original asset id (for "Ripristina originale"). */
  assetOriginals?: Record<string, string>;
}

export type SponsorTier = 'main' | 'technical' | 'official' | 'partner';

export interface Sponsor {
  id: string;
  name: string;
  assetId: string;
  /** Untouched upload, kept when the background was removed automatically. */
  originalAssetId: string | null;
  tier: SponsorTier;
  active: boolean;
  order: number;
}

export interface StandingRow {
  pos: number;
  team: string;
  /** null = value not provided by the source (shown as "–", never invented). */
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  gf: number | null;
  ga: number | null;
  gd: number | null;
  pts: number | null;
  /** Library logo matched to this team. */
  logoId: string | null;
}

export type StandingsSource = 'api' | 'widget' | 'csv' | 'manual';

export interface League {
  name: string;
  region: string;
  province: string;
  category: string;
  group: string;
  source: 'tuttocampo';
  url: string;
  rows: StandingRow[];
  updatedAt: number | null;
  updateMethod: StandingsSource | null;
  /** Team highlighted in the graphic. */
  favoriteTeam: string;
  /** Official Tuttocampo data API (paid, by agreement). Empty = not configured. */
  api?: { endpoint: string; key: string };
  /** Club's Tuttocampo standings widget (WidgetV2/Classifica/<id>). undefined = default, '' = disabled. */
  widgetUrl?: string;
}
