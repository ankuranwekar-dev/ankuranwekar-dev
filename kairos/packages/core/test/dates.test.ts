import { describe, expect, it } from 'vitest';
import { addDays, dateRange, diffDays, fromDayNumber, relativeDayLabel, toDayNumber, weekday } from '../src/dates';

describe('dates', () => {
  it('round-trips ISO dates through day numbers', () => {
    for (const iso of ['1970-01-01', '2024-02-29', '2026-10-20', '2099-12-31']) {
      expect(fromDayNumber(toDayNumber(iso))).toBe(iso);
    }
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(() => toDayNumber('2026-02-31')).toThrow();
    expect(() => toDayNumber('2026-13-01')).toThrow();
    expect(() => toDayNumber('20261020')).toThrow();
  });

  it('does arithmetic across month, year and DST boundaries', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // EU DST change
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-02-27', '2026-03-01')).toBe(2);
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('knows the weekday', () => {
    expect(weekday('2026-10-20')).toBe(2); // Tuesday
    expect(weekday('1970-01-01')).toBe(4); // Thursday
  });

  it('labels relative days', () => {
    expect(relativeDayLabel('2026-10-20', '2026-10-20')).toBe('today');
    expect(relativeDayLabel('2026-10-21', '2026-10-20')).toBe('tomorrow');
    expect(relativeDayLabel('2026-10-23', '2026-10-20')).toBe('Friday');
    expect(relativeDayLabel('2026-10-30', '2026-10-20')).toBe('in 10 days');
  });
});
