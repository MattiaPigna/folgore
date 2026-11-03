import { FabricImage, Gradient, Rect, Shadow, Textbox, type FabricObject } from 'fabric';
import { uid } from '../services/database';
import { SANS_FONT, SCORE_FONT, SCRIPT_FONT, SERIF_FONT } from '../services/fonts';
import type { FormatSpec, GraphicKind } from '../types';
import { CUSTOM_PROPS } from './fabricSetup';
import { fitImageToBox } from './geometry';
import { LOGO_PLACEHOLDER, PHOTO_PLACEHOLDER } from './serialization';

export const BUILTIN_TEMPLATE_IDS: Record<GraphicKind, string> = {
  matchday: 'builtin-matchday',
  halftime: 'builtin-halftime',
  fulltime: 'builtin-fulltime',
  postmatch: 'builtin-postmatch',
  standings: 'builtin-standings',
};

export function isBuiltinTemplate(id: string): boolean {
  return id.startsWith('builtin-');
}

/** Default dark background used until the user uploads a photo. */
export function makeDefaultBackground(W: number, H: number): Rect {
  return new Rect({
    id: uid(),
    name: 'Sfondo',
    role: 'background',
    left: 0,
    top: 0,
    width: W,
    height: H,
    fill: new Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: W * 0.4, y2: H },
      colorStops: [
        { offset: 0, color: '#1d2230' },
        { offset: 0.55, color: '#0d0f15' },
        { offset: 1, color: '#2a0a10' },
      ],
    }),
    strokeWidth: 0,
  });
}

function vignette(W: number, H: number, top: boolean, strength: number): Rect {
  const h = H * 0.26;
  return new Rect({
    id: uid(),
    name: top ? 'Sfumatura alto' : 'Sfumatura basso',
    role: 'decor',
    left: 0,
    top: top ? 0 : H - h,
    width: W,
    height: h,
    strokeWidth: 0,
    fill: new Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 0, y2: h },
      colorStops: top
        ? [
            { offset: 0, color: `rgba(0,0,0,${strength})` },
            { offset: 1, color: 'rgba(0,0,0,0)' },
          ]
        : [
            { offset: 0, color: 'rgba(0,0,0,0)' },
            { offset: 1, color: `rgba(0,0,0,${strength})` },
          ],
    }),
  });
}

function veil(W: number, H: number, opacity: number): Rect {
  return new Rect({ id: uid(), name: 'Velo scuro', role: 'decor', left: 0, top: 0, width: W, height: H, fill: '#000000', opacity, strokeWidth: 0 });
}

export interface TextOpts {
  name: string;
  text: string;
  binding?: string;
  left: number;
  top: number;
  width: number;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  charSpacing?: number;
  fill?: string;
  opacity?: number;
  lineHeight?: number;
  shadow?: Shadow;
  fontStyle?: 'normal' | 'italic';
  keepCase?: boolean;
}

export function text(o: TextOpts): Textbox {
  return new Textbox(o.text, {
    id: uid(),
    name: o.name,
    role: 'element',
    binding: o.binding,
    autoText: o.binding ? true : undefined,
    left: o.left,
    top: o.top,
    width: o.width,
    fontSize: o.fontSize,
    fontFamily: o.fontFamily ?? SANS_FONT,
    fontWeight: o.fontWeight ?? 400,
    textAlign: o.textAlign ?? 'left',
    charSpacing: o.charSpacing ?? 0,
    fill: o.fill ?? '#ffffff',
    opacity: o.opacity ?? 1,
    lineHeight: o.lineHeight ?? 1.16,
    shadow: o.shadow,
    fontStyle: o.fontStyle ?? 'normal',
    keepCase: o.keepCase,
  });
}

function centered(W: number, width: number, cx = W / 2) {
  return cx - width / 2;
}

function titleShadow(u: number) {
  return new Shadow({ color: 'rgba(200,16,32,0.9)', blur: 22 * u, offsetX: 0, offsetY: 5 * u });
}

export async function image(
  src: string,
  o: { name: string; binding: string; cx: number; cy: number; boxW: number; boxH: number; fitMode?: 'contain' | 'cover' },
): Promise<FabricImage> {
  const img = await FabricImage.fromURL(src);
  img.set({
    id: uid(),
    name: o.name,
    role: 'element',
    binding: o.binding,
    assetId: null,
    boxW: o.boxW,
    boxH: o.boxH,
    fitMode: o.fitMode ?? 'contain',
    originX: 'center',
    originY: 'center',
    left: o.cx,
    top: o.cy,
  });
  fitImageToBox(img, o.boxW, o.boxH, o.fitMode ?? 'contain');
  return img;
}

function headerItems(W: number, H: number, u: number): FabricObject[] {
  const m = 60 * u;
  return [
    text({ name: 'Giornata', binding: 'matchdayLabel', text: 'MATCHDAY 1°', left: m, top: H * 0.032, width: 520 * u, fontSize: 31 * u, charSpacing: 220 }),
    text({ name: 'Stadio', binding: 'stadium', text: 'STADIO', left: W - m - 640 * u, top: H * 0.03, width: 640 * u, fontSize: 19 * u, fontWeight: 500, textAlign: 'right', charSpacing: 30 }),
    text({ name: 'Località', binding: 'city', text: 'LOCALITÀ', left: W - m - 640 * u, top: H * 0.03 + 30 * u, width: 640 * u, fontSize: 16 * u, textAlign: 'right', charSpacing: 40, opacity: 0.88 }),
  ];
}

function footerItems(W: number, H: number, u: number): FabricObject[] {
  const m = 60 * u;
  return [
    text({ name: 'Data', binding: 'date', text: 'SAB 31 OTTOBRE 2026', left: m, top: H - 70 * u, width: 520 * u, fontSize: 27 * u, charSpacing: 20 }),
    text({ name: 'Orario', binding: 'time', text: 'ORE 14:30', left: W - m - 400 * u, top: H - 70 * u, width: 400 * u, fontSize: 27 * u, textAlign: 'right', charSpacing: 20 }),
  ];
}

async function buildMatchday(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const logoY = H * 0.548;
  const box = { boxW: 150 * u, boxH: 170 * u };
  const titleSize = 180 * u;
  return [
    makeDefaultBackground(W, H),
    vignette(W, H, true, 0.6),
    vignette(W, H, false, 0.7),
    ...headerItems(W, H, u),
    text({
      name: 'Titolo',
      text: 'Matchday',
      left: centered(W, W * 1.0),
      top: H * 0.31,
      width: W * 1.0,
      fontSize: titleSize,
      fontFamily: SCRIPT_FONT,
      textAlign: 'center',
      lineHeight: 1,
      shadow: titleShadow(u),
    }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo casa', binding: 'homeLogo', cx: W * 0.4, cy: logoY, ...box }),
    new Rect({ id: uid(), name: 'Divisore', role: 'decor', left: W / 2 - 1.5 * u, top: logoY - 85 * u, width: 3 * u, height: 170 * u, fill: '#ffffff', opacity: 0.6, strokeWidth: 0 }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo ospite', binding: 'awayLogo', cx: W * 0.6, cy: logoY, ...box }),
    ...footerItems(W, H, u),
  ];
}

async function buildResult(W: number, H: number, kind: 'halftime' | 'fulltime'): Promise<FabricObject[]> {
  const u = W / 1080;
  const rowY = H * 0.47;
  const box = { boxW: 240 * u, boxH: 270 * u };
  const scoreSize = 200 * u;
  const items: FabricObject[] = [
    makeDefaultBackground(W, H),
    veil(W, H, 0.3),
    vignette(W, H, true, 0.6),
    vignette(W, H, false, 0.75),
    ...headerItems(W, H, u),
    text({
      name: 'Titolo',
      text: kind === 'halftime' ? 'Half Time' : 'Full Time',
      left: 0,
      top: H * 0.135,
      width: W,
      fontSize: 180 * u,
      fontFamily: SCRIPT_FONT,
      textAlign: 'center',
      lineHeight: 1,
      shadow: titleShadow(u),
    }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo casa', binding: 'homeLogo', cx: W * 0.2, cy: rowY, ...box }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo ospite', binding: 'awayLogo', cx: W * 0.8, cy: rowY, ...box }),
    text({
      name: 'Risultato',
      binding: 'score',
      text: '0 - 0',
      left: centered(W, 440 * u),
      top: rowY - scoreSize * 0.6,
      width: 440 * u,
      fontSize: scoreSize,
      fontFamily: SCORE_FONT,
      fontWeight: 700,
      textAlign: 'center',
      lineHeight: 1,
    }),
    text({ name: 'Nome casa', binding: 'homeName', text: 'CASA', left: centered(W, 380 * u, W * 0.2), top: rowY + 150 * u, width: 380 * u, fontSize: 24 * u, fontWeight: 600, textAlign: 'center', charSpacing: 60 }),
    text({ name: 'Nome ospite', binding: 'awayName', text: 'OSPITE', left: centered(W, 380 * u, W * 0.8), top: rowY + 150 * u, width: 380 * u, fontSize: 24 * u, fontWeight: 600, textAlign: 'center', charSpacing: 60 }),
    new Rect({ id: uid(), name: 'Linea', role: 'decor', left: W * 0.1, top: H * 0.665, width: W * 0.8, height: 2 * u, fill: '#ffffff', opacity: 0.3, strokeWidth: 0 }),
    text({ name: 'Marcatori casa', binding: 'scorersHome', text: '', left: W * 0.04, top: H * 0.69, width: W * 0.42, fontSize: 27 * u, textAlign: 'center', lineHeight: 1.35 }),
    text({ name: 'Marcatori ospite', binding: 'scorersAway', text: '', left: W * 0.54, top: H * 0.69, width: W * 0.42, fontSize: 27 * u, textAlign: 'center', lineHeight: 1.35 }),
    ...footerItems(W, H, u),
  ];
  if (kind === 'fulltime') {
    items.push(
      text({ name: 'Rigori', binding: 'penalties', text: '', left: centered(W, 440 * u), top: rowY + scoreSize * 0.45, width: 440 * u, fontSize: 30 * u, fontWeight: 600, textAlign: 'center', charSpacing: 80, fill: '#fda4af' }),
      text({ name: 'Info aggiuntive', binding: 'extra', text: '', left: W * 0.1, top: H * 0.86, width: W * 0.8, fontSize: 22 * u, textAlign: 'center', opacity: 0.85 }),
    );
  }
  return items;
}

async function buildPostMatch(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const rowY = H * 0.585;
  const box = { boxW: 150 * u, boxH: 170 * u };
  const scoreSize = 150 * u;
  return [
    makeDefaultBackground(W, H),
    veil(W, H, 0.45),
    vignette(W, H, false, 0.75),
    await image(PHOTO_PLACEHOLDER, { name: 'Foto partita', binding: 'photo', cx: W / 2, cy: H * 0.255, boxW: W * 0.89, boxH: H * 0.34, fitMode: 'cover' }),
    ...headerItems(W, H, u),
    text({ name: 'Titolo', text: 'Post Match', left: 0, top: H * 0.385, width: W, fontSize: 130 * u, fontFamily: SCRIPT_FONT, textAlign: 'center', lineHeight: 1, shadow: titleShadow(u) }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo casa', binding: 'homeLogo', cx: W * 0.22, cy: rowY, ...box }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo ospite', binding: 'awayLogo', cx: W * 0.78, cy: rowY, ...box }),
    text({ name: 'Risultato', binding: 'score', text: '0 - 0', left: centered(W, 420 * u), top: rowY - scoreSize * 0.6, width: 420 * u, fontSize: scoreSize, fontFamily: SCORE_FONT, fontWeight: 700, textAlign: 'center', lineHeight: 1 }),
    text({ name: 'Rigori', binding: 'penalties', text: '', left: centered(W, 420 * u), top: rowY + scoreSize * 0.45, width: 420 * u, fontSize: 24 * u, fontWeight: 600, textAlign: 'center', charSpacing: 80, fill: '#fda4af' }),
    text({ name: 'Marcatori casa', binding: 'scorersHome', text: '', left: W * 0.04, top: H * 0.665, width: W * 0.42, fontSize: 22 * u, textAlign: 'center', lineHeight: 1.3 }),
    text({ name: 'Marcatori ospite', binding: 'scorersAway', text: '', left: W * 0.54, top: H * 0.665, width: W * 0.42, fontSize: 22 * u, textAlign: 'center', lineHeight: 1.3 }),
    text({ name: 'Etichetta MVP', text: 'MIGLIORE IN CAMPO', left: centered(W, 600 * u), top: H * 0.765, width: 600 * u, fontSize: 18 * u, fontWeight: 600, textAlign: 'center', charSpacing: 300, fill: '#fb7185' }),
    text({ name: 'MVP', binding: 'mvp', text: '', left: centered(W, 800 * u), top: H * 0.765 + 28 * u, width: 800 * u, fontSize: 40 * u, fontWeight: 700, textAlign: 'center', charSpacing: 40 }),
    text({ name: 'Statistiche', binding: 'stats', text: '', left: centered(W, 800 * u), top: H * 0.84, width: 800 * u, fontSize: 21 * u, textAlign: 'center', lineHeight: 1.35, opacity: 0.92 }),
    text({ name: 'Info aggiuntive', binding: 'extra', text: '', left: W * 0.1, top: H - 64 * u, width: W * 0.8, fontSize: 19 * u, textAlign: 'center', opacity: 0.8 }),
  ];
}

/**
 * Editorial MATCHDAY: huge serif italic title bleeding off the top, full-bleed photo,
 * footer with date/stadium (left), teams with logos split by a slash (centre), kick-off (right).
 */
async function buildEditorialMatchday(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const m = 58 * u;
  const logoY = H * 0.848;
  const footerY = H * 0.9;
  const fade = (top: boolean, h: number, a: number) =>
    new Rect({
      id: uid(),
      name: top ? 'Sfumatura alto' : 'Sfumatura basso',
      role: 'decor',
      left: 0,
      top: top ? 0 : H - h,
      width: W,
      height: h,
      strokeWidth: 0,
      fill: new Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: 0, y2: h },
        colorStops: top
          ? [
              { offset: 0, color: `rgba(0,0,0,${a})` },
              { offset: 1, color: 'rgba(0,0,0,0)' },
            ]
          : [
              { offset: 0, color: 'rgba(0,0,0,0)' },
              { offset: 0.55, color: `rgba(0,0,0,${a * 0.75})` },
              { offset: 1, color: `rgba(0,0,0,${a})` },
            ],
      }),
    });
  return [
    makeDefaultBackground(W, H),
    fade(true, H * 0.3, 0.7),
    fade(false, H * 0.36, 0.85),
    text({
      name: 'Titolo',
      text: 'Match Day',
      left: -W * 0.02,
      top: -H * 0.045,
      width: W * 1.04,
      fontSize: 228 * u,
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontWeight: 600,
      textAlign: 'center',
      charSpacing: -20,
      lineHeight: 1,
    }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo casa', binding: 'homeLogo', cx: W / 2 - 64 * u, cy: logoY, boxW: 86 * u, boxH: 86 * u }),
    new Rect({
      id: uid(),
      name: 'Barra /',
      role: 'decor',
      left: W / 2,
      top: logoY,
      originX: 'center',
      originY: 'center',
      width: 3 * u,
      height: 78 * u,
      angle: 24,
      fill: '#ffffff',
      strokeWidth: 0,
    }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo ospite', binding: 'awayLogo', cx: W / 2 + 64 * u, cy: logoY, boxW: 86 * u, boxH: 86 * u }),
    text({ name: 'Nome casa', binding: 'homeName', keepCase: true, text: 'Casa', left: W / 2 - 280 * u, top: footerY, width: 560 * u, fontSize: 40 * u, fontFamily: SERIF_FONT, fontStyle: 'italic', fontWeight: 700, textAlign: 'center', lineHeight: 1 }),
    text({ name: 'Nome ospite', binding: 'awayName', keepCase: true, text: 'Ospite', left: W / 2 - 280 * u, top: footerY + 46 * u, width: 560 * u, fontSize: 40 * u, fontFamily: SERIF_FONT, textAlign: 'center', lineHeight: 1 }),
    text({ name: 'Data', binding: 'dateLong', keepCase: true, text: 'Domenica 1 Novembre', left: m, top: footerY + 12 * u, width: 300 * u, fontSize: 23 * u }),
    text({ name: 'Stadio', binding: 'stadium', keepCase: true, text: 'Stadio', left: m, top: footerY + 44 * u, width: 300 * u, fontSize: 25 * u, fontFamily: SERIF_FONT, fontStyle: 'italic' }),
    text({ name: 'Etichetta kick off', text: 'Kick off', left: W - m - 260 * u, top: footerY + 12 * u, width: 260 * u, fontSize: 23 * u, textAlign: 'right' }),
    text({ name: 'Orario', binding: 'timeOnly', text: '15:00', left: W - m - 260 * u, top: footerY + 42 * u, width: 260 * u, fontSize: 27 * u, fontWeight: 700, textAlign: 'right' }),
  ];
}

/**
 * Elegant MATCHDAY: portrait photo, thin serif italic title in the middle with a soft glow,
 * small letter-spaced info in the corners, logos on the left, kick-off centred at the bottom.
 */
async function buildElegantMatchday(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const m = 70 * u;
  const colW = 360 * u;
  const small = { fontSize: 18 * u, fontWeight: 400, charSpacing: 220, lineHeight: 1.25 } as const;
  const logoY = H * 0.345;
  return [
    makeDefaultBackground(W, H),
    veil(W, H, 0.18),
    vignette(W, H, true, 0.55),
    vignette(W, H, false, 0.75),
    text({ name: 'Stadio (alto)', binding: 'stadium', text: 'STADIO', left: m, top: H * 0.024, width: colW, ...small }),
    text({ name: 'Data (alto)', binding: 'dateStacked', text: 'DOMENICA 1\nNOVEMBRE', left: W - m - colW, top: H * 0.024, width: colW, textAlign: 'right', ...small }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo casa', binding: 'homeLogo', cx: m + 30 * u, cy: logoY, boxW: 92 * u, boxH: 92 * u }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo ospite', binding: 'awayLogo', cx: m + 135 * u, cy: logoY, boxW: 92 * u, boxH: 92 * u }),
    text({
      name: 'Titolo',
      text: 'Match Day',
      left: 0,
      top: H * 0.4,
      width: W,
      fontSize: 225 * u,
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      textAlign: 'center',
      charSpacing: -10,
      lineHeight: 1,
      // Soft sideways glow: evokes the motion-blur look of the reference.
      shadow: new Shadow({ color: 'rgba(255,255,255,0.5)', blur: 30 * u, offsetX: -16 * u, offsetY: 0 }),
    }),
    text({ name: 'Giornata e competizione', binding: 'roundCompetition', text: '1ª GIORNATA', left: W * 0.1, top: H * 0.625, width: W * 0.8, fontSize: 17 * u, fontWeight: 500, charSpacing: 260, textAlign: 'center' }),
    text({ name: 'Data (basso)', binding: 'dateStacked', text: 'DOMENICA 1\nNOVEMBRE', left: m, top: H * 0.918, width: colW, ...small }),
    text({ name: 'Etichetta kick-off', text: 'KICK-OFF', left: W / 2 - 150 * u, top: H * 0.918, width: 300 * u, fontSize: 17 * u, fontWeight: 400, charSpacing: 240, textAlign: 'center' }),
    text({ name: 'Orario', binding: 'timeOnly', text: '15:00', left: W / 2 - 150 * u, top: H * 0.918 + 24 * u, width: 300 * u, fontSize: 32 * u, fontWeight: 600, charSpacing: 60, textAlign: 'center' }),
    text({ name: 'Stadio (basso)', binding: 'stadium', text: 'STADIO', left: W - m - colW, top: H * 0.918, width: colW, textAlign: 'right', ...small }),
  ];
}

/** Max rows of the standings table (rows without data are hidden automatically). */
export const STANDINGS_MAX_ROWS = 16;

const STANDINGS_COLS: { field: string; label: string; cx: number; bold?: boolean }[] = [
  { field: 'pts', label: 'PT', cx: 655, bold: true },
  { field: 'played', label: 'G', cx: 714 },
  { field: 'won', label: 'V', cx: 766 },
  { field: 'drawn', label: 'N', cx: 818 },
  { field: 'lost', label: 'P', cx: 870 },
  { field: 'gf', label: 'GF', cx: 922 },
  { field: 'ga', label: 'GS', cx: 974 },
  { field: 'gd', label: 'DR', cx: 1028 },
];

/**
 * CLASSIFICA: script title, league subtitle, table bound to the league data
 * (one object per cell, so everything stays editable), highlighted favourite team, update date.
 */
async function buildStandings(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const headerY = H * 0.228;
  const tableTop = H * 0.256;
  const rowH = (H * 0.935 - tableTop) / STANDINGS_MAX_ROWS;
  const f = Math.min(24 * u, rowH * 0.42);
  const textTop = (rowTop: number, size: number) => rowTop + (rowH - size * 1.16) / 2;
  const items: FabricObject[] = [
    makeDefaultBackground(W, H),
    veil(W, H, 0.5),
    vignette(W, H, true, 0.6),
    vignette(W, H, false, 0.6),
    text({ name: 'Titolo', text: 'Classifica', left: 0, top: H * 0.028, width: W, fontSize: 150 * u, fontFamily: SCRIPT_FONT, textAlign: 'center', lineHeight: 1, shadow: titleShadow(u) }),
    text({ name: 'Campionato', binding: 'leagueName', text: 'TERZA CATEGORIA · GIRONE A AVELLINO', left: W * 0.05, top: H * 0.187, width: W * 0.9, fontSize: 20 * u, fontWeight: 600, charSpacing: 200, textAlign: 'center' }),
    text({ name: 'Intestazione squadra', text: 'SQUADRA', left: 175 * u, top: headerY, width: 300 * u, fontSize: 16 * u, fontWeight: 600, charSpacing: 120, opacity: 0.7 }),
    ...STANDINGS_COLS.map((c) =>
      text({ name: `Intestazione ${c.label}`, text: c.label, left: (c.cx - 30) * u, top: headerY, width: 60 * u, fontSize: 16 * u, fontWeight: 600, charSpacing: 60, textAlign: 'center', opacity: 0.7 }),
    ),
  ];
  for (let i = 0; i < STANDINGS_MAX_ROWS; i++) {
    const top = tableTop + i * rowH;
    const n = `Riga ${i + 1}`;
    items.push(
      new Rect({ id: uid(), name: `${n} · Sfondo`, role: 'decor', binding: `stRow:${i}`, left: 34 * u, top: top + 2 * u, width: 1012 * u, height: rowH - 4 * u, rx: 6 * u, ry: 6 * u, fill: '#ffffff', opacity: i % 2 ? 0.035 : 0.075, strokeWidth: 0 }),
      new Rect({ id: uid(), name: `${n} · Evidenziazione`, role: 'decor', binding: `stHi:${i}`, left: 34 * u, top: top + 2 * u, width: 1012 * u, height: rowH - 4 * u, rx: 6 * u, ry: 6 * u, fill: '#e11d48', opacity: 0.92, strokeWidth: 0, visible: false }),
      text({ name: `${n} · Posizione`, binding: `st:${i}:pos`, text: '', left: 40 * u, top: textTop(top, f * 1.1), width: 60 * u, fontSize: f * 1.1, fontFamily: SCORE_FONT, fontWeight: 700, textAlign: 'center', lineHeight: 1.16 }),
      await image(LOGO_PLACEHOLDER, { name: `${n} · Logo`, binding: `stLogo:${i}`, cx: 135 * u, cy: top + rowH / 2, boxW: rowH * 0.74, boxH: rowH * 0.74 }),
      text({ name: `${n} · Squadra`, binding: `st:${i}:team`, text: '', left: 175 * u, top: textTop(top, f), width: 440 * u, fontSize: f, fontWeight: 600, lineHeight: 1.16 }),
      ...STANDINGS_COLS.map((c) =>
        text({ name: `${n} · ${c.label}`, binding: `st:${i}:${c.field}`, text: '', left: (c.cx - 30) * u, top: textTop(top, f), width: 60 * u, fontSize: f, fontWeight: c.bold ? 700 : 400, textAlign: 'center', lineHeight: 1.16 }),
      ),
    );
  }
  items.push(
    text({ name: 'Ultimo aggiornamento', binding: 'standingsUpdated', text: 'Aggiornata al …', left: W * 0.1, top: H * 0.952, width: W * 0.8, fontSize: 18 * u, textAlign: 'center', opacity: 0.8, keepCase: true }),
  );
  return items;
}

/**
 * CLASSIFICA Moderna: serif italic title on the left, league + update date on the right,
 * airy rows with hairline separators, points in a red pill, favourite team marked by a red bar.
 */
async function buildStandingsModern(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const m = 60 * u;
  const headerY = H * 0.212;
  const tableTop = H * 0.24;
  const rowH = (H * 0.955 - tableTop) / STANDINGS_MAX_ROWS;
  const f = Math.min(25 * u, rowH * 0.43);
  const textTop = (rowTop: number, size: number) => rowTop + (rowH - size * 1.16) / 2;
  const cols: { field: string; label: string; cx: number }[] = [
    { field: 'played', label: 'G', cx: 690 },
    { field: 'won', label: 'V', cx: 745 },
    { field: 'drawn', label: 'N', cx: 800 },
    { field: 'lost', label: 'P', cx: 855 },
    { field: 'gd', label: 'DR', cx: 918 },
  ];
  const ptCx = 992 * u;
  const items: FabricObject[] = [
    makeDefaultBackground(W, H),
    veil(W, H, 0.55),
    vignette(W, H, true, 0.6),
    vignette(W, H, false, 0.5),
    text({ name: 'Titolo', text: 'Classifica', left: m - 8 * u, top: H * 0.035, width: 620 * u, fontSize: 150 * u, fontFamily: SERIF_FONT, fontStyle: 'italic', fontWeight: 600, charSpacing: -15, lineHeight: 1 }),
    text({ name: 'Campionato', binding: 'leagueName', text: 'TERZA CATEGORIA · GIRONE A AVELLINO', left: W - m - 400 * u, top: H * 0.07, width: 400 * u, fontSize: 18 * u, fontWeight: 600, charSpacing: 180, textAlign: 'right', lineHeight: 1.3 }),
    text({ name: 'Ultimo aggiornamento', binding: 'standingsUpdated', keepCase: true, text: 'Aggiornata al …', left: W - m - 400 * u, top: H * 0.07 + 54 * u, width: 400 * u, fontSize: 18 * u, fontFamily: SERIF_FONT, fontStyle: 'italic', textAlign: 'right', opacity: 0.8 }),
    new Rect({ id: uid(), name: 'Linea titolo', role: 'decor', left: m, top: H * 0.188, width: W - 2 * m, height: 2 * u, fill: '#ffffff', opacity: 0.55, strokeWidth: 0 }),
    text({ name: 'Intestazione #', text: '#', left: m, top: headerY, width: 50 * u, fontSize: 15 * u, fontWeight: 600, opacity: 0.6 }),
    text({ name: 'Intestazione squadra', text: 'SQUADRA', left: 200 * u, top: headerY, width: 300 * u, fontSize: 15 * u, fontWeight: 600, charSpacing: 150, opacity: 0.6 }),
    ...cols.map((c) =>
      text({ name: `Intestazione ${c.label}`, text: c.label, left: (c.cx - 30) * u, top: headerY, width: 60 * u, fontSize: 15 * u, fontWeight: 600, charSpacing: 60, textAlign: 'center', opacity: 0.6 }),
    ),
    text({ name: 'Intestazione PT', text: 'PT', left: ptCx - 37 * u, top: headerY, width: 74 * u, fontSize: 15 * u, fontWeight: 700, charSpacing: 60, textAlign: 'center' }),
  ];
  for (let i = 0; i < STANDINGS_MAX_ROWS; i++) {
    const top = tableTop + i * rowH;
    const n = `Riga ${i + 1}`;
    items.push(
      new Rect({ id: uid(), name: `${n} · Evidenziazione`, role: 'decor', binding: `stHi:${i}`, left: m - 14 * u, top, width: W - 2 * m + 28 * u, height: rowH, fill: '#e11d48', opacity: 0.22, strokeWidth: 0, visible: false }),
      new Rect({ id: uid(), name: `${n} · Barra evidenziazione`, role: 'decor', binding: `stHi:${i}`, left: m - 14 * u, top, width: 6 * u, height: rowH, fill: '#e11d48', strokeWidth: 0, visible: false }),
      new Rect({ id: uid(), name: `${n} · Separatore`, role: 'decor', binding: `stRow:${i}`, left: m, top: top + rowH - 1 * u, width: W - 2 * m, height: 1 * u, fill: '#ffffff', opacity: 0.16, strokeWidth: 0 }),
      text({ name: `${n} · Posizione`, binding: `st:${i}:pos`, text: '', left: m, top: textTop(top, f * 1.3), width: 70 * u, fontSize: f * 1.3, fontFamily: SERIF_FONT, fontStyle: 'italic', fontWeight: 600, lineHeight: 1.16 }),
      await image(LOGO_PLACEHOLDER, { name: `${n} · Logo`, binding: `stLogo:${i}`, cx: 160 * u, cy: top + rowH / 2, boxW: rowH * 0.7, boxH: rowH * 0.7 }),
      text({ name: `${n} · Squadra`, binding: `st:${i}:team`, keepCase: true, text: '', left: 200 * u, top: textTop(top, f), width: 450 * u, fontSize: f, fontWeight: 500, lineHeight: 1.16 }),
      ...cols.map((c) =>
        text({ name: `${n} · ${c.label}`, binding: `st:${i}:${c.field}`, text: '', left: (c.cx - 30) * u, top: textTop(top, f * 0.95), width: 60 * u, fontSize: f * 0.95, textAlign: 'center', opacity: 0.85, lineHeight: 1.16 }),
      ),
      new Rect({ id: uid(), name: `${n} · Box punti`, role: 'decor', binding: `stRow:${i}`, left: ptCx - 37 * u, top: top + rowH * 0.18, width: 74 * u, height: rowH * 0.64, rx: rowH * 0.32, ry: rowH * 0.32, fill: '#e11d48', strokeWidth: 0 }),
      text({ name: `${n} · PT`, binding: `st:${i}:pts`, text: '', left: ptCx - 37 * u, top: textTop(top, f * 1.1), width: 74 * u, fontSize: f * 1.1, fontFamily: SCORE_FONT, fontWeight: 700, textAlign: 'center', lineHeight: 1.16 }),
    );
  }
  return items;
}

/**
 * CLASSIFICA Foto: full-bleed photo, table without boxes packed on the left over a dark gradient,
 * heavy italic sans title, club + main sponsor logos top-right, up to 20 rows.
 */
async function buildStandingsPhoto(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;
  const ROWS = 20;
  const rowsTop = H * 0.165;
  const rowH = (H * 0.92 - rowsTop) / ROWS;
  const f = Math.min(25 * u, rowH * 0.5);
  const textTop = (rowTop: number, size: number) => rowTop + (rowH - size * 1.16) / 2;
  const cols: { field: string; label: string; cx: number; bold?: boolean }[] = [
    { field: 'played', label: 'G', cx: 532 },
    { field: 'won', label: 'V', cx: 584 },
    { field: 'drawn', label: 'N', cx: 636 },
    { field: 'lost', label: 'P', cx: 688 },
    { field: 'gd', label: 'DR', cx: 750 },
    { field: 'pts', label: 'PT', cx: 818, bold: true },
  ];
  const leftShade = new Rect({
    id: uid(),
    name: 'Sfumatura tabella',
    role: 'decor',
    left: 0,
    top: 0,
    width: W * 0.95,
    height: H,
    strokeWidth: 0,
    fill: new Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: W * 0.95, y2: 0 },
      colorStops: [
        { offset: 0, color: 'rgba(0,0,0,0.78)' },
        { offset: 0.6, color: 'rgba(0,0,0,0.55)' },
        { offset: 1, color: 'rgba(0,0,0,0)' },
      ],
    }),
  });
  const items: FabricObject[] = [
    makeDefaultBackground(W, H),
    leftShade,
    vignette(W, H, true, 0.5),
    vignette(W, H, false, 0.6),
    text({ name: 'Titolo', text: 'CLASSIFICA', left: 40 * u, top: H * 0.035, width: 820 * u, fontSize: 70 * u, fontFamily: 'Montserrat', fontWeight: 700, fontStyle: 'italic', charSpacing: 20, textAlign: 'center', lineHeight: 1 }),
    await image(LOGO_PLACEHOLDER, { name: 'Logo squadra', binding: 'clubLogo', cx: W * 0.795, cy: H * 0.068, boxW: 96 * u, boxH: 96 * u }),
    new Rect({ id: uid(), name: 'Divisore loghi', role: 'decor', left: W * 0.855, top: H * 0.068 - 34 * u, width: 2 * u, height: 68 * u, fill: '#ffffff', opacity: 0.7, strokeWidth: 0 }),
    await image(LOGO_PLACEHOLDER, { name: 'Main sponsor', binding: 'spMain', cx: W * 0.925, cy: H * 0.068, boxW: 120 * u, boxH: 80 * u }),
    ...cols.map((c) =>
      text({ name: `Intestazione ${c.label}`, text: c.label, left: (c.cx - 30) * u, top: H * 0.127 - 12 * u, width: 60 * u, fontSize: 22 * u, fontWeight: 700, textAlign: 'center' }),
    ),
  ];
  for (let i = 0; i < ROWS; i++) {
    const top = rowsTop + i * rowH;
    const n = `Riga ${i + 1}`;
    items.push(
      new Rect({ id: uid(), name: `${n} · Evidenziazione`, role: 'decor', binding: `stHi:${i}`, left: 30 * u, top: top + 2 * u, width: 830 * u, height: rowH - 4 * u, rx: 6 * u, ry: 6 * u, fill: '#e11d48', opacity: 0.85, strokeWidth: 0, visible: false }),
      text({ name: `${n} · Posizione`, binding: `st:${i}:pos`, text: '', left: 30 * u, top: textTop(top, f), width: 56 * u, fontSize: f, fontWeight: 700, textAlign: 'right', lineHeight: 1.16 }),
      text({ name: `${n} · Squadra`, binding: `st:${i}:team`, text: '', left: 100 * u, top: textTop(top, f), width: 390 * u, fontSize: f, fontWeight: 700, charSpacing: 10, lineHeight: 1.16 }),
      ...cols.map((c) =>
        text({ name: `${n} · ${c.label}`, binding: `st:${i}:${c.field}`, text: '', left: (c.cx - 30) * u, top: textTop(top, f), width: 60 * u, fontSize: f, fontWeight: c.bold ? 700 : 500, textAlign: 'center', lineHeight: 1.16 }),
      ),
    );
  }
  items.push(
    text({ name: 'Campionato', binding: 'leagueName', text: 'TERZA CATEGORIA · GIRONE A AVELLINO', left: 40 * u, top: H * 0.935, width: 680 * u, fontSize: 17 * u, fontWeight: 600, charSpacing: 160 }),
    text({ name: 'Ultimo aggiornamento', binding: 'standingsUpdated', keepCase: true, text: 'Aggiornata al …', left: 40 * u, top: H * 0.935 + 28 * u, width: 680 * u, fontSize: 17 * u, opacity: 0.75 }),
  );
  return items;
}

export interface BuiltinTemplateDef {
  id: string;
  kind: GraphicKind;
  name: string;
  build: (W: number, H: number) => Promise<FabricObject[]>;
}

/** Built-in templates. The first of each kind is the default. */
export const BUILTIN_TEMPLATES: BuiltinTemplateDef[] = [
  { id: BUILTIN_TEMPLATE_IDS.matchday, kind: 'matchday', name: 'MATCHDAY standard', build: buildMatchday },
  { id: 'builtin-matchday-editorial', kind: 'matchday', name: 'MATCHDAY Editoriale', build: buildEditorialMatchday },
  { id: 'builtin-matchday-elegant', kind: 'matchday', name: 'MATCHDAY Elegante', build: buildElegantMatchday },
  { id: BUILTIN_TEMPLATE_IDS.halftime, kind: 'halftime', name: 'HALF TIME standard', build: (W, H) => buildResult(W, H, 'halftime') },
  { id: BUILTIN_TEMPLATE_IDS.fulltime, kind: 'fulltime', name: 'FULL TIME standard', build: (W, H) => buildResult(W, H, 'fulltime') },
  { id: BUILTIN_TEMPLATE_IDS.postmatch, kind: 'postmatch', name: 'POST MATCH standard', build: buildPostMatch },
  { id: BUILTIN_TEMPLATE_IDS.standings, kind: 'standings', name: 'CLASSIFICA standard', build: buildStandings },
  { id: 'builtin-standings-modern', kind: 'standings', name: 'CLASSIFICA Moderna', build: buildStandingsModern },
  { id: 'builtin-standings-photo', kind: 'standings', name: 'CLASSIFICA Foto', build: buildStandingsPhoto },
];

type GroupRule = [group: string, match: (name: string) => boolean];
const names = (...list: string[]) => (n: string) => list.includes(n);

const HEADER: GroupRule = ['Intestazione', names('Giornata', 'Stadio', 'Località')];
const FADES: GroupRule = ['Sfumature', names('Sfumatura alto', 'Sfumatura basso')];
const TABLE: GroupRule = ['Classifica', (n) => n.startsWith('Riga ') || n.startsWith('Intestazione ')];
const LEAGUE_INFO: GroupRule = ['Campionato e aggiornamento', names('Campionato', 'Ultimo aggiornamento')];

/** Logical groups of each built-in template: click selects the group, double click a single element. */
const TEMPLATE_GROUPS: Record<string, GroupRule[]> = {
  'builtin-matchday': [HEADER, FADES, ['Loghi squadre', names('Logo casa', 'Divisore', 'Logo ospite')], ['Data e orario', names('Data', 'Orario')]],
  'builtin-halftime': [
    HEADER,
    FADES,
    ['Squadra casa', names('Logo casa', 'Nome casa')],
    ['Squadra ospite', names('Logo ospite', 'Nome ospite')],
    ['Marcatori', names('Linea', 'Marcatori casa', 'Marcatori ospite')],
    ['Data e orario', names('Data', 'Orario')],
  ],
  'builtin-fulltime': [
    HEADER,
    FADES,
    ['Squadra casa', names('Logo casa', 'Nome casa')],
    ['Squadra ospite', names('Logo ospite', 'Nome ospite')],
    ['Risultato', names('Risultato', 'Rigori')],
    ['Marcatori', names('Linea', 'Marcatori casa', 'Marcatori ospite')],
    ['Data e orario', names('Data', 'Orario')],
  ],
  'builtin-postmatch': [
    HEADER,
    ['Risultato', names('Logo casa', 'Logo ospite', 'Risultato', 'Rigori')],
    ['Marcatori', names('Marcatori casa', 'Marcatori ospite')],
    ['Migliore in campo', names('Etichetta MVP', 'MVP')],
  ],
  'builtin-matchday-editorial': [
    FADES,
    ['Squadre', names('Logo casa', 'Barra /', 'Logo ospite', 'Nome casa', 'Nome ospite')],
    ['Data e stadio', names('Data', 'Stadio')],
    ['Kick off', names('Etichetta kick off', 'Orario')],
  ],
  'builtin-matchday-elegant': [
    FADES,
    ['Info in alto', names('Stadio (alto)', 'Data (alto)')],
    ['Loghi squadre', names('Logo casa', 'Logo ospite')],
    ['Info in basso', names('Data (basso)', 'Etichetta kick-off', 'Orario', 'Stadio (basso)')],
  ],
  'builtin-standings': [FADES, TABLE, ['Titolo e campionato', names('Titolo', 'Campionato')]],
  'builtin-standings-modern': [FADES, TABLE, ['Titolo e info', names('Titolo', 'Campionato', 'Ultimo aggiornamento', 'Linea titolo')]],
  'builtin-standings-photo': [FADES, TABLE, LEAGUE_INFO, ['Loghi in alto', names('Logo squadra', 'Divisore loghi', 'Main sponsor')]],
};

function applyGroups(templateId: string, objs: FabricObject[]): number {
  let made = 0;
  for (const [group, match] of TEMPLATE_GROUPS[templateId] ?? []) {
    const members = objs.filter((o) => !o.groupId && o.role !== 'background' && match(o.name ?? ''));
    if (members.length < 2) continue;
    const gid = uid();
    for (const o of members) {
      o.groupId = gid;
      o.groupName = group;
    }
    made++;
  }
  return made;
}

/**
 * Adds the template's groups to a graphic created before groups existed.
 * Uses the graphic's template, or the built-in template whose element names match best.
 */
export function autoGroup(templateId: string | null, objs: FabricObject[]): number {
  if (objs.some((o) => o.groupId)) return 0;
  let id = templateId && TEMPLATE_GROUPS[templateId] ? templateId : null;
  if (!id) {
    let best = 0;
    for (const [tid, rules] of Object.entries(TEMPLATE_GROUPS)) {
      const score = objs.filter((o) => rules.some(([, match]) => match(o.name ?? ''))).length;
      if (score > best) {
        best = score;
        id = tid;
      }
    }
  }
  return id ? applyGroups(id, objs) : 0;
}

/** Builds a built-in template (falls back to the kind's default) as canvas JSON. */
export async function buildBuiltinJSON(id: string, kind: GraphicKind, format: FormatSpec): Promise<any> {
  const def =
    BUILTIN_TEMPLATES.find((t) => t.id === id && t.kind === kind) ?? BUILTIN_TEMPLATES.find((t) => t.id === BUILTIN_TEMPLATE_IDS[kind])!;
  const objs = await def.build(format.width, format.height);
  applyGroups(def.id, objs);
  return {
    version: '6',
    background: '#000000',
    objects: objs.map((o) => o.toObject(CUSTOM_PROPS)),
  };
}

/** Builds the default layout for a graphic kind as canvas JSON. */
export function buildDefaultJSON(kind: GraphicKind, format: FormatSpec): Promise<any> {
  return buildBuiltinJSON(BUILTIN_TEMPLATE_IDS[kind], kind, format);
}
