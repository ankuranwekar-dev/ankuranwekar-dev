/**
 * Population priors. Every personal estimate starts here and is pulled toward
 * the individual as her own data accumulates (see history.ts).
 *
 * Sources (see docs/SCIENCE.md for the full discussion):
 *  - Bull et al. 2019, npj Digital Medicine, 612,613 ovulatory cycles:
 *    mean cycle 29.3 d, mean follicular 16.9 d (95% range 10–30),
 *    mean luteal 12.4 d (95% range 7–17); only ~13% of cycles are 28 days.
 *  - Wilcox, Weinberg & Baird 1995, NEJM: conception only from intercourse in
 *    the 6-day window ending on ovulation day; per-cycle probability ≈0.10 at
 *    day −5 rising to ≈0.33 on ovulation day.
 *  - Wilcox, Dunson & Baird 2000, BMJ: on every day from cycle day 6 to 21 a
 *    woman has ≥10% probability of being in her fertile window; only ~30% of
 *    women have the window entirely inside days 10–17.
 */

export const POPULATION = {
  /** Mean cycle length, days (Bull 2019). */
  cycleMean: 29.3,
  /**
   * Typical within-woman cycle-to-cycle SD, days. Bull 2019 reports per-woman
   * variation of roughly 2.9 days (0.4 d was a 14% increase); we round to 3 and
   * use it as the prior that her own variability is shrunk toward.
   */
  cycleSd: 3.0,
  /** Mean luteal phase, days (Bull 2019). */
  lutealMean: 12.4,
  /**
   * Within-woman luteal SD prior. The population 95% range (7–17) implies a
   * between-woman SD of ~2.5 d; within a woman it is tighter. 1.8 is a
   * deliberately conservative middle.
   */
  lutealSd: 1.8,
  /** Default bleed length when she has not logged period ends. */
  periodLength: 5,
  /** Hard physiological bounds used to reject logging errors. */
  minPlausibleCycle: 15,
  maxPlausibleCycle: 60,
} as const;

/**
 * Probability of conception from a single act of intercourse, indexed by days
 * relative to ovulation (−5 … 0). The endpoints (0.10, 0.33) are the published
 * Wilcox 1995 figures; the interior points are a monotone interpolation and a
 * modelling assumption, not published values. The engine only ever uses these
 * as *relative* weights to rank days, never to quote a pregnancy probability.
 */
export const CONCEPTION_BY_OFFSET: Readonly<Record<number, number>> = {
  [-5]: 0.1,
  [-4]: 0.15,
  [-3]: 0.2,
  [-2]: 0.26,
  [-1]: 0.3,
  [0]: 0.33,
};

/** The fertile window: 5 days before ovulation through ovulation day (ASRM 2021). */
export const FERTILE_OFFSETS = [-5, -4, -3, -2, -1, 0] as const;

/** Clamp a value into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
