import { FabricImage, Textbox, type StaticCanvas } from 'fabric';
import { getAssetUrl } from '../services/assets';
import { GOAL_BINDING_LABELS, imageAssetFor, isGoalBinding, isImageBinding, resolveGoalText, type GoalBinding, type ImageBinding } from '../services/bindings';
import type { Match, Settings } from '../types';
import { fitImageToBox } from './geometry';
import { placeholderFor } from './serialization';
import { applyTextCase } from './textCase';

export { GOAL_BINDING_LABELS };

/** Most recently scored goal of the match, or null if there are none yet. */
export function latestGoalId(match: Match): string | null {
  if (!match.goals.length) return null;
  const sorted = [...match.goals].sort((a, b) => a.minute - b.minute || (a.stoppage || 0) - (b.stoppage || 0));
  return sorted[sorted.length - 1].id;
}

/** Shown while editing the template before the match has a real goal to bind to. */
const SAMPLE_GOAL_TEXT: Record<GoalBinding, string> = {
  'goal:scorer': 'Mario Rossi',
  'goal:minute': "34'",
  'goal:teamName': 'LA TUA SQUADRA',
  'goal:scoreAfter': '1 - 0',
  'goal:topLabel': '1ª GIORNATA',
};

/** Resolves a `goal:*` binding for preview/insertion, falling back to sample text when there's no real goal yet. */
export function previewGoalText(binding: GoalBinding, match: Match, goalId: string | null, settings: Settings): string {
  if (!goalId) return SAMPLE_GOAL_TEXT[binding];
  return resolveGoalText(binding, match, goalId, settings) || SAMPLE_GOAL_TEXT[binding];
}

/**
 * Pushes goal-specific data (plus the reused match-level homeName/awayName/logos/sponsor bindings)
 * into the bound objects of a goal-video canvas. `goalId` null = sample/placeholder data for editing
 * the template before the match has a real goal. Returns true if anything changed (so callers like
 * `EditorController.batch` can skip recording a no-op undo step).
 */
export async function applyGoalBindings(canvas: StaticCanvas, match: Match, goalId: string | null, settings: Settings): Promise<boolean> {
  const up = (s: string) => (settings.uppercaseInfo ? s.toUpperCase() : s);
  let changed = false;
  const jobs: Promise<void>[] = [];
  for (const obj of canvas.getObjects()) {
    const b = obj.binding;
    if (!b) continue;
    if (obj instanceof Textbox) {
      if (obj.autoText === false) continue;
      let text: string | null = null;
      if (isGoalBinding(b)) text = previewGoalText(b, match, goalId, settings);
      else if (b === 'homeName') text = up(match.homeName);
      else if (b === 'awayName') text = up(match.awayName);
      if (text === null) continue;
      text = applyTextCase(text, obj.textCase);
      if (obj.text !== text) {
        obj.set('text', text);
        obj.initDimensions();
        obj.setCoords();
        changed = true;
      }
      continue;
    }
    if (obj instanceof FabricImage && isImageBinding(b)) {
      const wanted = imageAssetFor(b as ImageBinding, match, settings);
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
