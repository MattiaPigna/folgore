/**
 * Global "impact" flourishes for the goal video (confetti burst, shockwave ring, camera shake,
 * flash), ported from the previous hardcoded `goalCard.ts` renderer. Unlike individual elements
 * these aren't draggable Fabric objects — they're a fixed post-process layer centred on the canvas,
 * toggled on/off and timed by a single `impactTime`.
 */

export type BurstStyle = 'none' | 'confetti' | 'shapes';
export const BURST_STYLE_LABELS: Record<BurstStyle, string> = { none: 'Nessuno', confetti: 'Coriandoli', shapes: 'Forme geometriche' };
export const BURST_STYLES = Object.keys(BURST_STYLE_LABELS) as BurstStyle[];

export interface VideoExtras {
  burst: BurstStyle;
  shockwave: boolean;
  shake: boolean;
  flash: boolean;
  /** Seconds from the start of the video when the "impact" (shake/shockwave/burst/flash) fires. */
  impactTime: number;
}

export const DEFAULT_EXTRAS: VideoExtras = { burst: 'shapes', shockwave: true, shake: true, flash: true, impactTime: 0.42 };

interface Particle {
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: number;
  delay: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed random burst (same seed every time): generate once per render session and reuse every frame. */
export function makeConfetti(n = 110): Particle[] {
  const r = mulberry32(42);
  return Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2;
    const s = 500 + r() * 1300;
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 500, rot: r() * 6, vr: (r() - 0.5) * 14, w: 9 + r() * 10, h: 16 + r() * 16, color: Math.floor(r() * 3), delay: r() * 0.12 };
  });
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Camera shake offset at time t, relative to the impact instant. Apply to the Fabric canvas viewport too. */
export function shakeOffset(t: number, impactTime: number, unit: number): { sx: number; sy: number } {
  const amp = t > impactTime ? 24 * unit * Math.max(0, 1 - (t - impactTime) / 0.55) : 0;
  return { sx: Math.sin(t * 93) * amp, sy: Math.cos(t * 71) * amp };
}

/**
 * Draws shockwave/confetti/flash on top of an already-rendered frame (call after `canvas.renderAll()`).
 * Effects are centred on the canvas; `particles` should come from one `makeConfetti()` call reused every frame.
 */
export function drawEffects(ctx: CanvasRenderingContext2D, t: number, extras: VideoExtras, W: number, H: number, unit: number, accent: string, particles: Particle[]): void {
  const cx = W / 2;
  const cy = H / 2;
  const { sx, sy } = extras.shake ? shakeOffset(t, extras.impactTime, unit) : { sx: 0, sy: 0 };
  ctx.save();
  ctx.translate(sx, sy);

  if (extras.shockwave) {
    const ring = prog(t, extras.impactTime, extras.impactTime + 0.68);
    if (ring > 0 && ring < 1) {
      const e = 1 - Math.pow(1 - ring, 3);
      ctx.save();
      ctx.strokeStyle = rgba('#ffffff', 0.7 * (1 - ring));
      ctx.lineWidth = 18 * unit * (1 - ring);
      ctx.beginPath();
      ctx.arc(cx, cy, 120 * unit + e * 700 * unit, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (extras.burst !== 'none' && t > extras.impactTime) {
    const colors = [accent, '#ffffff', '#fbbf24'];
    const shapes = extras.burst === 'shapes';
    const list = shapes ? particles.filter((_, i) => i % 5 === 0) : particles;
    for (const p of list) {
      const dt = t - extras.impactTime - p.delay;
      if (dt <= 0) continue;
      const drag = 1 - Math.exp(-2.2 * dt);
      const x = cx + ((p.vx * drag) / 2.2) * unit;
      const y = cy + ((p.vy * drag) / 2.2) * unit + 0.5 * 700 * dt * dt * unit;
      const a = clamp(1 - (dt - 2.6) / 1.2);
      if (a <= 0 || y > H + 50) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.fillStyle = colors[p.color];
      if (shapes) {
        const size = (p.w + p.h) * unit * 0.9;
        ctx.rotate(p.rot * 0.3 + p.vr * dt * 0.3);
        ctx.beginPath();
        if (p.color === 0) ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        else if (p.color === 1) {
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.lineWidth = 5 * unit;
          ctx.strokeStyle = colors[p.color];
          ctx.stroke();
          ctx.restore();
          continue;
        } else {
          ctx.moveTo(0, -size / 2);
          ctx.lineTo(size / 2, 0);
          ctx.lineTo(0, size / 2);
          ctx.lineTo(-size / 2, 0);
          ctx.closePath();
        }
        ctx.fill();
      } else {
        ctx.rotate(p.rot + p.vr * dt);
        ctx.scale(1, Math.cos(dt * 9 + p.rot));
        ctx.fillRect((-p.w * unit) / 2, (-p.h * unit) / 2, p.w * unit, p.h * unit);
      }
      ctx.restore();
    }
  }

  ctx.restore();

  if (extras.flash) {
    const fl = t < extras.impactTime ? 0 : 1 - prog(t, extras.impactTime, extras.impactTime + 0.5);
    if (fl > 0 && t >= extras.impactTime) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 * fl * fl})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
