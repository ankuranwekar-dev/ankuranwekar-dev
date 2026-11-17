import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Two editions from one codebase, chosen at build time.
 *
 *  - Solo (default): his phone only. He sets up from a screenshot of her
 *    tracker or a date. No server, no camera, no health entitlements.
 *  - Paired (EXPO_PUBLIC_RELAY_URL set): adds her side: pairing by QR code,
 *    her signals, and import from Apple Health / Health Connect.
 *
 * Capabilities the solo edition never uses are left out of its binary, so
 * App Review is not shown a HealthKit entitlement with nothing behind it.
 *
 * KAIROS_LINK_DOMAIN (optional, paired only) is a domain you control that
 * serves the apple-app-site-association and assetlinks files, so a pairing
 * link opens the app. Without it, invites use the kairos:// scheme.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const paired = Boolean(process.env.EXPO_PUBLIC_RELAY_URL);
  const domain = paired ? process.env.KAIROS_LINK_DOMAIN : undefined;
  const bundleId = process.env.KAIROS_BUNDLE_ID ?? config.ios?.bundleIdentifier ?? 'love.kairos.app';

  const plugins: NonNullable<ExpoConfig['plugins']> = [...(config.plugins ?? [])];
  if (paired) {
    plugins.push(
      [
        'expo-camera',
        {
          cameraPermission: 'Kairos uses the camera only to scan your partner’s pairing code.',
          recordAudioAndroid: false,
        },
      ],
      [
        '@kingstinct/react-native-healthkit',
        {
          NSHealthShareUsageDescription:
            'Kairos reads your cycle data (periods, ovulation tests, temperature) to forecast your seasons on this iPhone. It is never uploaded unencrypted.',
          NSHealthUpdateUsageDescription: false,
          background: false,
        },
      ],
      'react-native-health-connect',
    );
  }

  return {
    ...config,
    name: config.name ?? 'Kairos',
    slug: config.slug ?? 'kairos',
    plugins,
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
      ...(domain ? { associatedDomains: [`applinks:${domain}`] } : {}),
    },
    android: {
      ...config.android,
      package: process.env.KAIROS_BUNDLE_ID ?? config.android?.package ?? 'love.kairos.app',
      ...(paired
        ? {
            permissions: [
              'android.permission.health.READ_MENSTRUATION',
              'android.permission.health.READ_OVULATION_TEST',
              'android.permission.health.READ_CERVICAL_MUCUS',
              'android.permission.health.READ_BASAL_BODY_TEMPERATURE',
            ],
          }
        : {}),
      ...(domain
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [{ scheme: 'https', host: domain, pathPrefix: '/pair' }],
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }
        : {}),
    },
    extra: {
      ...config.extra,
      edition: paired ? 'paired' : 'solo',
      ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    },
  };
};
