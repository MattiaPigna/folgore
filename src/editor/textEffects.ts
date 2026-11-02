import { FabricText, Gradient, Shadow, type FabricObject, type Textbox } from 'fabric';

/** Extra text effects, stored on the object as `fx` (serialized with the graphic). */
export interface TextFx {
  /** Gaussian blur of the whole text, in canvas px. */
  blur?: number;
  /** Motion blur: ghost copies spread along `angle` (degrees) over `amount` px. */
  motion?: { amount: number; angle: number };
  /** Repeated copies behind the text, each shifted by dx/dy, fading by `opacity`. */
  echo?: { count: number; dx: number; dy: number; opacity: number; outline: boolean };
}

export function hasFx(fx: TextFx | undefined | null): fx is TextFx {
  return !!fx && (!!fx.blur || !!fx.motion?.amount || !!fx.echo?.count);
}

/** Device-space scale of the current transform, so blur looks the same at any zoom / export size. */
function ctxScale(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

let installed = false;

/** Patches Fabric text rendering to draw `fx`. Called once at startup. */
export function installTextEffects(): void {
  if (installed) return;
  installed = true;
  const proto = FabricText.prototype as any;
  const baseRender: (ctx: CanvasRenderingContext2D) => void = proto._render;
  const baseShouldCache: () => boolean = proto.shouldCache;

  // Effects may draw outside the object's box: render them without the object cache.
  proto.shouldCache = function (this: FabricObject) {
    if (hasFx((this as any).fx)) {
      (this as any).ownCaching = false;
      return false;
    }
    return baseShouldCache.call(this);
  };

  proto._render = function (this: Textbox & { fx?: TextFx }, ctx: CanvasRenderingContext2D) {
    const fx = this.fx;
    if (!hasFx(fx)) return baseRender.call(this, ctx);
    const scale = ctxScale(ctx);

    // 1. Echo copies (furthest first).
    const echo = fx.echo;
    if (echo?.count) {
      const fill = this.fill;
      const stroke = this.stroke;
      const strokeWidth = this.strokeWidth;
      const shadow = this.shadow;
      for (let i = echo.count; i >= 1; i--) {
        ctx.save();
        ctx.translate(echo.dx * i, echo.dy * i);
        ctx.globalAlpha *= Math.pow(echo.opacity, i);
        if (echo.outline) {
          (this as any).fill = 'rgba(0,0,0,0)';
          (this as any).stroke = typeof fill === 'string' ? fill : '#ffffff';
          (this as any).strokeWidth = Math.max(1, (this.fontSize ?? 40) / 45);
        }
        (this as any).shadow = null;
        baseRender.call(this, ctx);
        (this as any).fill = fill;
        (this as any).stroke = stroke;
        (this as any).strokeWidth = strokeWidth;
        (this as any).shadow = shadow;
        ctx.restore();
      }
    }

    // 2. Motion blur: soft ghost copies along a direction.
    const motion = fx.motion;
    if (motion?.amount) {
      const steps = 12;
      const rad = (motion.angle * Math.PI) / 180;
      ctx.save();
      ctx.globalAlpha *= 0.16;
      ctx.filter = `blur(${((motion.amount / 10) * scale).toFixed(2)}px)`;
      for (let k = 0; k < steps; k++) {
        const t = (k / (steps - 1) - 0.5) * motion.amount;
        ctx.save();
        ctx.translate(Math.cos(rad) * t, Math.sin(rad) * t);
        baseRender.call(this, ctx);
        ctx.restore();
      }
      ctx.restore();
    }

    // 3. The text itself (optionally blurred).
    ctx.save();
    if (fx.blur) ctx.filter = `blur(${(fx.blur * scale).toFixed(2)}px)`;
    baseRender.call(this, ctx);
    ctx.restore();
  };
}

/* ---------- presets ---------- */

export function gradientFill(colors: [string, string], vertical = true): Gradient<'linear'> {
  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: vertical ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 },
    colorStops: [
      { offset: 0, color: colors[0] },
      { offset: 1, color: colors[1] },
    ],
  });
}

export interface FxPreset {
  id: string;
  label: string;
  /** Builds the props to set; `size` is the font size, used to scale offsets. */
  apply: (size: number, baseColor: string) => Record<string, any>;
}

const clear = { fx: null, shadow: null, stroke: null, strokeWidth: 1 };

export const FX_PRESETS: FxPreset[] = [
  { id: 'none', label: 'Nessuno', apply: (_s, c) => ({ ...clear, fill: c }) },
  {
    id: 'glow',
    label: 'Bagliore',
    apply: (s, c) => ({ ...clear, fill: c, shadow: new Shadow({ color: 'rgba(255,255,255,0.75)', blur: s * 0.18, offsetX: 0, offsetY: 0 }) }),
  },
  {
    id: 'neon',
    label: 'Neon',
    apply: (s) => ({ ...clear, fill: '#ffffff', shadow: new Shadow({ color: 'rgba(255,32,64,1)', blur: s * 0.3, offsetX: 0, offsetY: 0 }), stroke: '#ff4d6d', strokeWidth: Math.max(1, s / 60) }),
  },
  {
    id: 'shadow3d',
    label: 'Ombra 3D',
    apply: (s, c) => ({ ...clear, fill: c, shadow: new Shadow({ color: 'rgba(0,0,0,0.85)', blur: 0, offsetX: s * 0.035, offsetY: s * 0.035 }) }),
  },
  {
    id: 'soft',
    label: 'Ombra morbida',
    apply: (s, c) => ({ ...clear, fill: c, shadow: new Shadow({ color: 'rgba(0,0,0,0.7)', blur: s * 0.15, offsetX: 0, offsetY: s * 0.04 }) }),
  },
  {
    id: 'hollow',
    label: 'Vuoto',
    apply: (s, c) => ({ ...clear, fill: 'rgba(0,0,0,0)', stroke: c, strokeWidth: Math.max(1, s / 45) }),
  },
  {
    id: 'echo',
    label: 'Eco',
    apply: (s, c) => ({ ...clear, fill: c, fx: { echo: { count: 4, dx: 0, dy: Math.round(s * 0.18), opacity: 0.6, outline: true } } }),
  },
  {
    id: 'motion',
    label: 'Mosso',
    apply: (s, c) => ({ ...clear, fill: c, fx: { motion: { amount: Math.round(s * 0.35), angle: 0 } } }),
  },
  { id: 'blur', label: 'Sfocato', apply: (s, c) => ({ ...clear, fill: c, fx: { blur: Math.max(1, Math.round(s * 0.03 * 2) / 2) } }) },
  { id: 'gold', label: 'Oro', apply: (s) => ({ ...clear, fill: gradientFill(['#fff3b0', '#c9922e']), shadow: new Shadow({ color: 'rgba(0,0,0,0.5)', blur: s * 0.08, offsetX: 0, offsetY: s * 0.02 }) }) },
  { id: 'silver', label: 'Argento', apply: (s) => ({ ...clear, fill: gradientFill(['#ffffff', '#8e96a3']), shadow: new Shadow({ color: 'rgba(0,0,0,0.5)', blur: s * 0.08, offsetX: 0, offsetY: s * 0.02 }) }) },
  { id: 'fire', label: 'Rosso', apply: (s) => ({ ...clear, fill: gradientFill(['#ff8a8a', '#b3001b']), shadow: new Shadow({ color: 'rgba(200,16,32,0.8)', blur: s * 0.15, offsetX: 0, offsetY: 0 }) }) },
];
