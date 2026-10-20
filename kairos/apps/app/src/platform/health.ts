import type { HealthImport } from './health-shared';

/** Web has no health store: she logs by hand (two taps a month) or uses the phone app. */
export const healthSourceName = 'Health';
export const healthSource = 'manual' as 'apple-health' | 'health-connect' | 'manual';
export const healthAvailable = () => false;
export async function importFromHealth(): Promise<HealthImport> {
  throw new Error('Health import is available in the iPhone and Android apps');
}
