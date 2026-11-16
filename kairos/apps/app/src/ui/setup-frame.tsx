import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { IconButton } from './controls';
import { Screen } from './screen';
import { T } from './text';
import { Space } from './theme';

/** A setup step: a back arrow, one question in large type, and the answer underneath. */
export function SetupFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Screen season="autumn" footer={footer}>
      <View style={{ marginLeft: -8, marginBottom: Space.xl }}>
        <IconButton
          icon="back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
        />
      </View>
      <Animated.View entering={FadeInDown.duration(500)} style={{ gap: Space.s, marginBottom: Space.xxl }}>
        <T variant="title" style={{ fontSize: 38, lineHeight: 41 }}>
          {title}
        </T>
        {subtitle ? (
          <T variant="callout" tone="secondary">
            {subtitle}
          </T>
        ) : null}
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(500)}>{children}</Animated.View>
    </Screen>
  );
}
