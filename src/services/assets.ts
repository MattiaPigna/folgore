import { db, uid } from './database';
import type { AssetKind, AssetRecord } from '../types';

/** Live object URLs for stored blobs. Never persisted: saved JSON uses `asset:<id>`. */
const urlCache = new Map<string, string>();
const urlToAsset = new Map<string, string>();

export const ASSET_PREFIX = 'asset:';

export async function saveAsset(blob: Blob, kind: AssetKind, name: string, id: string = uid()): Promise<AssetRecord> {
  const rec: AssetRecord = { id, kind, name, mime: blob.type, blob, createdAt: Date.now() };
  await db.put('assets', rec);
  return rec;
}

export async function deleteAsset(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
    urlToAsset.delete(url);
  }
  await db.delete('assets', id);
}

export async function getAssetUrl(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = await db.get('assets', id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  urlToAsset.set(url, id);
  return url;
}

export function assetIdFromUrl(url: string): string | null {
  return urlToAsset.get(url) ?? null;
}

export async function renameAsset(id: string, name: string): Promise<void> {
  const rec = await db.get('assets', id);
  if (rec) await db.put('assets', { ...rec, name });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
