import type { CycleData, LHTest, MucusObservation, TemperatureReading } from '@kairos/core';
import { getSdkStatus, initialize, readRecords, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';

import { dayOf, MUCUS_BY_INDEX, periodsFromFlowDays, summarise, yearAgo, type HealthImport } from './health-shared';

export const healthSourceName = 'Health Connect';
export const healthSource = 'health-connect' as const;
export const healthAvailable = () => true;

// Health Connect OvulationTestResult: POSITIVE = 1, HIGH = 2, NEGATIVE = 3.
const OVULATION_POSITIVE = 1;
const OVULATION_NEGATIVE = 3;

export async function importFromHealth(): Promise<HealthImport> {
  const status = await getSdkStatus();
  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) throw new Error('Health Connect is not available on this phone');
  await initialize();
  await requestPermission([
    { accessType: 'read', recordType: 'MenstruationFlow' },
    { accessType: 'read', recordType: 'OvulationTest' },
    { accessType: 'read', recordType: 'CervicalMucus' },
    { accessType: 'read', recordType: 'BasalBodyTemperature' },
  ]);
  const timeRangeFilter = { operator: 'between' as const, startTime: yearAgo().toISOString(), endTime: new Date().toISOString() };

  const flow = await readRecords('MenstruationFlow', { timeRangeFilter });
  // MenstruationFlow.flow: 0 unknown, 1 light, 2 medium, 3 heavy. Any recorded flow counts.
  const periods = periodsFromFlowDays(flow.records.map((r) => ({ date: dayOf(new Date(r.time)) })));

  const ovulation = await readRecords('OvulationTest', { timeRangeFilter });
  const lhTests: LHTest[] = ovulation.records
    .filter((r) => r.result === OVULATION_POSITIVE || r.result === OVULATION_NEGATIVE)
    .map((r) => ({ date: dayOf(new Date(r.time)), result: r.result === OVULATION_POSITIVE ? 'positive' : 'negative' }));

  const mucusRecords = await readRecords('CervicalMucus', { timeRangeFilter });
  const mucus: MucusObservation[] = mucusRecords.records.flatMap((r) => {
    const type = MUCUS_BY_INDEX[r.appearance ?? 0];
    return type ? [{ date: dayOf(new Date(r.time)), type }] : [];
  });

  const bbt = await readRecords('BasalBodyTemperature', { timeRangeFilter });
  const temperatures: TemperatureReading[] = bbt.records.map((r) => ({
    date: dayOf(new Date(r.time)),
    celsius: r.temperature.inCelsius,
    source: 'bbt' as const,
  }));

  const data: CycleData = { periods, lhTests, temperatures, mucus };
  return { data, summary: summarise(data) };
}
