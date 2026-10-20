/**
 * Discreet calendar export (RFC 5545).
 *
 * His calendar is often visible to colleagues and assistants. Events are
 * therefore all-day, marked free (TRANSP:TRANSPARENT) and private, and titled
 * with a codename — "Spring", or a custom word he picks — never a phase name.
 *
 * On iOS and Android the app writes events directly into a local calendar on
 * his phone, so nothing touches a server. This ICS output is for the web app
 * and for people who want to import into Google or Outlook by hand.
 */

import { addDays, diffDays, type ISODate } from '../dates';
import { hashString } from '../random';
import { utf8 } from '../crypto/encoding';
import { PHASE_COPY, type Phase } from '../cycle/seasons';
import type { PlannedNudge, SharedDay } from '../nudges/types';

export interface CalendarBlock {
  phase: Phase;
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
  title: string;
}

export interface CodenameOptions {
  /** Map from phase to the title shown in his calendar. Defaults to the season name. */
  codenames?: Partial<Record<Phase, string>>;
  /** Prefix a glyph (❄︎ ❀ ☀︎ ❦). Default true. */
  glyphs?: boolean;
}

export function seasonBlocks(days: SharedDay[], opts: CodenameOptions = {}): CalendarBlock[] {
  const sorted = [...days].filter((d) => d.phase).sort((a, b) => (a.date < b.date ? -1 : 1));
  const blocks: CalendarBlock[] = [];
  for (const d of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.phase === d.phase && diffDays(last.end, d.date) === 1) {
      last.end = d.date;
      continue;
    }
    const copy = PHASE_COPY[d.phase!];
    const name = opts.codenames?.[d.phase!] ?? copy.codename;
    blocks.push({
      phase: d.phase!,
      start: d.date,
      end: d.date,
      title: opts.glyphs === false ? name : `${copy.glyph} ${name}`,
    });
  }
  return blocks;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per line as RFC 5545 §3.1 requires, without splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  if (utf8(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = utf8(ch).length;
    if (currentBytes + b > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    currentBytes += b;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const basic = (d: ISODate) => d.replace(/-/g, '');

export interface IcsOptions extends CodenameOptions {
  calendarName?: string;
  /** Include his planned nudges as private all-day reminders. Default false. */
  nudges?: PlannedNudge[];
  /** Stable salt so UIDs survive re-export without revealing anything. */
  uidSalt?: string;
  now?: Date;
}

export function toIcs(days: SharedDay[], opts: IcsOptions = {}): string {
  const now = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const salt = opts.uidSalt ?? 'kairos';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kairos//Seasons//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? 'Seasons')}`,
  ];
  const event = (uidSeed: string, start: ISODate, endInclusive: ISODate, summary: string, description?: string) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${hashString(`${salt}|${uidSeed}`).toString(16)}-${basic(start)}@kairos`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${basic(start)}`,
      `DTEND;VALUE=DATE:${basic(addDays(endInclusive, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      'TRANSP:TRANSPARENT',
      'CLASS:PRIVATE',
      'END:VEVENT',
    );
  };
  for (const b of seasonBlocks(days, opts)) event(`season|${b.phase}|${b.start}`, b.start, b.end, b.title);
  for (const n of opts.nudges ?? []) event(`nudge|${n.key}`, n.date, n.date, n.title, n.detail);
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
