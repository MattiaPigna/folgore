import { blobToDataUrl, dataUrlToBlob } from './assets';
import { db, getDB } from './database';
import type { AssetRecord } from '../types';

const FORMAT = 'matchday-studio-backup';

export async function createBackup(): Promise<Blob> {
  const [assets, teams, matches, templates, fonts, settings] = await Promise.all([
    db.getAll('assets'),
    db.getAll('teams'),
    db.getAll('matches'),
    db.getAll('templates'),
    db.getAll('fonts'),
    db.getSettings(),
  ]);
  const encodedAssets = await Promise.all(
    assets.map(async (a) => ({ id: a.id, kind: a.kind, name: a.name, mime: a.mime, createdAt: a.createdAt, data: await blobToDataUrl(a.blob) })),
  );
  const payload = {
    format: FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    assets: encodedAssets,
    teams,
    matches,
    templates,
    fonts,
    settings: settings ?? null,
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function restoreBackup(file: File): Promise<{ matches: number; teams: number; assets: number }> {
  let payload: any;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('Il file selezionato non è un backup valido (JSON non leggibile).');
  }
  if (payload?.format !== FORMAT || !Array.isArray(payload.assets) || !Array.isArray(payload.matches)) {
    throw new Error('Il file selezionato non è un backup di Matchday Studio.');
  }
  const assets: AssetRecord[] = await Promise.all(
    payload.assets.map(async (a: any) => {
      const blob = await dataUrlToBlob(a.data);
      return { id: a.id, kind: a.kind, name: a.name, mime: a.mime, createdAt: a.createdAt, blob: a.mime ? new Blob([blob], { type: a.mime }) : blob };
    }),
  );
  const d = await getDB();
  const tx = d.transaction(['assets', 'teams', 'matches', 'templates', 'fonts', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('assets').clear(),
    tx.objectStore('teams').clear(),
    tx.objectStore('matches').clear(),
    tx.objectStore('templates').clear(),
    tx.objectStore('fonts').clear(),
    tx.objectStore('settings').clear(),
  ]);
  for (const a of assets) await tx.objectStore('assets').put(a);
  for (const t of payload.teams ?? []) await tx.objectStore('teams').put(t);
  for (const m of payload.matches ?? []) await tx.objectStore('matches').put(m);
  for (const t of payload.templates ?? []) await tx.objectStore('templates').put(t);
  for (const f of payload.fonts ?? []) await tx.objectStore('fonts').put(f);
  if (payload.settings) await tx.objectStore('settings').put({ key: 'app', value: payload.settings });
  await tx.done;
  return { matches: payload.matches.length, teams: (payload.teams ?? []).length, assets: assets.length };
}
