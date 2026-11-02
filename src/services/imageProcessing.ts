export const LOGO_TYPES = ['image/png', 'image/svg+xml'];
export const BG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
export const FONT_EXT = ['ttf', 'otf', 'woff2', 'woff'];

export class FileError extends Error {}

function ext(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** Some systems report empty/odd MIME types; fall back to the extension. */
export function guessMime(file: File): string {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  const e = ext(file.name);
  return (
    { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>
  )[e] ?? '';
}

export function checkType(file: File, allowed: string[], label: string): string {
  const mime = guessMime(file);
  if (!allowed.includes(mime)) {
    throw new FileError(`Formato non supportato per ${label}: "${file.name}". Formati ammessi: ${allowed.map((m) => m.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg')).join(', ').toUpperCase()}.`);
  }
  return mime;
}

/**
 * Ensures an SVG has explicit, large intrinsic width/height so browsers rasterize it
 * at high resolution (crisp logos) and report a valid natural size.
 */
export async function normalizeSvg(blob: Blob): Promise<Blob> {
  const text = await blob.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new FileError('Il file SVG non è valido.');
  }
  let vbW = 0;
  let vbH = 0;
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    vbW = vb[2];
    vbH = vb[3];
  } else {
    vbW = parseFloat(svg.getAttribute('width') || '0');
    vbH = parseFloat(svg.getAttribute('height') || '0');
    if (vbW > 0 && vbH > 0) svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  }
  if (!(vbW > 0 && vbH > 0)) {
    vbW = 1000;
    vbH = 1000;
  }
  const target = 1600;
  const k = target / Math.max(vbW, vbH);
  svg.setAttribute('width', String(Math.round(vbW * k)));
  svg.setAttribute('height', String(Math.round(vbH * k)));
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' });
}

/** Verifies the image actually decodes. Returns natural size. */
export function probeImage(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) reject(new FileError('Immagine senza dimensioni valide.'));
      else resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new FileError('Impossibile leggere l\'immagine: file danneggiato o formato non supportato.'));
    };
    img.src = url;
  });
}

/**
 * Downscales very large photos (long side > maxSide) to keep editing and filters fluid.
 * The cap stays well above the largest export size, so output quality is unaffected.
 */
async function limitSize(blob: Blob, size: { width: number; height: number }, maxSide: number): Promise<Blob> {
  const long = Math.max(size.width, size.height);
  if (long <= maxSide) return blob;
  const k = maxSide / long;
  const w = Math.round(size.width * k);
  const h = Math.round(size.height * k);
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve) => c.toBlob((b) => resolve(b ?? blob), type, 0.95));
}

/** Validates and normalizes an image file. `maxSide` caps large photos (not SVG). */
export async function prepareImage(file: File, allowed: string[], label: string, maxSide?: number): Promise<Blob> {
  const mime = checkType(file, allowed, label);
  let blob: Blob = file.type === mime ? file : new Blob([file], { type: mime });
  if (mime === 'image/svg+xml') blob = await normalizeSvg(blob);
  const size = await probeImage(blob);
  if (maxSide && mime !== 'image/svg+xml') blob = await limitSize(blob, size, maxSide);
  return blob;
}

export const PHOTO_MAX_SIDE = 3000;

export function checkFont(file: File): string {
  const e = ext(file.name);
  if (!FONT_EXT.includes(e)) throw new FileError(`Formato font non supportato: "${file.name}". Usa TTF, OTF o WOFF2.`);
  return e;
}

export function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

/** Opens the native file picker. */
export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    input.click();
  });
}
