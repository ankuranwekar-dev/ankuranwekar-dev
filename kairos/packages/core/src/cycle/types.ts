import type { ISODate } from '../dates';

/** A logged period. `end` is the last day of bleeding, inclusive, when known. */
export interface PeriodLog {
  start: ISODate;
  end?: ISODate;
}

export type LHResult = 'negative' | 'positive';

/** Urine LH test (ovulation predictor kit). */
export interface LHTest {
  date: ISODate;
  result: LHResult;
}

/** Waking basal body temperature in °C, or a wearable's nightly deviation from baseline in °C. */
export interface TemperatureReading {
  date: ISODate;
  celsius: number;
  /** 'bbt' = oral/vaginal waking thermometer; 'wrist' = Apple Watch / Oura style deviation. */
  source: 'bbt' | 'wrist';
}

/** Cervical mucus observation, ordered from least to most fertile. */
export type MucusType = 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite';

export interface MucusObservation {
  date: ISODate;
  type: MucusType;
}

export interface PregnancyTest {
  date: ISODate;
  positive: boolean;
}

/** Everything the engine may know about her cycles. All fields optional except periods. */
export interface CycleData {
  periods: PeriodLog[];
  lhTests?: LHTest[];
  temperatures?: TemperatureReading[];
  mucus?: MucusObservation[];
  pregnancyTests?: PregnancyTest[];
  /** What she believes her cycle length is, used only until two real cycles exist. */
  statedCycleLength?: number;
  statedPeriodLength?: number;
}

/** Personal statistics after shrinkage toward population priors. */
export interface CycleStats {
  cycleMean: number;
  cycleSd: number;
  lutealMean: number;
  lutealSd: number;
  periodLength: number;
  /** Number of complete, plausible cycles that informed the estimate. */
  cyclesObserved: number;
  /** Cycles in which ovulation was located by LH or temperature. */
  ovulationsObserved: number;
}

/** A completed cycle reconstructed from logs. */
export interface CompletedCycle {
  start: ISODate;
  length: number;
  /** Ovulation day (ISO) when it could be located from LH/temperature. */
  ovulation?: ISODate;
  plausible: boolean;
}
