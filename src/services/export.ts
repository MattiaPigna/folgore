import JSZip from 'jszip';
import { renderStored, templateJSON } from '../editor/render';
import type { GraphicDoc, GraphicKind, Match, Settings, Template } from '../types';
import { GRAPHIC_KINDS, KIND_LABELS } from '../types';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'partita'
  );
}

export function matchSlug(m: Match): string {
  return slugify(`${m.homeName || 'casa'}-${m.awayName || 'ospite'}${m.date ? '-' + m.date : ''}`);
}

export function fileNameFor(m: Match, kind: GraphicKind, type: 'png' | 'jpeg'): string {
  return `${matchSlug(m)}_${slugify(KIND_LABELS[kind])}.${type === 'jpeg' ? 'jpg' : 'png'}`;
}

/** Returns the saved graphic, or builds it from the match's chosen template. */
export async function ensureGraphic(match: Match, kind: GraphicKind, templates: Template[], settings: Settings): Promise<GraphicDoc> {
  const existing = match.graphics[kind];
  if (existing) return existing;
  const templateId = match.templateIds?.[kind] ?? settings.defaultTemplates[kind];
  const tpl = templates.find((t) => t.id === templateId);
  const format = tpl?.format ?? match.format ?? settings.defaultFormat;
  return { format, json: await templateJSON(templateId, kind, format, templates), templateId, updatedAt: Date.now() };
}

export async function renderGraphicBlob(
  match: Match,
  kind: GraphicKind,
  doc: GraphicDoc,
  settings: Settings,
  type: 'png' | 'jpeg',
): Promise<Blob> {
  const dataUrl = await renderStored(doc.json, { format: doc.format, match, kind, settings, type, quality: settings.jpgQuality });
  return (await fetch(dataUrl)).blob();
}

export async function exportZip(
  match: Match,
  templates: Template[],
  settings: Settings,
  type: 'png' | 'jpeg',
  overrides: Partial<Record<GraphicKind, GraphicDoc>> = {},
  kinds: GraphicKind[] = GRAPHIC_KINDS,
): Promise<void> {
  const zip = new JSZip();
  for (const kind of kinds) {
    const doc = overrides[kind] ?? (await ensureGraphic(match, kind, templates, settings));
    const blob = await renderGraphicBlob(match, kind, doc, settings, type);
    zip.file(fileNameFor(match, kind, type), blob);
  }
  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  downloadBlob(out, `${matchSlug(match)}_grafiche.zip`);
}
