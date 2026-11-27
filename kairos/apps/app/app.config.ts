import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Two editions from one codebase, chosen at build time.
 *
 *  - Solo (default): his phone only. He sets up from a photo or screenshot of
 *    her tracker, or a date. No server, no health entitlements. The camera is
 *    used only to photograph her calendar and the photo is read on the phone.
 *  - Paired (EXPO_PUBLIC_RELAY_URL set): adds her side: pairing by QR code,
 *    her signals, and import from Apple Health / Health Connect.
 *
 * Capabilities the solo edition never uses are left out of its binary, so
 * App Review is not shown a HealthKit entitlement with nothing behind it.
 *
 * KAIROS_LINK_DOMAIN (optional, paired only) is a domain you control that
 * serves the apple-app-site-association and assetlinks files, so a pairing
 * link opens the app. Without it, invites use the tender:// scheme.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const paired = Boolean(process.env.EXPO_PUBLIC_RELAY_URL);
  const domain = paired ? process.env.KAIROS_LINK_DOMAIN : undefined;
  const bundleId = process.env.KAIROS_BUNDLE_ID ?? config.ios?.bundleIdentifier ?? 'com.9labs.tenderapp';

  const plugins: NonNullable<ExpoConfig['plugins']> = [...(config.plugins ?? [])];
  if (paired) {
    // Both plugins write the same Info.plist key, so say both things in one sentence.
    const camera =
      'Tender uses the camera to photograph her cycle calendar and to scan a pairing code. Photos are read on this phone and never uploaded.';
    for (const [i, p] of plugins.entries()) {
      if (Array.isArray(p) && p[0] === 'expo-image-picker') plugins[i] = [p[0], { ...(p[1] as object), cameraPermission: camera }];
    }
    plugins.push(
      [
        'expo-camera',
        {
          cameraPermission: camera,
          recordAudioAndroid: false,
        },
      ],
      [
        '@kingstinct/react-native-healthkit',
        {
          NSHealthShareUsageDescription:
            'Tender reads your cycle data (periods, ovulation tests, temperature) to forecast your seasons on this iPhone. It is never uploaded unencrypted.',
          NSHealthUpdateUsageDescription: false,
          background: false,
        },
      ],
      'react-native-health-connect',
    );
  }

  return {
    ...config,
    name: config.name ?? 'Tender',
    slug: config.slug ?? 'tender',
    plugins,
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
      ...(domain ? { associatedDomains: [`applinks:${domain}`] } : {}),
    },
    android: {
      ...config.android,
      // Android package segments cannot start with a digit, so this is not the iOS id (com.9labs.tenderapp).
      package: process.env.KAIROS_BUNDLE_ID ?? config.android?.package ?? 'com.ninelabs.tender',
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
