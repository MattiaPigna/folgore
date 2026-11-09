import { Shadow, filters, type FabricImage } from 'fabric';

/**
 * Live image effects for the editor (Fabric filters, non-destructive, saved with the graphic).
 * Every effect accepts an intensity k in 0..1.
 */

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Matrix between "no change" and the preset matrix, so presets get an intensity. */
function blend(matrix: number[], k: number): number[] {
  return IDENTITY.map((v, i) => v + (matrix[i] - v) * k);
}

function hex(c: string): [number, number, number] {
  const m = c.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

/** Duotone: dark tones -> `dark`, light tones -> `light` (luminance mapped with a colour matrix). */
function duotone(dark: string, light: string, k: number): number[] {
  const d = hex(dark).map((v) => v / 255);
  const l = hex(light).map((v) => v / 255);
  const W = [0.2126, 0.7152, 0.0722];
  const m: number[] = [];
  for (let c = 0; c < 3; c++) {
    const span = l[c] - d[c];
    m.push(W[0] * span, W[1] * span, W[2] * span, 0, d[c]);
  }
  m.push(0, 0, 0, 1, 0);
  return blend(m, k);
}

function presetMatrix(Klass: new () => { matrix: number[] }, k: number): filters.ColorMatrix {
  return new filters.ColorMatrix({ matrix: blend(new Klass().matrix, k) });
}

export interface ImageFx {
  id: string;
  label: string;
  hint: string;
  filters: (k: number) => any[];
  /** Effects drawn as a shadow (glow / drop shadow), size relative to the image. */
  shadow?: (k: number, size: number) => Shadow;
}

export const IMAGE_FX: ImageFx[] = [
  { id: 'none', label: 'Nessuno', hint: 'Immagine originale', filters: () => [] },
  { id: 'bwDrama', label: 'B/N drammatico', hint: 'Bianco e nero contrastato, stile poster', filters: (k) => [new filters.Grayscale(), new filters.Contrast({ contrast: 0.22 * k })] },
  { id: 'duoRed', label: 'Duotone rosso', hint: 'Nero e rosso Folgore', filters: (k) => [new filters.ColorMatrix({ matrix: duotone('#12030a', '#ff4d6d', k) })] },
  { id: 'duoBlue', label: 'Duotone notte', hint: 'Blu scuro e azzurro', filters: (k) => [new filters.ColorMatrix({ matrix: duotone('#050816', '#7dd3fc', k) })] },
  {
    id: 'cinema',
    label: 'Cinematografico',
    hint: 'Più contrasto e toni caldi/freddi',
    filters: (k) => [new filters.Contrast({ contrast: 0.22 * k }), new filters.Vibrance({ vibrance: 0.35 * k }), presetMatrix(filters.Technicolor as any, 0.35 * k)],
  },
  { id: 'vintage', label: 'Vintage', hint: 'Colori anni ’70 con grana', filters: (k) => [presetMatrix(filters.Vintage as any, k), new filters.Noise({ noise: 140 * k })] },
  { id: 'sepia', label: 'Seppia', hint: 'Toni marroni d’epoca', filters: (k) => [presetMatrix(filters.Sepia as any, k)] },
  { id: 'kodachrome', label: 'Kodachrome', hint: 'Pellicola calda e satura', filters: (k) => [presetMatrix(filters.Kodachrome as any, k)] },
  { id: 'polaroid', label: 'Polaroid', hint: 'Istantanea dai colori morbidi', filters: (k) => [presetMatrix(filters.Polaroid as any, k)] },
  { id: 'grain', label: 'Grana', hint: 'Grana da pellicola', filters: (k) => [new filters.Noise({ noise: 260 * k })] },
  { id: 'blur', label: 'Sfocato', hint: 'Ideale per sfondi dietro ai testi', filters: (k) => [new filters.Blur({ blur: 0.05 + 0.3 * k })] },
  { id: 'pixel', label: 'Pixel', hint: 'Effetto mosaico', filters: (k) => [new filters.Pixelate({ blocksize: Math.round(4 + 26 * k) })] },
  { id: 'invert', label: 'Negativo', hint: 'Colori invertiti', filters: () => [new filters.Invert()] },
  {
    id: 'glow',
    label: 'Bagliore',
    hint: 'Alone luminoso intorno (loghi e scontornati)',
    filters: () => [],
    shadow: (k, size) => new Shadow({ color: `rgba(255,255,255,${0.5 + 0.45 * k})`, blur: size * (0.03 + 0.09 * k), offsetX: 0, offsetY: 0 }),
  },
  {
    id: 'neon',
    label: 'Neon rosso',
    hint: 'Alone rosso acceso',
    filters: () => [],
    shadow: (k, size) => new Shadow({ color: `rgba(244,32,64,${0.6 + 0.4 * k})`, blur: size * (0.04 + 0.1 * k), offsetX: 0, offsetY: 0 }),
  },
  {
    id: 'drop',
    label: 'Ombra',
    hint: 'Ombra portata morbida',
    filters: () => [],
    shadow: (k, size) => new Shadow({ color: `rgba(0,0,0,${0.45 + 0.4 * k})`, blur: size * (0.02 + 0.06 * k), offsetX: 0, offsetY: size * (0.01 + 0.03 * k) }),
  },
  {
    id: 'shadow3d',
    label: 'Ombra 3D',
    hint: 'Ombra netta in rilievo (come sui testi)',
    filters: () => [],
    shadow: (k, size) => {
      const d = size * (0.01 + 0.04 * k);
      return new Shadow({ color: 'rgba(0,0,0,0.85)', blur: 0, offsetX: d, offsetY: d });
    },
  },
];

/** Filters the user set by hand (brightness/contrast sliders) that effects must keep. */
const MANUAL = new Set(['Brightness']);

export function applyImageFx(img: FabricImage, id: string, k: number): void {
  const fx = IMAGE_FX.find((f) => f.id === id) ?? IMAGE_FX[0];
  const kept = img.filters.filter((f: any) => f && MANUAL.has(f.type));
  img.filters = [...kept, ...fx.filters(k)];
  img.applyFilters();
  const prev = IMAGE_FX.find((f) => f.id === img.imgFx);
  const size = Math.max(img.width ?? 0, img.height ?? 0);
  if (fx.shadow) img.set('shadow', fx.shadow(k, size));
  else if (prev?.shadow) img.set('shadow', null); // remove only a shadow created by an effect
  img.imgFx = fx.id === 'none' ? undefined : fx.id;
  img.imgFxAmount = k;
  img.set('dirty', true);
}
