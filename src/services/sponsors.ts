import { useApp } from '../store/appStore';
import type { Sponsor, SponsorTier } from '../types';
export { TIER_LABELS, activeSponsors, mainSponsor } from './sponsorUtils';
import { db, uid } from './database';
import { FileError, IMAGE_TYPES, fileBaseName, prepareImage } from './imageProcessing';

/** Guesses the tier from the file name ("main-…", "tecnico-…", "ufficiale-…"). */
function tierFromName(name: string): SponsorTier {
  const n = name.toLowerCase();
  if (/(^|[\s_-])(main|principale)/.test(n)) return 'main';
  if (/tecnic/.test(n)) return 'technical';
  if (/ufficial|official/.test(n)) return 'official';
  return 'partner';
}

function cleanName(name: string): string {
  return fileBaseName(name)
    .replace(/^(main|principale|tecnico|ufficiale|official|partner)\s+/i, '')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- flat background removal ---------- */

/**
 * Removes a flat white/black background connected to the image border (flood fill),
 * keeping same-coloured areas inside the logo. Returns null when there is nothing to remove
 * (already transparent, or the border isn't a uniform colour).
 */
export async function removeFlatBackground(blob: Blob): Promise<Blob | null> {
  if (blob.type === 'image/svg+xml') return null;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Sample the border.
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  let transparent = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const p of border) {
    if (d[p * 4 + 3] < 250) transparent++;
    sr += d[p * 4];
    sg += d[p * 4 + 1];
    sb += d[p * 4 + 2];
  }
  if (transparent > border.length * 0.3) return null; // already has transparency
  const bg = [sr / border.length, sg / border.length, sb / border.length];
  // Only light (white-ish) backgrounds: dark ones are often part of the logo (badges).
  if ((bg[0] + bg[1] + bg[2]) / 3 < 200) return null;
  const dist = (i: number) => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
  const uniform = border.filter((p) => dist(p * 4) < 28).length;
  if (uniform < border.length * 0.85) return null; // border is not a flat colour

  // Flood fill from the border.
  const HARD = 34;
  const SOFT = 80;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const p of border) if (!seen[p] && dist(p * 4) < HARD) {
    seen[p] = 1;
    stack.push(p);
  }
  while (stack.length) {
    const p = stack.pop()!;
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of next) {
      if (q < 0 || seen[q]) continue;
      const dq = dist(q * 4);
      if (dq < HARD) {
        seen[q] = 1;
        stack.push(q);
      } else if (dq < SOFT) {
        // Antialiased edge: partial transparency.
        seen[q] = 2;
        d[q * 4 + 3] = Math.min(d[q * 4 + 3], Math.round(((dq - HARD) / (SOFT - HARD)) * 255));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

/* ---------- adding sponsors ---------- */

/** Adds a sponsor from a file: validates, removes a flat background, stores it. */
export async function addSponsorFile(file: File, opts: { name?: string; tier?: SponsorTier; removeBackground?: boolean } = {}): Promise<Sponsor | null> {
  const app = useApp.getState();
  try {
    const original = await prepareImage(file, IMAGE_TYPES, 'il logo sponsor', 2400);
    const cleaned = opts.removeBackground === false ? null : await removeFlatBackground(original).catch(() => null);
    const name = opts.name ?? cleanName(file.name);
    const origMeta = await app.addAsset(original, 'sponsor', name);
    const finalMeta = cleaned ? await app.addAsset(cleaned, 'sponsor', `${name} (sfondo rimosso)`) : origMeta;
    const list = useApp.getState().settings.sponsors ?? [];
    const sponsor: Sponsor = {
      id: uid(),
      name,
      assetId: finalMeta.id,
      originalAssetId: cleaned ? origMeta.id : null,
      tier: opts.tier ?? tierFromName(file.name),
      active: true,
      order: list.length,
    };
    await useApp.getState().setSettings({ sponsors: [...list, sponsor] });
    return sponsor;
  } catch (e) {
    app.toast(e instanceof FileError ? e.message : `Errore nel caricamento dello sponsor: ${(e as Error).message}`, 'error');
    return null;
  }
}

/* ---------- export ---------- */

const EXT: Record<string, string> = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** File-name prefix that `tierFromName` recognises, so a re-import keeps the tier. */
const TIER_PREFIX: Record<SponsorTier, string> = { main: 'main ', technical: 'tecnico ', official: 'ufficiale ', partner: '' };

/**
 * Downloads every sponsor as a ZIP: the logo in use (ready for `sponsor/puliti/`),
 * the untouched upload in `originali/` when the background was removed, and `sponsor.json`.
 */
export async function exportSponsorsZip(): Promise<number> {
  const { default: JSZip } = await import('jszip');
  const { downloadBlob } = await import('./export');
  const sponsors = [...(useApp.getState().settings.sponsors ?? [])].sort((a, b) => a.order - b.order);
  const zip = new JSZip();
  const used = new Set<string>();
  const unique = (base: string, ext: string) => {
    let n = `${base}.${ext}`;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} ${i}.${ext}`;
    used.add(n.toLowerCase());
    return n;
  };
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'sponsor';
  const meta: object[] = [];
  let count = 0;
  for (const s of sponsors) {
    const rec = await db.get('assets', s.assetId);
    if (!rec) continue;
    const base = safe(`${TIER_PREFIX[s.tier]}${s.name}`);
    const file = unique(base, EXT[rec.blob.type] ?? 'png');
    zip.file(file, rec.blob);
    let original: string | null = null;
    if (s.originalAssetId) {
      const orig = await db.get('assets', s.originalAssetId);
      if (orig) {
        original = `originali/${base}.${EXT[orig.blob.type] ?? 'png'}`;
        zip.file(original, orig.blob);
      }
    }
    meta.push({ name: s.name, tier: s.tier, active: s.active, order: s.order, file, original });
    count++;
  }
  if (!count) {
    useApp.getState().toast('Nessuno sponsor da esportare.', 'info');
    return 0;
  }
  zip.file('sponsor.json', JSON.stringify(meta, null, 2));
  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  downloadBlob(out, `sponsor_${new Date().toISOString().slice(0, 10)}.zip`);
  return count;
}

/* ---------- sponsor/ folder ---------- */

const FOLDER_FILES = import.meta.glob('/sponsor/puliti/*.{png,svg,jpg,jpeg,webp,PNG,SVG,JPG,JPEG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const SPONSOR_FOLDER_COUNT = Object.keys(FOLDER_FILES).length;

const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

let running: Promise<number> | null = null;

/** Imports logos dropped into the project folder `sponsor/puliti/` (once per file unless `force`). */
export function importSponsorFolder(force = false): Promise<number> {
  const prev = running ?? Promise.resolve(0);
  const next = prev.catch(() => 0).then(() => runImport(force));
  running = next.finally(() => {
    if (running === next) running = null;
  });
  return next;
}

async function runImport(force: boolean): Promise<number> {
  const done = new Set(useApp.getState().settings.importedSponsorFiles ?? []);
  let imported = 0;
  for (const [path, url] of Object.entries(FOLDER_FILES)) {
    const file = path.split('/').pop()!;
    if (done.has(file) && !force) continue;
    const name = cleanName(file);
    const exists = (useApp.getState().settings.sponsors ?? []).some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      const blob = await (await fetch(url)).blob();
      const ext = file.split('.').pop()!.toLowerCase();
      // Files in sponsor/puliti are already prepared: keep them as they are.
      if (await addSponsorFile(new File([blob], file, { type: MIME[ext] ?? blob.type }), { removeBackground: false })) imported++;
    }
    done.add(file);
  }
  await useApp.getState().setSettings({ importedSponsorFiles: [...done] });
  return imported;
}
