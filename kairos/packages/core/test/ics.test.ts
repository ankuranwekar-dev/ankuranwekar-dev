import { describe, expect, it } from 'vitest';
import { foldLine, seasonBlocks, toIcs } from '../src/calendar/ics';
import { utf8 } from '../src/crypto/encoding';
import { snapshotFor, regularData } from './helpers';

const snap = snapshotFor(regularData('2026-05-03', 6, 29), '2026-09-20', 'seasons', 'closer');

describe('calendar', () => {
  it('merges days into season blocks', () => {
    const blocks = seasonBlocks(snap.days);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]!.start > blocks[i - 1]!.end).toBe(true);
    expect(blocks.map((b) => b.phase)).toContain('ovulatory');
  });

  it('writes valid, discreet ICS', () => {
    const ics = toIcs(snap.days, { now: new Date('2026-09-20T08:00:00Z') });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/); // CRLF only
    for (const line of ics.split('\r\n')) expect(utf8(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain('TRANSP:TRANSPARENT');
    expect(ics).toContain('CLASS:PRIVATE');
    expect(ics.toLowerCase()).not.toMatch(/period|fertile|ovulat|menstru|luteal|pms/);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(seasonBlocks(snap.days).length);
  });

  it('supports custom codenames', () => {
    const ics = toIcs(snap.days, { codenames: { ovulatory: 'Golden hour' }, glyphs: false });
    expect(ics).toContain('SUMMARY:Golden hour');
  });

  it('folds long lines without breaking UTF-8', () => {
    const long = 'SUMMARY:' + '☀︎ Summer '.repeat(20);
    const folded = foldLine(long);
    for (const part of folded.split('\r\n')) expect(utf8(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n ').join('')).toBe(long);
  });
});
