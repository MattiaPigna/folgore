/**
 * Non-destructive image retouching for logos, sponsors and photos.
 * Everything runs on a 2D canvas: preview at reduced size, final render at full size.
 */

export type MonoMode = 'off' | 'darkToColor' | 'lightToColor' | 'silhouette';

export interface StudioParams {
  rotate: 0 | 90 | 180 | 270;
  flipX: boolean;
  flipY: boolean;
  /** Manual crop as fractions of the (rotated) image. */
  crop: { l: number; t: number; r: number; b: number };
  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // -1..1
  sharpen: number; // 0..1
  grayscale: boolean;
  /** Background removal. */
  bgMode: 'off' | 'edges' | 'everywhere';
  bgColor: [number, number, number] | null; // null = auto from the border
  bgTolerance: number; // 0..1
  /** Single-colour version (e.g. white logo for dark graphics). */
  mono: MonoMode;
  monoColor: string;
  monoThreshold: number; // 0..1 luminance
  monoSoftness: number; // 0..1
  /** Sticker-style outline around the shape. */
  outline: number; // px at 1000px long side
  outlineColor: string;
  trim: boolean;
  /** Photo/logo effect (see STUDIO_FX) and its intensity. */
  effect: string;
  effectAmount: number;
}

export const DEFAULT_PARAMS: StudioParams = {
  rotate: 0,
  flipX: false,
  flipY: false,
  crop: { l: 0, t: 0, r: 0, b: 0 },
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpen: 0,
  grayscale: false,
  bgMode: 'off',
  bgColor: null,
  bgTolerance: 0.15,
  mono: 'off',
  monoColor: '#ffffff',
  monoThreshold: 0.6,
  monoSoftness: 0.15,
  outline: 0,
  outlineColor: '#ffffff',
  trim: false,
  effect: 'none',
  effectAmount: 0.7,
};

/** Ready-made recipes. */
export const RECIPES: { id: string; label: string; hint: string; params: Partial<StudioParams> }[] = [
  { id: 'clean', label: 'Logo pulito', hint: 'Toglie lo sfondo uniforme e i margini vuoti', params: { bgMode: 'edges', bgTolerance: 0.15, trim: true } },
  {
    id: 'whiteDark',
    label: 'Bianco leggibile',
    hint: 'Le parti scure diventano bianche, quelle chiare trasparenti: scritte e contorni restano leggibili',
    params: { bgMode: 'edges', trim: true, mono: 'darkToColor', monoColor: '#ffffff', monoThreshold: 0.62, monoSoftness: 0.15 },
  },
  {
    id: 'whiteLight',
    label: 'Bianco da badge',
    hint: 'Per loghi chiari su fondo scuro (es. scritte bianche su riquadro nero)',
    params: { trim: true, mono: 'lightToColor', monoColor: '#ffffff', monoThreshold: 0.5, monoSoftness: 0.15 },
  },
  { id: 'sticker', label: 'Adesivo', hint: 'Contorno bianco intorno al logo, ottimo sulle foto', params: { bgMode: 'edges', trim: true, outline: 14, outlineColor: '#ffffff' } },
  { id: 'black', label: 'Nero leggibile', hint: 'Versione nera per grafiche chiare', params: { bgMode: 'edges', trim: true, mono: 'darkToColor', monoColor: '#000000', monoThreshold: 0.62, monoSoftness: 0.15 } },
  { id: 'photo', label: 'Foto più viva', hint: 'Più contrasto, colori e nitidezza', params: { contrast: 0.15, saturation: 0.2, sharpen: 0.35 } },
];

export const STUDIO_FX: { id: string; label: string; hint: string }[] = [
  { id: 'none', label: 'Nessuno', hint: 'Nessun effetto' },
  { id: 'bwDrama', label: 'B/N drammatico', hint: 'Bianco e nero contrastato' },
  { id: 'duoRed', label: 'Duotone rosso', hint: 'Nero e rosso Folgore' },
  { id: 'duoBlue', label: 'Duotone notte', hint: 'Blu scuro e azzurro' },
  { id: 'cinema', label: 'Cinematografico', hint: 'Contrasto e colori da film' },
  { id: 'vintage', label: 'Vintage', hint: 'Toni anni ’70 e grana' },
  { id: 'sepia', label: 'Seppia', hint: 'Toni d’epoca' },
  { id: 'kodachrome', label: 'Kodachrome', hint: 'Pellicola calda e satura' },
  { id: 'polaroid', label: 'Polaroid', hint: 'Colori morbidi' },
  { id: 'grain', label: 'Grana', hint: 'Grana da pellicola' },
  { id: 'blur', label: 'Sfocato', hint: 'Per sfondi dietro ai testi' },
  { id: 'pixel', label: 'Pixel', hint: 'Mosaico' },
  { id: 'invert', label: 'Negativo', hint: 'Colori invertiti' },
  { id: 'vignette', label: 'Vignettatura', hint: 'Bordi scuri, centro in risalto' },
  { id: 'glow', label: 'Bagliore', hint: 'Alone bianco (loghi scontornati)' },
  { id: 'neon', label: 'Neon rosso', hint: 'Alone rosso' },
  { id: 'drop', label: 'Ombra', hint: 'Ombra portata' },
];

/** CSS-filter based colour looks. */
function cssLook(id: string, k: number, side: number): string | null {
  switch (id) {
    case 'bwDrama':
      return `grayscale(1) contrast(${1 + 0.45 * k})`;
    case 'cinema':
      return `contrast(${1 + 0.22 * k}) saturate(${1 + 0.25 * k}) sepia(${0.15 * k}) hue-rotate(${-8 * k}deg)`;
    case 'vintage':
      return `sepia(${0.55 * k}) contrast(${1 - 0.08 * k}) saturate(${1 - 0.2 * k})`;
    case 'sepia':
      return `sepia(${k})`;
    case 'kodachrome':
      return `saturate(${1 + 0.4 * k}) contrast(${1 + 0.15 * k}) sepia(${0.15 * k})`;
    case 'polaroid':
      return `saturate(${1 - 0.1 * k}) contrast(${1 - 0.05 * k}) sepia(${0.2 * k}) brightness(${1 + 0.05 * k})`;
    case 'invert':
      return `invert(${k})`;
    case 'blur':
      return `blur(${((0.002 + 0.012 * k) * side).toFixed(1)}px)`;
    default:
      return null;
  }
}

function applyEffect(c: HTMLCanvasElement, id: string, k: number): HTMLCanvasElement {
  if (id === 'none' || k <= 0) return c;
  const side = Math.max(c.width, c.height);
  const look = cssLook(id, k, side);
  if (look) {
    const [out, octx] = canvas(c.width, c.height);
    octx.filter = look;
    octx.drawImage(c, 0, 0);
    octx.filter = 'none';
    if (id === 'vintage') return applyEffect(out, 'grain', 0.4 * k);
    return out;
  }
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  if (id === 'duoRed' || id === 'duoBlue' || id === 'grain') {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const [dark, light] = id === 'duoRed' ? [hexToRgb('#12030a'), hexToRgb('#ff4d6d')] : [hexToRgb('#050816'), hexToRgb('#7dd3fc')];
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      if (id === 'grain') {
        const n = (Math.random() - 0.5) * 120 * k;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
      } else {
        const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        for (let ch = 0; ch < 3; ch++) d[i + ch] = d[i + ch] * (1 - k) + (dark[ch] + (light[ch] - dark[ch]) * L) * k;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  if (id === 'pixel') {
    const block = Math.max(2, Math.round((side / 1000) * (4 + 26 * k)));
    const [small, sctx] = canvas(c.width / block, c.height / block);
    sctx.drawImage(c, 0, 0, small.width, small.height);
    const [out, octx] = canvas(c.width, c.height);
    octx.imageSmoothingEnabled = false;
    octx.drawImage(small, 0, 0, c.width, c.height);
    return out;
  }
  if (id === 'vignette') {
    const [out, octx] = canvas(c.width, c.height);
    octx.drawImage(c, 0, 0);
    const g = octx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.25, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.85 * k})`);
    octx.globalCompositeOperation = 'source-atop';
    octx.fillStyle = g;
    octx.fillRect(0, 0, c.width, c.height);
    return out;
  }
  if (id === 'glow' || id === 'neon' || id === 'drop') {
    const pad = Math.round(side * 0.12);
    const [out, octx] = canvas(c.width + pad * 2, c.height + pad * 2);
    octx.shadowColor = id === 'glow' ? `rgba(255,255,255,${0.5 + 0.45 * k})` : id === 'neon' ? `rgba(244,32,64,${0.6 + 0.4 * k})` : `rgba(0,0,0,${0.45 + 0.4 * k})`;
    octx.shadowBlur = side * (id === 'drop' ? 0.02 + 0.06 * k : 0.03 + 0.09 * k);
    octx.shadowOffsetY = id === 'drop' ? side * (0.01 + 0.03 * k) : 0;
    octx.drawImage(c, pad, pad);
    if (id !== 'drop') octx.drawImage(c, pad, pad); // stronger halo
    return trimCanvas(out);
  }
  return c;
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Average colour of the image border (for automatic background detection). */
export function borderColor(data: ImageData): [number, number, number] {
  const { width: w, height: h, data: d } = data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (i: number) => {
    if (d[i + 3] < 128) return;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  };
  for (let x = 0; x < w; x++) {
    add(x * 4);
    add(((h - 1) * w + x) * 4);
  }
  for (let y = 0; y < h; y++) {
    add(y * w * 4);
    add((y * w + w - 1) * 4);
  }
  return n ? [r / n, g / n, b / n] : [255, 255, 255];
}

function removeBackground(img: ImageData, mode: 'edges' | 'everywhere', color: [number, number, number], tolerance: number): void {
  const { width: w, height: h, data: d } = img;
  const hard = 8 + tolerance * 140;
  const soft = hard + 40;
  const dist = (i: number) => Math.max(Math.abs(d[i] - color[0]), Math.abs(d[i + 1] - color[1]), Math.abs(d[i + 2] - color[2]));
  const fade = (i: number, dq: number) => {
    if (dq < hard) d[i + 3] = 0;
    else if (dq < soft) d[i + 3] = Math.min(d[i + 3], Math.round(((dq - hard) / (soft - hard)) * 255));
  };
  if (mode === 'everywhere') {
    for (let i = 0; i < d.length; i += 4) fade(i, dist(i));
    return;
  }
  // Already transparent around the edges: there is no flat background to remove.
  let opaqueBorder = 0;
  let borderCount = 0;
  for (let x = 0; x < w; x++) for (const p of [x, (h - 1) * w + x]) (borderCount++, d[p * 4 + 3] > 128 && opaqueBorder++);
  for (let y = 0; y < h; y++) for (const p of [y * w, y * w + w - 1]) (borderCount++, d[p * 4 + 3] > 128 && opaqueBorder++);
  if (opaqueBorder < borderCount * 0.3) return;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!seen[p] && d[p * 4 + 3] > 0 && dist(p * 4) < hard) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of next) {
      // Transparent pixels stop the fill (their hidden RGB must not count as background).
      if (q < 0 || seen[q] || d[q * 4 + 3] === 0) continue;
      const dq = dist(q * 4);
      if (dq < hard) {
        seen[q] = 1;
        stack.push(q);
      } else if (dq < soft) {
        seen[q] = 2;
        fade(q * 4, dq);
      }
    }
  }
}

/** Maps the image to a single colour, using luminance as transparency (keeps inner details readable). */
function monochrome(img: ImageData, p: StudioParams): void {
  const d = img.data;
  const [cr, cg, cb] = hexToRgb(p.monoColor);
  const lo = Math.max(0, p.monoThreshold - p.monoSoftness / 2);
  const hi = Math.min(1, p.monoThreshold + p.monoSoftness / 2) + 1e-6;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (!a) continue;
    const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    let k = 1;
    if (p.mono === 'darkToColor') k = L <= lo ? 1 : L >= hi ? 0 : (hi - L) / (hi - lo);
    else if (p.mono === 'lightToColor') k = L >= hi ? 1 : L <= lo ? 0 : (L - lo) / (hi - lo);
    d[i] = cr;
    d[i + 1] = cg;
    d[i + 2] = cb;
    d[i + 3] = Math.round(a * k);
  }
}

function sharpen(img: ImageData, amount: number): ImageData {
  const { width: w, height: h, data: s } = img;
  const out = new ImageData(new Uint8ClampedArray(s), w, h);
  const d = out.data;
  const k = amount * 1.5;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const lap = 4 * s[i + c] - s[i - 4 + c] - s[i + 4 + c] - s[i - w * 4 + c] - s[i + w * 4 + c];
        d[i + c] = s[i + c] + k * lap;
      }
    }
  }
  return out;
}

function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return c;
  const pad = Math.round(Math.max(w, h) * 0.01);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const [out, octx] = canvas(maxX - minX + 1, maxY - minY + 1);
  octx.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function addOutline(c: HTMLCanvasElement, size: number, color: string): HTMLCanvasElement {
  if (size <= 0) return c;
  const r = Math.max(1, Math.round(size));
  const [tint, tctx] = canvas(c.width, c.height);
  tctx.drawImage(c, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, c.width, c.height);
  const [out, octx] = canvas(c.width + r * 2, c.height + r * 2);
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    octx.drawImage(tint, r + Math.cos(a) * r, r + Math.sin(a) * r);
  }
  octx.drawImage(tint, r, r); // fill holes of the ring
  octx.drawImage(c, r, r);
  return out;
}

/** Runs the whole pipeline. `maxSide` limits the working size (preview vs final). */
export function processImage(src: ImageBitmap, p: StudioParams, maxSide: number): HTMLCanvasElement {
  // 1. rotate / flip at working size
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const sw = src.width * k;
  const sh = src.height * k;
  const rot = p.rotate % 180 !== 0;
  let [c, ctx] = canvas(rot ? sh : sw, rot ? sw : sh);
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((p.rotate * Math.PI) / 180);
  ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
  // 2. colour adjustments via canvas filters
  const filters: string[] = [];
  if (p.brightness) filters.push(`brightness(${1 + p.brightness})`);
  if (p.contrast) filters.push(`contrast(${1 + p.contrast})`);
  if (p.saturation) filters.push(`saturate(${1 + p.saturation})`);
  if (p.grayscale) filters.push('grayscale(1)');
  if (filters.length) ctx.filter = filters.join(' ');
  ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  // 3. manual crop
  const { l, t, r, b } = p.crop;
  if (l || t || r || b) {
    const cw = c.width * (1 - l - r);
    const ch = c.height * (1 - t - b);
    const [cc, cctx] = canvas(cw, ch);
    cctx.drawImage(c, c.width * l, c.height * t, cw, ch, 0, 0, cw, ch);
    c = cc;
    ctx = cctx;
  }

  // 4. pixel operations
  let data = ctx.getImageData(0, 0, c.width, c.height);
  if (p.sharpen > 0) data = sharpen(data, p.sharpen);
  if (p.bgMode !== 'off') removeBackground(data, p.bgMode, p.bgColor ?? borderColor(data), p.bgTolerance);
  if (p.mono !== 'off') monochrome(data, p);
  ctx.putImageData(data, 0, 0);

  // 5. colour effects, trim, outline, halo effects (these grow the canvas, so they come last)
  const halo = p.effect === 'glow' || p.effect === 'neon' || p.effect === 'drop';
  if (!halo) c = applyEffect(c, p.effect, p.effectAmount);
  if (p.trim) c = trimCanvas(c);
  if (p.outline > 0) c = addOutline(c, (p.outline * Math.max(c.width, c.height)) / 1000, p.outlineColor);
  if (halo) c = applyEffect(c, p.effect, p.effectAmount);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Esportazione immagine non riuscita'))), 'image/png'));
}

/** Colour of a pixel of the source (for the "pick background colour" click). */
export function pickColor(c: HTMLCanvasElement, x: number, y: number): [number, number, number] {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}
