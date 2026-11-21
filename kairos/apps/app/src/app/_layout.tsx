import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useBackgroundWork } from '@/state/effects';
import { KairosProvider } from '@/state/kairos';
import { useHydrated } from '@/state/store';
import { Showcase } from '@/ui/showcase';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Arial is a system font, so there is nothing to load: the app is ready as soon as its saved state is.
  const ready = useHydrated();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <KairosProvider>
      <App />
    </KairosProvider>
  );
}

function App() {
  const { dark, colors } = useTheme();
  useBackgroundWork(true);

  const navTheme = dark
    ? {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.bg,
          card: colors.bg,
        },
      };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <Showcase>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="welcome" />
              <Stack.Screen name="setup" />
              <Stack.Screen name="ready" options={{ gestureEnabled: false }} />
              <Stack.Screen name="today" />
              <Stack.Screen name="import" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="scan" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="pair" />
              <Stack.Screen
                name="nudge"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.62, 0.95],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                  contentStyle: { backgroundColor: colors.bgRaised },
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="rhythm"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.95],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                  contentStyle: { backgroundColor: colors.bgRaised },
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="profile"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.95],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                  contentStyle: { backgroundColor: colors.bgRaised },
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="account"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.95],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                  contentStyle: { backgroundColor: colors.bgRaised },
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="history"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.95],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                  contentStyle: { backgroundColor: colors.bgRaised },
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="invite"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.75, 0.95],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                  contentStyle: { backgroundColor: colors.bgRaised },
                  animation: 'slide_from_bottom',
                }}
              />
            </Stack>
          </Showcase>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
