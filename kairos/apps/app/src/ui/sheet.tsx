import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from './controls';
import { Icon } from './icon';
import { T } from './text';
import { alpha, MaxWidth, Space, useTheme } from './theme';

/** Content of a sheet route: a title, a close button, one scrolling column. */
export function Sheet({ title, children }: { title?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bgRaised }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.root,
        // An iOS sheet starts below the status bar by itself; elsewhere the sheet is a full page.
        { paddingTop: (Platform.OS === 'ios' ? 0 : insets.top) + Space.xl, paddingBottom: insets.bottom + Space.xxxl },
      ]}>
      <View style={styles.column}>
        <View style={styles.top}>
          <T variant="title2" style={{ flex: 1 }}>
            {title ?? ''}
          </T>
          <Press
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: alpha(colors.text, 0.08) }]}>
            <Icon name="close" size={13} color={colors.text} />
          </Press>
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: Space.xl },
  column: { width: '100%', maxWidth: MaxWidth },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 34, marginBottom: Space.l },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
