import { FabricImage, Rect, Shadow, Textbox, filters, type FabricObject } from 'fabric';
import { getAssetUrl } from '../services/assets';
import { uid } from '../services/database';
import { SANS_FONT, SERIF_FONT } from '../services/fonts';
import type { Sponsor } from '../types';
import { fitImageToBox } from './geometry';
import { MISSING_PLACEHOLDER } from './serialization';

/** Visual treatment of sponsor logos. */
export type SponsorStyle = 'cards' | 'white' | 'strip';
export type SponsorBlock = 'bar' | 'main' | 'powered' | 'grid';

export const SPONSOR_STYLE_LABELS: Record<SponsorStyle, string> = {
  cards: 'Card bianche',
  white: 'Monocromatico bianco',
  strip: 'Striscia chiara',
};

export const SPONSOR_BLOCK_LABELS: Record<SponsorBlock, string> = {
  bar: 'Barra sponsor',
  main: 'Main sponsor',
  powered: 'Powered by',
  grid: 'Griglia partner',
};

interface Ctx {
  W: number;
  H: number;
  sponsors: Sponsor[];
  style: SponsorStyle;
  position: 'top' | 'bottom';
  /** Sponsors per row (null = automatic). Fewer per row = bigger logos. */
  perRow?: number | null;
  /** Main sponsor alone on its own (bigger) row. */
  mainRow?: boolean;
}

/** Splits sponsors into rows: optional main sponsor row, then rows of `perRow`. */
export function sponsorRows(sponsors: Sponsor[], perRow: number | null | undefined, mainRow: boolean, autoMax: number): Sponsor[][] {
  const rows: Sponsor[][] = [];
  let rest = sponsors;
  if (mainRow && sponsors.length > 1 && sponsors[0].tier === 'main') {
    rows.push([sponsors[0]]);
    rest = sponsors.slice(1);
  }
  const n = perRow && perRow > 0 ? perRow : rest.length <= autoMax ? Math.max(1, rest.length) : Math.ceil(rest.length / Math.ceil(rest.length / autoMax));
  for (let i = 0; i < rest.length; i += n) rows.push(rest.slice(i, i + n));
  return rows;
}

/** Human description, e.g. "main + 2 righe da 4". */
export function describeRows(sponsors: Sponsor[], perRow: number | null | undefined, mainRow: boolean, block: 'bar' | 'grid'): string {
  const hasMainRow = mainRow && sponsors.length > 1 && sponsors[0]?.tier === 'main';
  const gridAuto = sponsors.length - (hasMainRow ? 1 : 0) <= 4 ? 2 : 3;
  const rows = sponsorRows(sponsors, perRow ?? (block === 'grid' ? gridAuto : null), mainRow, 8);
  const others = hasMainRow ? rows.slice(1) : rows;
  const sizes = others.map((r) => r.length);
  const desc = sizes.length === 1 ? `1 riga da ${sizes[0]}` : `${sizes.length} righe da ${Math.max(...sizes)}${sizes[sizes.length - 1] !== sizes[0] ? ` (l’ultima da ${sizes[sizes.length - 1]})` : ''}`;
  return `${sponsors.length} sponsor → ${hasMainRow ? 'main + ' : ''}${desc}`;
}

function label(text: string, o: { left: number; top: number; width: number; size: number; color?: string; align?: 'left' | 'center' | 'right'; opacity?: number }): Textbox {
  return new Textbox(text, {
    id: uid(),
    name: `Sponsor · ${text}`,
    role: 'element',
    left: o.left,
    top: o.top,
    width: o.width,
    fontSize: o.size,
    fontFamily: SANS_FONT,
    fontWeight: 600,
    charSpacing: 300,
    fill: o.color ?? '#ffffff',
    textAlign: o.align ?? 'center',
    opacity: o.opacity ?? 0.75,
  } as any);
}

function card(name: string, binding: string | undefined, left: number, top: number, width: number, height: number, u: number): Rect {
  return new Rect({
    id: uid(),
    name,
    role: 'decor',
    binding,
    left,
    top,
    width,
    height,
    rx: 12 * u,
    ry: 12 * u,
    fill: '#ffffff',
    strokeWidth: 0,
    shadow: new Shadow({ color: 'rgba(0,0,0,0.35)', blur: 18 * u, offsetX: 0, offsetY: 6 * u }),
  });
}

async function logo(binding: string, assetId: string | null, cx: number, cy: number, boxW: number, boxH: number, white: boolean, name: string): Promise<FabricImage> {
  const url = (await getAssetUrl(assetId)) ?? MISSING_PLACEHOLDER;
  const img = await FabricImage.fromURL(url);
  img.set({ id: uid(), name, role: 'element', binding, assetId, boxW, boxH, fitMode: 'contain', originX: 'center', originY: 'center', left: cx, top: cy });
  fitImageToBox(img, boxW, boxH, 'contain');
  if (white) {
    img.filters = [new filters.BlendColor({ color: '#ffffff', mode: 'tint', alpha: 1 })];
    img.applyFilters();
  }
  return img;
}

/** Sponsor bar (top or bottom): one or more rows, all sponsors of a row with the same size. */
async function bar(c: Ctx): Promise<FabricObject[]> {
  const { W, H, style } = c;
  const u = W / 1080;
  const list = c.sponsors;
  const rows = sponsorRows(list, c.perRow, !!c.mainRow, 8);
  const perRow = Math.max(...rows.map((r) => r.length), 1);
  const singleAuto = !c.perRow && rows.length === 1;
  const margin = 48 * u;
  const gap = 14 * u;
  const avail = W - margin * 2;
  const unitW = (avail - gap * (perRow - 1)) / perRow;
  // Row height follows the slot width (fewer per row -> bigger logos), within sensible limits.
  const rowH = Math.min(Math.max(unitW * 0.42, 70 * u), 150 * u);
  const isMainRow = (r: Sponsor[]) => r.length === 1 && r[0].tier === 'main' && rows.length > 1 && !!c.mainRow;
  const heights = rows.map((r) => (isMainRow(r) ? Math.min(rowH * 1.35, 170 * u) : rowH));
  const labelH = 40 * u;
  const bandH = labelH + heights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1) + 16 * u;
  const top = c.position === 'bottom' ? H - bandH : 0;
  const dark = style !== 'strip';
  const out: FabricObject[] = [
    new Rect({ id: uid(), name: 'Sponsor · Fascia', role: 'decor', left: 0, top, width: W, height: bandH, fill: dark ? '#000000' : '#ffffff', opacity: dark ? 0.62 : 0.96, strokeWidth: 0 }),
    new Rect({ id: uid(), name: 'Sponsor · Filetto', role: 'decor', left: 0, top: c.position === 'bottom' ? top : top + bandH - 3 * u, width: W, height: 3 * u, fill: '#e11d48', strokeWidth: 0 }),
    label('SPONSOR UFFICIALI', { left: 0, top: top + 14 * u, width: W, size: 13 * u, color: dark ? '#ffffff' : '#111111', opacity: dark ? 0.7 : 0.6 }),
  ];
  let y = top + labelH;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const h = heights[r];
    // Single automatic row keeps the wider main sponsor slot; otherwise uniform slots.
    const weights = row.map((s) => (singleAuto && s.tier === 'main' ? 1.6 : isMainRow(row) ? Math.min(2.4, perRow) : 1));
    let widths = weights.map((w) => unitW * w + gap * (w - 1));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    if (total > avail) widths = widths.map((w) => (w * (avail - gap * (row.length - 1))) / (total - gap * (row.length - 1)));
    const rowW = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    let x = (W - rowW) / 2;
    for (let k = 0; k < row.length; k++) {
      const s = row[k];
      const i = list.indexOf(s);
      const w = widths[k];
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (style === 'cards') {
        out.push(card(`Sponsor · Card ${i + 1}`, `spSlot:${i}`, x, y, w, h, u));
        out.push(await logo(`sp:${i}`, s.assetId, cx, cy, w * 0.84, h * 0.74, false, `Sponsor · ${s.name}`));
      } else {
        if (k > 0) {
          out.push(new Rect({ id: uid(), name: `Sponsor · Divisore ${i}`, role: 'decor', binding: `spSlot:${i}`, left: x - gap / 2 - 1 * u, top: y + h * 0.15, width: 2 * u, height: h * 0.7, fill: dark ? '#ffffff' : '#111111', opacity: 0.25, strokeWidth: 0 }));
        }
        out.push(await logo(`sp:${i}`, s.assetId, cx, cy, w * 0.86, h * 0.8, style === 'white', `Sponsor · ${s.name}`));
      }
      x += w + gap;
    }
    y += h + gap;
  }
  return out;
}

/** Main sponsor badge: label + large logo. */
async function main(c: Ctx): Promise<FabricObject[]> {
  const { W, H, style } = c;
  const u = W / 1080;
  const s = c.sponsors.find((x) => x.tier === 'main') ?? c.sponsors[0];
  const boxW = 340 * u;
  const boxH = 130 * u;
  const cx = W / 2;
  const cy = c.position === 'bottom' ? H - 150 * u : 190 * u;
  const out: FabricObject[] = [label('MAIN SPONSOR', { left: cx - 250 * u, top: cy - boxH / 2 - 34 * u, width: 500 * u, size: 14 * u })];
  if (style === 'cards' || style === 'strip') out.push(card('Sponsor · Card main', undefined, cx - boxW / 2 - 18 * u, cy - boxH / 2 - 10 * u, boxW + 36 * u, boxH + 20 * u, u));
  out.push(await logo('spMain', s?.assetId ?? null, cx, cy, boxW, boxH, style === 'white', `Sponsor · ${s?.name ?? 'Main'}`));
  return out;
}

/** "powered by" lockup for a corner. */
async function powered(c: Ctx): Promise<FabricObject[]> {
  const { W, H, style } = c;
  const u = W / 1080;
  const s = c.sponsors.find((x) => x.tier === 'main') ?? c.sponsors[0];
  const boxW = 190 * u;
  const boxH = 76 * u;
  const right = W - 56 * u;
  const cy = c.position === 'bottom' ? H - 70 * u : 70 * u;
  const out: FabricObject[] = [
    new Textbox('powered by', {
      id: uid(),
      name: 'Sponsor · powered by',
      role: 'element',
      left: right - boxW - 190 * u,
      top: cy - 16 * u,
      width: 170 * u,
      fontSize: 24 * u,
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fill: '#ffffff',
      textAlign: 'right',
      opacity: 0.85,
    } as any),
  ];
  if (style === 'cards' || style === 'strip') out.push(card('Sponsor · Card powered', undefined, right - boxW - 12 * u, cy - boxH / 2 - 8 * u, boxW + 24 * u, boxH + 16 * u, u));
  out.push(await logo('spMain', s?.assetId ?? null, right - boxW / 2, cy, boxW, boxH, style === 'white', `Sponsor · ${s?.name ?? 'Main'}`));
  return out;
}

/** Sponsor wall: title, main sponsor on top (optional), the others in rows of `perRow`. */
async function grid(c: Ctx): Promise<FabricObject[]> {
  const { W, H, style } = c;
  const u = W / 1080;
  const out: FabricObject[] = [
    new Textbox('I nostri partner', {
      id: uid(),
      name: 'Sponsor · Titolo',
      role: 'element',
      left: 0,
      top: H * 0.05,
      width: W,
      fontSize: 120 * u,
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontWeight: 600,
      fill: '#ffffff',
      textAlign: 'center',
      lineHeight: 1,
    } as any),
    label('SPONSOR UFFICIALI · STAGIONE 2026/27', { left: 0, top: H * 0.05 + 150 * u, width: W, size: 16 * u }),
  ];
  const list = c.sponsors;
  const mainRow = c.mainRow !== false;
  const auto = (n: number) => (n <= 4 ? 2 : 3);
  const hasMain = mainRow && list.length > 1 && list[0].tier === 'main';
  const rows = sponsorRows(list, c.perRow ?? auto(list.length - (hasMain ? 1 : 0)), mainRow, 3);
  const perRow = Math.max(...rows.slice(hasMain ? 1 : 0).map((r) => r.length), 1);
  const margin = 70 * u;
  const gap = 26 * u;
  const top0 = H * 0.25;
  const bottom = H * 0.93;
  const cellW = (W - margin * 2 - gap * (perRow - 1)) / perRow;
  const mainH = hasMain ? 210 * u : 0;
  const nRows = rows.length - (hasMain ? 1 : 0);
  const space = bottom - top0 - (hasMain ? mainH + gap : 0) - gap * Math.max(0, nRows - 1);
  const cellH = Math.max(60 * u, Math.min(cellW * 0.62, space / Math.max(1, nRows)));
  let y = top0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isMain = hasMain && r === 0;
    const h = isMain ? mainH : cellH;
    const w = isMain ? W - margin * 2 : cellW;
    const rowW = isMain ? w : row.length * cellW + gap * (row.length - 1);
    let x = (W - rowW) / 2; // centre incomplete rows
    for (const s of row) {
      const i = list.indexOf(s);
      if (style !== 'white') out.push(card(`Sponsor · Card ${i + 1}`, `spSlot:${i}`, x, y, w, h, u));
      out.push(await logo(`sp:${i}`, s.assetId, x + w / 2, y + h / 2, isMain ? w * 0.6 : w * 0.78, h * 0.7, style === 'white', `Sponsor · ${s.name}`));
      x += w + gap;
    }
    y += h + gap;
  }
  return out;
}

export async function buildSponsorBlock(block: SponsorBlock, ctx: Ctx): Promise<FabricObject[]> {
  if (block === 'bar') return bar(ctx);
  if (block === 'main') return main(ctx);
  if (block === 'powered') return powered(ctx);
  return grid(ctx);
}
