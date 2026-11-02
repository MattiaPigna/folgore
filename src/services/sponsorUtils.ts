import type { Settings, SponsorTier } from '../types';
import type { Sponsor } from '../types';

export const TIER_LABELS: Record<SponsorTier, string> = {
  main: 'Main sponsor',
  technical: 'Sponsor tecnico',
  official: 'Sponsor ufficiale',
  partner: 'Partner',
};

const TIER_RANK: Record<SponsorTier, number> = { main: 0, technical: 1, official: 2, partner: 3 };

/** Active sponsors in display order: main first, then technical, official, partners (by manual order). */
export function activeSponsors(settings: Pick<Settings, 'sponsors'>): Sponsor[] {
  return (settings.sponsors ?? []).filter((s) => s.active).sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order);
}

export function mainSponsor(settings: Pick<Settings, 'sponsors'>): Sponsor | undefined {
  const list = activeSponsors(settings);
  return list.find((s) => s.tier === 'main') ?? list[0];
}
