import { create } from 'zustand';
import type { GraphicKind } from '../types';
import { GRAPHIC_KINDS } from '../types';

export type Page = 'new' | 'archive' | 'standings' | 'teams' | 'logos' | 'sponsors' | 'studio' | 'templates' | 'settings' | 'editor' | 'goalvideo';

export interface Route {
  page: Page;
  matchId?: string;
  kind?: GraphicKind;
  /** Image opened in the retouching studio. */
  assetId?: string;
  /** Goal video page: which goal to preview/export (undefined = latest goal, or sample data if none). */
  goalId?: string;
}

const PAGES: Page[] = ['new', 'archive', 'standings', 'teams', 'logos', 'sponsors', 'studio', 'templates', 'settings', 'editor', 'goalvideo'];

function parse(hash: string): Route {
  const [page, matchId, extra] = hash.replace(/^#\/?/, '').split('/');
  if (page === 'studio') return { page: 'studio', assetId: matchId || undefined };
  if (page === 'editor' && matchId) {
    return { page: 'editor', matchId, kind: GRAPHIC_KINDS.includes(extra as GraphicKind) ? (extra as GraphicKind) : 'matchday' };
  }
  if (page === 'goalvideo' && matchId) {
    return { page: 'goalvideo', matchId, goalId: extra && extra !== '-' ? extra : undefined };
  }
  return { page: PAGES.includes(page as Page) && page !== 'editor' && page !== 'goalvideo' ? (page as Page) : 'archive' };
}

function format(r: Route): string {
  if (r.page === 'studio' && r.assetId) return `#/studio/${r.assetId}`;
  if (r.page === 'editor') return `#/editor/${r.matchId}/${r.kind ?? 'matchday'}`;
  if (r.page === 'goalvideo') return `#/goalvideo/${r.matchId}/${r.goalId ?? '-'}`;
  return `#/${r.page}`;
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
