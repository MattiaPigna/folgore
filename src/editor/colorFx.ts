import { FabricObject, Gradient, Shadow } from 'fabric';

/** Continuous (whole-video, not just entrance) color effects — unlike `anim`, these run every frame. */
export type ColorFx = 'none' | 'gradient' | 'neon';
export const COLOR_FX_LABELS: Record<ColorFx, string> = { none: 'Nessuno', gradient: 'Gradiente animato', neon: 'Neon pulsante' };
export const COLOR_FX_OPTIONS = Object.keys(COLOR_FX_LABELS) as ColorFx[];

/** Continuous background effect, meaningful on the canvas's background object. */
export type BgFx = 'none' | 'colorWave' | 'lightRays';
export const BG_FX_LABELS: Record<BgFx, string> = { none: 'Nessuno', colorWave: 'Onde di colore', lightRays: 'Luci in movimento' };
export const BG_FX_OPTIONS = Object.keys(BG_FX_LABELS) as BgFx[];

export interface FxSnapshot {
  fill: any;
  shadow: any;
}

/** Base fill/shadow captured at rest, so the continuous effect can be layered on top every frame without drift. */
export function fxSnapshot(obj: FabricObject): FxSnapshot {
  return { fill: obj.fill, shadow: obj.shadow ?? null };
}

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Applies a text/shape color effect (neon glow, animated gradient fill) at time t. No-op when `colorFx` is unset. */
export function applyColorFx(obj: FabricObject, base: FxSnapshot, t: number, accent: string): void {
  const fx = obj.colorFx ?? 'none';
  if (fx === 'none') {
    if (obj.fill !== base.fill) obj.set('fill', base.fill);
    if (obj.shadow !== base.shadow) obj.set('shadow', base.shadow);
    return;
  }
  if (fx === 'neon') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    obj.set({ fill: base.fill, shadow: new Shadow({ color: accent, blur: 14 + 26 * pulse, offsetX: 0, offsetY: 0 }) });
    return;
  }
  // gradient: two-stop fill cycling hue around the accent colour.
  const [h] = hexToHsl(accent);
  const h1 = (h + t * 70) % 360;
  const h2 = (h1 + 55) % 360;
  const w = obj.width ?? 300;
  obj.set({
    shadow: base.shadow,
    fill: new Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: w, y2: 0 },
      colorStops: [
        { offset: 0, color: hslToHex(h1, 85, 62) },
        { offset: 1, color: hslToHex(h2, 85, 68) },
      ],
    }),
  });
}

/** A sweeping bright band across dark colour stops (clamped to ascending offsets for the canvas gradient). */
function sweepStops(p: number, dark: string, band: string) {
  const a = Math.max(0, Math.min(1, p - 0.16));
  const b = Math.max(a, Math.min(1, p));
  const c = Math.max(b, Math.min(1, p + 0.16));
  const stops = [{ offset: 0, color: dark }];
  if (a > 0) stops.push({ offset: a, color: dark });
  stops.push({ offset: b, color: band });
  if (c < 1) stops.push({ offset: c, color: dark });
  stops.push({ offset: 1, color: dark });
  return stops;
}

/** Applies an animated background effect (colour wave, sweeping light) at time t. No-op when `bgFx` is unset. */
export function applyBgFx(obj: FabricObject, base: FxSnapshot, t: number, accent: string): void {
  const fx = (obj as any).bgFx ?? 'none';
  if (fx === 'none') {
    if (obj.fill !== base.fill) obj.set('fill', base.fill);
    return;
  }
  const w = obj.width ?? 1080;
  const h = obj.height ?? 1920;
  if (fx === 'colorWave') {
    const [ah] = hexToHsl(accent);
    const stops = [0, 0.55, 1].map((off, i) => ({ offset: off, color: hslToHex((ah + t * 30 + i * 60) % 360, 70, i === 1 ? 24 : 10) }));
    obj.set('fill', new Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: w * 0.35, y2: h }, colorStops: stops }));
    return;
  }
  // lightRays: a bright diagonal band sweeping top-left to bottom-right, looping every ~4s.
  const p = (t / 4) % 1;
  obj.set('fill', new Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: w, y2: h }, colorStops: sweepStops(p, '#050507', 'rgba(255,255,255,0.32)') }));
}
