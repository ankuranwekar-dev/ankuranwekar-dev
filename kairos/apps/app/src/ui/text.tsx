import { Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, useTheme } from './theme';

type Variant = 'display' | 'title' | 'title2' | 'headline' | 'body' | 'callout' | 'footnote' | 'caption' | 'label';
type Tone = 'primary' | 'secondary' | 'tertiary' | 'inverse';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: Fonts.serif, fontSize: 46, lineHeight: 50, letterSpacing: -0.6 },
  title: { fontFamily: Fonts.serif, fontSize: 34, lineHeight: 38, letterSpacing: -0.4 },
  title2: { fontFamily: Fonts.serif, fontSize: 26, lineHeight: 30, letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },
  callout: { fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 11.5, lineHeight: 14, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: -0.05 },
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
  const serif = base.fontFamily === Fonts.serif;
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? toneColor },
        italic && serif ? { fontFamily: Fonts.serifItalic } : null,
        italic && !serif ? { fontStyle: 'italic' } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
