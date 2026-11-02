import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetRecord, FontRecord, Match, Settings, Team, Template } from '../types';

interface StudioDB extends DBSchema {
  assets: { key: string; value: AssetRecord };
  teams: { key: string; value: Team };
  matches: { key: string; value: Match };
  templates: { key: string; value: Template };
  fonts: { key: string; value: FontRecord };
  settings: { key: string; value: { key: string; value: Settings } };
}

export type StoreName = 'assets' | 'teams' | 'matches' | 'templates' | 'fonts' | 'settings';
export const STORE_NAMES: StoreName[] = ['assets', 'teams', 'matches', 'templates', 'fonts', 'settings'];

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<StudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StudioDB>('matchday-studio', 1, {
      upgrade(db) {
        db.createObjectStore('assets', { keyPath: 'id' });
        db.createObjectStore('teams', { keyPath: 'id' });
        db.createObjectStore('matches', { keyPath: 'id' });
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('fonts', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export const db = {
  async getAll<S extends Exclude<StoreName, 'settings'>>(store: S): Promise<StudioDB[S]['value'][]> {
    return (await getDB()).getAll(store);
  },
  async get<S extends StoreName>(store: S, key: string): Promise<StudioDB[S]['value'] | undefined> {
    return (await getDB()).get(store, key);
  },
  async put<S extends StoreName>(store: S, value: StudioDB[S]['value']): Promise<void> {
    await (await getDB()).put(store, value);
  },
  async delete(store: StoreName, key: string): Promise<void> {
    await (await getDB()).delete(store, key);
  },
  async clearAll(): Promise<void> {
    const d = await getDB();
    const tx = d.transaction(STORE_NAMES, 'readwrite');
    await Promise.all(STORE_NAMES.map((s) => tx.objectStore(s).clear()));
    await tx.done;
  },
  async getSettings(): Promise<Settings | undefined> {
    return (await (await getDB()).get('settings', 'app'))?.value;
  },
  async putSettings(value: Settings): Promise<void> {
    await (await getDB()).put('settings', { key: 'app', value });
  },
};

export function uid(): string {
  return crypto.randomUUID();
}
