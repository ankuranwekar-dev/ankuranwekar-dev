import { Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, useTheme } from './theme';

type Variant = 'display' | 'title' | 'title2' | 'headline' | 'body' | 'callout' | 'footnote' | 'caption' | 'label';
type Tone = 'primary' | 'secondary' | 'tertiary' | 'inverse';

// Arial is wider and heavier-looking than the condensed serif these headings were drawn for, so the display
// sizes are smaller than they were and the headings are bold; everything is one family.
const family = Fonts.sans;
const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: family, fontSize: 38, lineHeight: 43, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontFamily: family, fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -0.5 },
  title2: { fontFamily: family, fontSize: 23, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontFamily: family, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontFamily: family, fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },
  callout: { fontFamily: family, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  footnote: { fontFamily: family, fontSize: 13, lineHeight: 18 },
  caption: {
    fontFamily: family,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  label: { fontFamily: family, fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: -0.05 },
};

export interface TProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  color?: string;
  italic?: boolean;
  center?: boolean;
}

export function T({ variant = 'body', tone = 'primary', color, italic, center, style, ...rest }: TProps) {
  const { colors } = useTheme();
  const toneColor =
    tone === 'secondary'
      ? colors.textSecondary
      : tone === 'tertiary'
        ? colors.textTertiary
        : tone === 'inverse'
          ? colors.inverse
          : colors.text;
  const base = VARIANTS[variant];
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? toneColor },
        italic ? { fontStyle: 'italic' } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
