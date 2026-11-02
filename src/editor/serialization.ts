import type { StaticCanvas } from 'fabric';
import { ASSET_PREFIX, assetIdFromUrl, getAssetUrl } from '../services/assets';
import { CUSTOM_PROPS } from './fabricSetup';

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const LOGO_PLACEHOLDER = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="960" viewBox="0 0 200 240"><path d="M100 8 L188 34 V120 C188 178 146 214 100 232 C54 214 12 178 12 120 V34 Z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.55)" stroke-width="5" stroke-dasharray="12 8"/><text x="100" y="132" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="3">LOGO</text></svg>`,
);

export const PHOTO_PLACEHOLDER = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 160 100"><rect width="160" height="100" fill="#1b1f2a"/><rect x="2" y="2" width="156" height="96" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" stroke-dasharray="4 3"/><g fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"><rect x="64" y="38" width="32" height="22" rx="3"/><circle cx="80" cy="49" r="6"/></g><text x="80" y="74" font-family="Arial, sans-serif" font-size="6" fill="rgba(255,255,255,0.65)" text-anchor="middle" letter-spacing="1">FOTO DELLA PARTITA</text></svg>`,
);

export const MISSING_PLACEHOLDER = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 100 100"><rect width="100" height="100" fill="rgba(255,255,255,0.08)"/><text x="50" y="54" font-family="Arial" font-size="9" fill="rgba(255,255,255,0.6)" text-anchor="middle">Immagine mancante</text></svg>`,
);

export function placeholderFor(binding: string | undefined): string {
  if (binding === 'photo') return PHOTO_PLACEHOLDER;
  if (binding === 'homeLogo' || binding === 'awayLogo') return LOGO_PLACEHOLDER;
  return MISSING_PLACEHOLDER;
}

function walk(objs: any[] | undefined, fn: (o: any) => void) {
  for (const o of objs ?? []) {
    fn(o);
    if (Array.isArray(o.objects)) walk(o.objects, fn);
  }
}

/** Raw canvas JSON (live object URLs). Used for undo history. */
export function canvasToRaw(canvas: StaticCanvas): any {
  return canvas.toObject(CUSTOM_PROPS);
}

/** Converts live JSON to a storable form: blob: URLs become `asset:<id>` references. */
export function toStored(raw: any): any {
  const json = structuredClone(raw);
  walk(json.objects, (o) => {
    if (typeof o.src !== 'string') return;
    if (o.assetId) {
      o.src = ASSET_PREFIX + o.assetId;
    } else if (o.src.startsWith('blob:')) {
      const id = assetIdFromUrl(o.src);
      o.src = id ? ASSET_PREFIX + id : placeholderFor(o.binding);
    }
  });
  return json;
}

/** Resolves `asset:<id>` references to live object URLs (or placeholders when missing). */
export async function hydrate(stored: any): Promise<any> {
  const json = structuredClone(stored);
  const jobs: Promise<void>[] = [];
  walk(json.objects, (o) => {
    if (typeof o.src === 'string' && o.src.startsWith(ASSET_PREFIX)) {
      const id = o.src.slice(ASSET_PREFIX.length);
      jobs.push(
        getAssetUrl(id).then((url) => {
          if (url) o.src = url;
          else {
            o.src = placeholderFor(o.binding);
            o.assetId = null;
          }
        }),
      );
    }
  });
  await Promise.all(jobs);
  return json;
}
