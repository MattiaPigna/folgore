import { create } from 'zustand';
import type { GraphicKind } from '../types';
import { GRAPHIC_KINDS } from '../types';

export type Page = 'new' | 'archive' | 'standings' | 'teams' | 'logos' | 'sponsors' | 'studio' | 'templates' | 'settings' | 'editor';

export interface Route {
  page: Page;
  matchId?: string;
  kind?: GraphicKind;
  /** Image opened in the retouching studio. */
  assetId?: string;
}

const PAGES: Page[] = ['new', 'archive', 'standings', 'teams', 'logos', 'sponsors', 'studio', 'templates', 'settings', 'editor'];

function parse(hash: string): Route {
  const [page, matchId, kind] = hash.replace(/^#\/?/, '').split('/');
  if (page === 'studio') return { page: 'studio', assetId: matchId || undefined };
  if (page === 'editor' && matchId) {
    return { page: 'editor', matchId, kind: GRAPHIC_KINDS.includes(kind as GraphicKind) ? (kind as GraphicKind) : 'matchday' };
  }
  return { page: PAGES.includes(page as Page) && page !== 'editor' ? (page as Page) : 'archive' };
}

function format(r: Route): string {
  if (r.page === 'studio' && r.assetId) return `#/studio/${r.assetId}`;
  return r.page === 'editor' ? `#/editor/${r.matchId}/${r.kind ?? 'matchday'}` : `#/${r.page}`;
}

interface RouteState {
  route: Route;
  go: (r: Route) => void;
}

export const useRoute = create<RouteState>((set) => ({
  route: parse(location.hash),
  go(r) {
    const h = format(r);
    if (location.hash !== h) history.pushState(null, '', h);
    set({ route: r });
  },
}));

window.addEventListener('popstate', () => useRoute.setState({ route: parse(location.hash) }));
window.addEventListener('hashchange', () => useRoute.setState({ route: parse(location.hash) }));
