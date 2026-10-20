import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComponentProps } from 'react';

type SFName = Extract<SymbolViewProps['name'], string>;
type MaterialName = NonNullable<Extract<SymbolViewProps['name'], object>['android']>;

/** One icon vocabulary: SF Symbols on Apple platforms, Material Symbols on Android and the web. */
const ICONS = {
  today: ['sun.horizon', 'wb_twilight'],
  rhythm: ['circle.dashed', 'donut_large'],
  her: ['heart.text.square', 'favorite'],
  signals: ['hand.wave', 'waving_hand'],
  sharing: ['lock.shield', 'shield_lock'],
  check: ['checkmark', 'check'],
  swap: ['arrow.triangle.2.circlepath', 'autorenew'],
  later: ['moon.zzz', 'bedtime'],
  calendar: ['calendar.badge.plus', 'calendar_add_on'],
  bell: ['bell', 'notifications'],
  gear: ['gearshape', 'settings'],
  plus: ['plus', 'add'],
  chevron: ['chevron.right', 'chevron_right'],
  back: ['chevron.left', 'chevron_left'],
  close: ['xmark', 'close'],
  message: ['message', 'chat_bubble'],
  bag: ['bag', 'shopping_bag'],
  table: ['fork.knife', 'restaurant'],
  timer: ['timer', 'timer'],
  sparkles: ['sparkles', 'auto_awesome'],
  lock: ['lock.fill', 'lock'],
  eye: ['eye', 'visibility'],
  eyeOff: ['eye.slash', 'visibility_off'],
  heart: ['heart.fill', 'favorite'],
  drop: ['drop.fill', 'water_drop'],
  test: ['testtube.2', 'science'],
  thermometer: ['thermometer.medium', 'device_thermostat'],
  qr: ['qrcode', 'qr_code_2'],
  scan: ['qrcode.viewfinder', 'qr_code_scanner'],
  link: ['link', 'link'],
  pause: ['pause.circle', 'pause_circle'],
  person: ['person.crop.circle', 'account_circle'],
  health: ['heart.text.clipboard', 'monitor_heart'],
  quote: ['quote.opening', 'format_quote'],
  note: ['square.and.pencil', 'edit_note'],
  shield: ['checkmark.shield', 'verified_user'],
  flame: ['flame', 'local_fire_department'],
  hold: ['hands.and.sparkles', 'volunteer_activism'],
  space: ['moon.stars', 'nights_stay'],
  craving: ['birthday.cake', 'cake'],
  rain: ['cloud.rain', 'rainy'],
  cramps: ['bandage', 'healing'],
  sun: ['sun.max', 'sunny'],
  party: ['party.popper', 'celebration'],
  home: ['house', 'home'],
} as const satisfies Record<string, readonly [SFName, MaterialName]>;

export type IconName = keyof typeof ICONS;

interface IconProps extends Omit<ComponentProps<typeof SymbolView>, 'name'> {
  name: IconName;
  size?: number;
  color: string;
}

export function Icon({ name, size = 20, color, ...rest }: IconProps) {
  const [ios, material] = ICONS[name];
  return (
    <SymbolView
      {...rest}
      name={{ ios, android: material, web: material }}
      size={size}
      tintColor={color}
    />
  );
}

/** Icons for her one-tap signals. */
export const SIGNAL_ICON: Record<string, IconName> = {
  'hold-me': 'hold',
  space: 'space',
  craving: 'craving',
  'rough-day': 'rain',
  cramps: 'cramps',
  'feeling-great': 'sun',
  'take-me-out': 'party',
  'come-home': 'home',
};
