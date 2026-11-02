import { StaticCanvas } from 'fabric';
import { collectFonts, ensureFontsFor } from '../services/fonts';
import type { FormatSpec, GraphicKind, Match, Settings, Template } from '../types';
import { applyBindings } from './applyBindings';
import { adaptObjects } from './geometry';
import { CUSTOM_PROPS } from './fabricSetup';
import { buildBuiltinJSON, buildDefaultJSON, isBuiltinTemplate, makeDefaultBackground } from './layouts';
import { canvasToRaw, hydrate, toStored } from './serialization';

export interface RenderOptions {
  format: FormatSpec;
  match?: Match;
  kind?: GraphicKind;
  settings?: Settings;
  type?: 'png' | 'jpeg';
  quality?: number;
  /** Output scale (1 = exact pixel size of the format). */
  multiplier?: number;
}

async function withStaticCanvas<T>(width: number, height: number, fn: (c: StaticCanvas) => Promise<T>): Promise<T> {
  const el = document.createElement('canvas');
  const c = new StaticCanvas(el, { width, height, enableRetinaScaling: false, renderOnAddRemove: false });
  try {
    return await fn(c);
  } finally {
    c.dispose();
  }
}

/** Renders stored graphic JSON offscreen at the exact format size. */
export async function renderStored(stored: any, o: RenderOptions): Promise<string> {
  const { width, height } = o.format;
  return withStaticCanvas(width, height, async (c) => {
    await ensureFontsFor(collectFonts(stored));
    await c.loadFromJSON(await hydrate(stored));
    if (o.match && o.kind && o.settings) await applyBindings(c, o.match, o.kind, o.settings);
    c.renderAll();
    return c.toDataURL({ format: o.type ?? 'png', quality: o.quality ?? 0.95, multiplier: o.multiplier ?? 1 });
  });
}

/** Converts stored JSON from one format to another by adapting object positions. */
export async function adaptStored(stored: any, from: FormatSpec, to: FormatSpec): Promise<any> {
  if (from.width === to.width && from.height === to.height) return stored;
  return withStaticCanvas(to.width, to.height, async (c) => {
    await c.loadFromJSON(await hydrate(stored));
    adaptObjects(c, from.width, from.height, to.width, to.height);
    return toStored(canvasToRaw(c));
  });
}

/** Produces the stored JSON for a template at a given format. */
export async function templateJSON(templateId: string, kind: GraphicKind, format: FormatSpec, templates: Template[]): Promise<any> {
  if (isBuiltinTemplate(templateId)) {
    return buildBuiltinJSON(templateId, kind, format);
  }
  const t = templates.find((x) => x.id === templateId);
  if (!t || !t.json) return buildDefaultJSON(kind, format);
  return adaptStored(t.json, t.format, format);
}

/**
 * Replaces the layout with a template while keeping the current background image
 * (the template's own background is used only if it carries one).
 */
export function mergeBackground(templateStored: any, currentStored: any | null): any {
  if (!currentStored) return templateStored;
  const curBg = currentStored.objects?.find((o: any) => o.role === 'background');
  const tplBgIdx = templateStored.objects?.findIndex((o: any) => o.role === 'background') ?? -1;
  if (!curBg || curBg.type?.toLowerCase() !== 'image') return templateStored;
  const tplBg = tplBgIdx >= 0 ? templateStored.objects[tplBgIdx] : null;
  if (tplBg && tplBg.type?.toLowerCase() === 'image') return templateStored;
  const out = structuredClone(templateStored);
  if (tplBgIdx >= 0) out.objects[tplBgIdx] = curBg;
  else out.objects.unshift(curBg);
  return out;
}

/** Strips the uploaded background photo from stored JSON, replacing it with the default one. */
export function withoutBackgroundImage(stored: any, format: FormatSpec): any {
  const out = structuredClone(stored);
  const idx = out.objects.findIndex((o: any) => o.role === 'background');
  if (idx >= 0 && out.objects[idx].type?.toLowerCase() === 'image') {
    out.objects[idx] = makeDefaultBackground(format.width, format.height).toObject(CUSTOM_PROPS);
  }
  return out;
}
