/**
 * Seasons: the language Kairos speaks to him.
 *
 * Clinical phase names ("luteal", "follicular") mean nothing to most men and
 * are the last thing anyone wants on a lock screen. The four seasons map onto
 * the cycle intuitively — winter (bleed), spring (rising energy), summer
 * (ovulation), autumn (winding down) — and double as a discreet codename.
 * The metaphor was popularised by Alexandra Pope and Sjanie Hugo Wurlitzer
 * ("Wild Power", 2017).
 *
 * The reads below describe common tendencies, not rules. Prospective studies
 * of cycle-linked mood are mixed (Romans et al. 2012 reviewed 47; only ~15%
 * found negative mood confined to the premenstrual phase). That is why her
 * one-tap signals always override the season.
 */

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'premenstrual';

export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

export function seasonOf(phase: Phase): Season {
  switch (phase) {
    case 'menstrual':
      return 'winter';
    case 'follicular':
      return 'spring';
    case 'ovulatory':
      return 'summer';
    case 'luteal':
    case 'premenstrual':
      return 'autumn';
  }
}

export interface SeasonCopy {
  season: Season;
  phase: Phase;
  name: string;
  glyph: string;
  /** One line for him, shown under the orb. */
  read: string;
  /** What tends to land well. */
  helps: string[];
  /** What tends not to. */
  avoid: string[];
  /** One line for her, about her own week. */
  herRead: string;
  /** Neutral codename used on calendars and lock screens in discreet mode. */
  codename: string;
}

export const PHASE_COPY: Record<Phase, SeasonCopy> = {
  menstrual: {
    season: 'winter',
    phase: 'menstrual',
    name: 'Winter',
    glyph: '❄︎',
    read: 'Her energy is at its lowest. Comfort beats plans.',
    helps: [
      'Warmth: a heat pad, tea, the good blanket',
      'Quietly take a chore off her list',
      'Her comfort food, unprompted',
      'An easy night in',
    ],
    avoid: ['Big social plans', 'Asking "is it that time?"'],
    herRead: 'Rest counts as productive. Let him carry a little more this week.',
    codename: 'Winter',
  },
  follicular: {
    season: 'spring',
    phase: 'follicular',
    name: 'Spring',
    glyph: '❀',
    read: 'Energy and optimism are rising. She’s open to something new.',
    helps: [
      'Plan something you have never done together',
      'A new restaurant, a new walk, a new playlist',
      'Ask what she is excited about, and actually listen',
    ],
    avoid: ['Defaulting to the couch', 'Vetoing her ideas'],
    herRead: 'Momentum is building. A good week to start things.',
    codename: 'Spring',
  },
  ovulatory: {
    season: 'summer',
    phase: 'ovulatory',
    name: 'Summer',
    glyph: '☀︎',
    read: 'She’s at her most radiant. Connection comes easily.',
    helps: [
      'A real date: dress up a little',
      'Specific compliments, not generic ones',
      'Closeness, with no agenda',
    ],
    avoid: ['Making it about one thing', 'Scrolling through dinner'],
    herRead: 'Your brightest days. Say yes to what sounds fun.',
    codename: 'Summer',
  },
  luteal: {
    season: 'autumn',
    phase: 'luteal',
    name: 'Autumn',
    glyph: '❦',
    read: 'Settling in. Calm, routine and comfort matter more now.',
    helps: ['Cozy plans at home', 'Handle the logistics', 'Long hugs, early nights'],
    avoid: ['Last-minute plan changes', 'Overbooking the weekend'],
    herRead: 'Turning inward. Protect your evenings.',
    codename: 'Autumn',
  },
  premenstrual: {
    season: 'autumn',
    phase: 'premenstrual',
    name: 'Late autumn',
    glyph: '❦',
    read: 'Patience season. Small things can feel big; be her calm.',
    helps: [
      'Stock her favorite snacks before she asks',
      'Reassure more than you think you need to',
      'Keep plans flexible',
    ],
    avoid: ['Taking a short reply personally', 'Ever saying "is it PMS?"'],
    herRead: 'Be gentle with yourself. He has a heads-up.',
    codename: 'Late autumn',
  },
};

/** Palette per season: two gradient stops plus an ink color that reads on both. */
export const SEASON_PALETTE: Record<Season, { from: string; to: string; ink: string; glow: string }> = {
  winter: { from: '#8E2C48', to: '#3A1024', ink: '#F7D9E2', glow: '#C2456B' },
  spring: { from: '#FFC2A1', to: '#9FD8B9', ink: '#24372D', glow: '#FFB08A' },
  summer: { from: '#FFD27A', to: '#FF7E8E', ink: '#43201A', glow: '#FFAA6B' },
  autumn: { from: '#C3A6F0', to: '#E7A27C', ink: '#2E2240', glow: '#B79BEB' },
};
