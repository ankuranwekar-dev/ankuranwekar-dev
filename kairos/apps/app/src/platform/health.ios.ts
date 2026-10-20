import {
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import type { CycleData, LHTest, MucusObservation, TemperatureReading } from '@kairos/core';

import { dayOf, MUCUS_BY_INDEX, periodsFromFlowDays, summarise, yearAgo, type HealthImport } from './health-shared';

export const healthSourceName = 'Apple Health';
export const healthSource = 'apple-health' as const;
export const healthAvailable = () => isHealthDataAvailable();

// HealthKit category raw values (HKCategoryValueMenstrualFlow / OvulationTestResult).
const FLOW_NONE = 5;
const OVULATION_POSITIVE = 2;
const OVULATION_NEGATIVE = 1;

/**
 * Reads only cycle-related types, read-only. Nothing is written back to
 * Health, and nothing read here ever leaves her phone: it feeds the on-device
 * forecast, and only the reduced snapshot is shared (encrypted) with him.
 */
export async function importFromHealth(): Promise<HealthImport> {
  await requestAuthorization({
    toRead: [
      'HKCategoryTypeIdentifierMenstrualFlow',
      'HKCategoryTypeIdentifierOvulationTestResult',
      'HKCategoryTypeIdentifierCervicalMucusQuality',
      'HKCategoryTypeIdentifierPregnancyTestResult',
      'HKQuantityTypeIdentifierBasalBodyTemperature',
      'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
    ],
  });
  const filter = { date: { startDate: yearAgo(), endDate: new Date() } };

  const flow = await queryCategorySamples('HKCategoryTypeIdentifierMenstrualFlow', { filter, limit: 0, ascending: true });
  const periods = periodsFromFlowDays(
    flow
      .filter((s) => Number(s.value) !== FLOW_NONE)
      .map((s) => ({ date: dayOf(s.startDate), cycleStart: Boolean(s.metadata?.HKMenstrualCycleStart) })),
  );

  const ovulation = await queryCategorySamples('HKCategoryTypeIdentifierOvulationTestResult', { filter, limit: 0 });
  const lhTests: LHTest[] = ovulation
    .filter((s) => Number(s.value) === OVULATION_POSITIVE || Number(s.value) === OVULATION_NEGATIVE)
    .map((s) => ({ date: dayOf(s.startDate), result: Number(s.value) === OVULATION_POSITIVE ? 'positive' : 'negative' }));

  const mucusSamples = await queryCategorySamples('HKCategoryTypeIdentifierCervicalMucusQuality', { filter, limit: 0 });
  const mucus: MucusObservation[] = mucusSamples.flatMap((s) => {
    const type = MUCUS_BY_INDEX[Number(s.value)];
    return type ? [{ date: dayOf(s.startDate), type }] : [];
  });

  const bbt = await queryQuantitySamples('HKQuantityTypeIdentifierBasalBodyTemperature', { filter, limit: 0, unit: 'degC' });
  const wrist = await queryQuantitySamples('HKQuantityTypeIdentifierAppleSleepingWristTemperature', {
    filter,
    limit: 0,
    unit: 'degC',
  });
  const temperatures: TemperatureReading[] = [
    ...bbt.map((s) => ({ date: dayOf(s.startDate), celsius: s.quantity, source: 'bbt' as const })),
    // Wrist temperature is recorded overnight; attribute it to the morning it ends on.
    ...wrist.map((s) => ({ date: dayOf(s.endDate), celsius: s.quantity, source: 'wrist' as const })),
  ];

  const data: CycleData = { periods, lhTests, temperatures, mucus };
  return { data, summary: summarise(data) };
}
