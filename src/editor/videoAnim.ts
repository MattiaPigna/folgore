import { FabricObject, Point, Textbox } from 'fabric';

/**
 * Entrance animation presets for goal-video elements. Each preset computes an "entering" state
 * (hidden/offset) and animates to the object's rest state (what the editing canvas shows).
 */
export type AnimPreset = 'none' | 'fade' | 'fromBottom' | 'fromTop' | 'fromLeft' | 'fromRight' | 'pop' | 'typewriter';

export interface AnimConfig {
  preset: AnimPreset;
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds the entrance animation takes. */
  duration: number;
}

export const DEFAULT_ANIM: AnimConfig = { preset: 'none', start: 0, duration: 0.5 };

export const ANIM_PRESET_LABELS: Record<AnimPreset, string> = {
  none: 'Nessuna',
  fade: 'Dissolvenza',
  fromBottom: 'Scorri dal basso',
  fromTop: "Scorri dall'alto",
  fromLeft: 'Scorri da sinistra',
  fromRight: 'Scorri da destra',
  pop: 'Pop (scala)',
  typewriter: 'Scrittura a macchina',
};

export const ANIM_PRESETS = Object.keys(ANIM_PRESET_LABELS) as AnimPreset[];

export interface AnimSnapshot {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** Object centre at rest, used to scale presets around a fixed centre regardless of origin. */
  cx: number;
  cy: number;
  /** Full text at rest, captured for the 'typewriter' preset (undefined for non-text objects). */
  text?: string;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

const EASE_FOR: Record<AnimPreset, (p: number) => number> = {
  none: (p) => p,
  fade: easeOut,
  fromBottom: easeOut,
  fromTop: easeOut,
  fromLeft: easeOut,
  fromRight: easeOut,
  pop: easeBack,
  typewriter: (p) => p,
};

/** Rest state (what the editing canvas shows) captured once before animating frames. */
export function restSnapshot(obj: FabricObject): AnimSnapshot {
  const c = obj.getCenterPoint();
  return {
    left: obj.left ?? 0,
    top: obj.top ?? 0,
    scaleX: obj.scaleX ?? 1,
    scaleY: obj.scaleY ?? 1,
    opacity: obj.opacity ?? 1,
    cx: c.x,
    cy: c.y,
    text: obj instanceof Textbox ? obj.text : undefined,
  };
}

function setToRest(obj: FabricObject, rest: AnimSnapshot): void {
  obj.set({ left: rest.left, top: rest.top, scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity });
  if (rest.text !== undefined && obj instanceof Textbox && obj.text !== rest.text) {
    obj.set('text', rest.text);
    obj.initDimensions();
  }
  obj.setCoords();
}

/**
 * Applies the object's entrance animation at time t (seconds). Stateless given (obj, rest, t), so the
 * same rest snapshot can drive both the scrubbing preview and the frame-by-frame MP4 export.
 */
export function applyAnimFrame(obj: FabricObject, rest: AnimSnapshot, t: number, unit = 1): void {
  const anim = obj.anim ?? DEFAULT_ANIM;
  if (anim.preset === 'none' || anim.duration <= 0) {
    setToRest(obj, rest);
    return;
  }
  const p = clamp((t - anim.start) / anim.duration);
  const e = EASE_FOR[anim.preset](p);
  const vSlide = 90 * unit;
  const hSlide = 130 * unit;
  switch (anim.preset) {
    case 'fade':
      obj.set({ left: rest.left, top: rest.top, scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity * e });
      break;
    case 'fromBottom':
      obj.set({ left: rest.left, top: rest.top + vSlide * (1 - e), scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity * e });
      break;
    case 'fromTop':
      obj.set({ left: rest.left, top: rest.top - vSlide * (1 - e), scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity * e });
      break;
    case 'fromLeft':
      obj.set({ left: rest.left - hSlide * (1 - e), top: rest.top, scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity * e });
      break;
    case 'fromRight':
      obj.set({ left: rest.left + hSlide * (1 - e), top: rest.top, scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity * e });
      break;
    case 'pop': {
      const s = clamp(0.35 + 0.65 * e, 0.001, 4);
      obj.set({ left: rest.left, top: rest.top, scaleX: rest.scaleX * s, scaleY: rest.scaleY * s, opacity: rest.opacity * clamp(p * 2.4) });
      obj.setPositionByOrigin(new Point(rest.cx, rest.cy), 'center', 'center');
      break;
    }
    case 'typewriter': {
      obj.set({ left: rest.left, top: rest.top, scaleX: rest.scaleX, scaleY: rest.scaleY, opacity: rest.opacity });
      if (rest.text !== undefined && obj instanceof Textbox) {
        const shown = rest.text.slice(0, Math.round(rest.text.length * e));
        if (obj.text !== shown) {
          obj.set('text', shown);
          obj.initDimensions();
        }
      }
      break;
    }
  }
  obj.setCoords();
}
