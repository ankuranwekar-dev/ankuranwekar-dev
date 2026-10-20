import '@/global.css';

import { SEASON_PALETTE, type Phase, type Season } from '@kairos/core';
import { useSyncExternalStore } from 'react';
import { Platform, useColorScheme } from 'react-native';

/**
 * Two moods, both warm. "Dusk" (dark) is the hero: the orb glows best against
 * near-black. "Dawn" (light) is a soft paper white, never clinical blue-white.
 */
const dusk = {
  bg: '#0D0A0C',
  bgRaised: '#16111A',
  card: 'rgba(255,255,255,0.065)',
  cardStrong: 'rgba(255,255,255,0.10)',
  border: 'rgba(255,255,255,0.09)',
  hairline: 'rgba(255,255,255,0.07)',
  text: '#F6EFEA',
  textSecondary: 'rgba(246,239,234,0.64)',
  textTertiary: 'rgba(246,239,234,0.40)',
  inverse: '#0D0A0C',
  positive: '#9FD8B9',
  danger: '#FF8A8A',
  overlay: 'rgba(8,6,8,0.6)',
};

const dawn: typeof dusk = {
  bg: '#F7F2EE',
  bgRaised: '#FFFFFF',
  card: 'rgba(255,255,255,0.72)',
  cardStrong: 'rgba(255,255,255,0.92)',
  border: 'rgba(40,24,32,0.08)',
  hairline: 'rgba(40,24,32,0.06)',
  text: '#1E1519',
  textSecondary: 'rgba(30,21,25,0.62)',
  textTertiary: 'rgba(30,21,25,0.40)',
  inverse: '#FFFFFF',
  positive: '#2F8A5B',
  danger: '#C2364A',
  overlay: 'rgba(30,21,25,0.35)',
};

export type Colors = typeof dusk;

export const Fonts = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'var(--font-display)' })!,
  rounded: Platform.select({ ios: 'ui-rounded', default: 'var(--font-rounded)' })!,
};

export const Space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const Radius = { s: 10, m: 16, l: 22, xl: 28, pill: 999 } as const;
export const MaxWidth = 560;

// On the web a host page may force a theme with <html data-theme="dark|light">; honour it over the OS setting.
function subscribeDocTheme(onChange: () => void): () => void {
  if (Platform.OS !== 'web' || typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}
function docTheme(): string | null {
  return Platform.OS === 'web' && typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : null;
}

export function useTheme() {
  const scheme = useColorScheme();
  const forced = useSyncExternalStore(subscribeDocTheme, docTheme, () => null);
  const dark = forced === 'dark' ? true : forced === 'light' ? false : scheme !== 'light';
  return { dark, colors: dark ? dusk : dawn };
}

export function seasonColors(season: Season | undefined) {
  return SEASON_PALETTE[season ?? 'autumn'];
}

/** Season for a phase, tolerant of hidden phases. */
export function phaseSeason(phase: Phase | undefined): Season | undefined {
  if (!phase) return undefined;
  if (phase === 'menstrual') return 'winter';
  if (phase === 'follicular') return 'spring';
  if (phase === 'ovulatory') return 'summer';
  return 'autumn';
}

/** Accent color for text and icons: the glow itself on dark, a deepened version on light so it stays legible. */
export function ink(hex: string, dark: boolean): string {
  if (dark) return hex;
  const n = parseInt(hex.replace('#', ''), 16);
  const f = 0.58;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Mix a hex color with alpha, e.g. alpha('#FFAA6B', 0.4). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
