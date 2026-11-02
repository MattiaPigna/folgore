import '../assets/fonts/fonts.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/playfair-display/600-italic.css';
import '@fontsource/playfair-display/700-italic.css';
import '@fontsource/mrs-saint-delafield/400.css';
import '@fontsource/great-vibes/400.css';
import '@fontsource/allura/400.css';
import '@fontsource/alex-brush/400.css';
import '@fontsource/barlow/300.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/600.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/bebas-neue/400.css';
import { cache } from 'fabric';
import { db } from './database';
import type { FontRecord } from '../types';

export const SCRIPT_FONT = 'Hearth Stone';
export const SANS_FONT = 'Barlow';
export const SCORE_FONT = 'Barlow Condensed';
export const SERIF_FONT = 'Playfair Display';

export const BUILTIN_FONTS: { family: string; category: 'Calligrafico' | 'Serif' | 'Sans-serif' | 'Display' }[] = [
  { family: 'Hearth Stone', category: 'Calligrafico' },
  { family: 'Ruthligos', category: 'Calligrafico' },
  { family: 'Bacalisties', category: 'Calligrafico' },
  { family: 'Hattinand', category: 'Calligrafico' },
  { family: 'Mrs Saint Delafield', category: 'Calligrafico' },
  { family: 'Great Vibes', category: 'Calligrafico' },
  { family: 'Allura', category: 'Calligrafico' },
  { family: 'Alex Brush', category: 'Calligrafico' },
  { family: 'Playfair Display', category: 'Serif' },
  { family: 'Barlow', category: 'Sans-serif' },
  { family: 'Barlow Condensed', category: 'Sans-serif' },
  { family: 'Inter', category: 'Sans-serif' },
  { family: 'Montserrat', category: 'Sans-serif' },
  { family: 'Oswald', category: 'Display' },
  { family: 'Bebas Neue', category: 'Display' },
];

const loadedCustom = new Map<string, FontFace>();

export async function registerCustomFont(rec: FontRecord): Promise<void> {
  if (loadedCustom.has(rec.id)) return;
  const asset = await db.get('assets', rec.assetId);
  if (!asset) throw new Error(`File del font "${rec.family}" mancante.`);
  const buf = await asset.blob.arrayBuffer();
  const face = new FontFace(rec.family, buf);
  await face.load();
  document.fonts.add(face);
  loadedCustom.set(rec.id, face);
}

export function unregisterCustomFont(id: string): void {
  const face = loadedCustom.get(id);
  if (face) {
    document.fonts.delete(face);
    loadedCustom.delete(id);
  }
}

/** Waits for every bundled font weight so Fabric measures text with the real glyphs. */
export async function ensureBuiltinFonts(): Promise<void> {
  const specs: string[] = [];
  for (const f of BUILTIN_FONTS) {
    specs.push(`400 40px "${f.family}"`);
    specs.push(`700 40px "${f.family}"`);
  }
  specs.push(`300 40px "Barlow"`, `500 40px "Barlow"`, `600 40px "Barlow"`, `600 40px "Barlow Condensed"`);
  specs.push(`italic 400 40px "Playfair Display"`, `italic 600 40px "Playfair Display"`, `italic 700 40px "Playfair Display"`);
  await Promise.all(specs.map((s) => document.fonts.load(s, 'AaÀ0').catch(() => undefined)));
  cache.clearFontCache();
}

/** Ensures the families used in a canvas JSON are loaded before rendering it. */
export async function ensureFontsFor(families: Iterable<string>): Promise<void> {
  const list = [...new Set(families)].filter(Boolean);
  await Promise.all(
    list.flatMap((f) => [`400 40px "${f}"`, `700 40px "${f}"`, `italic 400 40px "${f}"`, `italic 600 40px "${f}"`, `italic 700 40px "${f}"`].map((s) => document.fonts.load(s, 'Aa0').catch(() => undefined))),
  );
}

export function collectFonts(json: any): string[] {
  const out: string[] = [];
  const walk = (objs: any[] | undefined) => {
    for (const o of objs ?? []) {
      if (o.fontFamily) out.push(o.fontFamily);
      if (o.objects) walk(o.objects);
    }
  };
  walk(json?.objects);
  return out;
}
