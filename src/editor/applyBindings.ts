import { FabricImage, Textbox, type StaticCanvas } from 'fabric';
import { getAssetUrl } from '../services/assets';
import {
  imageAssetFor,
  isImageBinding,
  isLeagueBinding,
  isVisibilityBinding,
  resolveLeagueText,
  resolveText,
  resolveVisibility,
  type TextBinding,
} from '../services/bindings';
import type { GraphicKind, Match, Settings } from '../types';
import { fitImageToBox } from './geometry';
import { applyTextCase } from './textCase';
import { placeholderFor } from './serialization';

/**
 * Pushes match data into bound objects. Only content (text / image source) changes:
 * position, box size and style chosen by the user are preserved.
 * Returns true when something changed.
 */
export async function applyBindings(
  canvas: StaticCanvas,
  match: Match,
  kind: GraphicKind,
  settings: Settings,
): Promise<boolean> {
  let changed = false;
  const jobs: Promise<void>[] = [];
  for (const obj of canvas.getObjects()) {
    const b = obj.binding;
    if (!b) continue;
    if (isVisibilityBinding(b)) {
      const vis = resolveVisibility(b, settings);
      if (obj.visible !== vis) {
        obj.set('visible', vis);
        changed = true;
      }
      continue;
    }
    if (obj instanceof Textbox) {
      if (obj.autoText === false || isImageBinding(b)) continue;
      const st = obj.keepCase ? { ...settings, uppercaseInfo: false } : settings;
      const raw = isLeagueBinding(b) ? resolveLeagueText(b, st) : resolveText(b as TextBinding, match, kind, st);
      const text = applyTextCase(raw, obj.textCase);
      if (obj.text !== text) {
        obj.set('text', text);
        obj.initDimensions();
        obj.setCoords();
        changed = true;
      }
    } else if (obj instanceof FabricImage && isImageBinding(b)) {
      const wanted = imageAssetFor(b, match, settings);
      if (b.startsWith('stLogo:') || b.startsWith('sp:') || b === 'spMain' || b === 'clubLogo') {
        // Standings / sponsor logos: hidden when missing (no placeholder).
        const vis = !!wanted;
        if (obj.visible !== vis) {
          obj.set('visible', vis);
          changed = true;
        }
        if (!wanted) continue;
      }
      if ((obj.assetId ?? null) === wanted) continue;
      changed = true;
      jobs.push(
        (async () => {
          const url = (await getAssetUrl(wanted)) ?? placeholderFor(b);
          const boxW = obj.boxW || obj.getScaledWidth();
          const boxH = obj.boxH || obj.getScaledHeight();
          try {
            await obj.setSrc(url);
          } catch {
            await obj.setSrc(placeholderFor(b));
          }
          obj.assetId = wanted;
          obj.boxW = boxW;
          obj.boxH = boxH;
          fitImageToBox(obj, boxW, boxH, obj.fitMode ?? 'contain');
        })(),
      );
    }
  }
  await Promise.all(jobs);
  if (changed) canvas.requestRenderAll();
  return changed;
}
