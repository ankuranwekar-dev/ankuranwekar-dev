import { addDays, seasonBlocks, type CodenameOptions, type SharedDay } from '@kairos/core';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

/**
 * Writes her seasons into a dedicated, local calendar on his phone.
 *
 * Local means the events never pass through our servers. On iOS the calendar
 * lives in the "On My iPhone" source unless he has only iCloud, in which case
 * it syncs through his own iCloud account like any calendar he creates.
 * Events are all-day, free (they never block his schedule) and titled with a
 * codename.
 */

const CALENDAR_TITLE = 'Seasons';
const COLOR = '#C9A7E8';

async function findOrCreateCalendar(): Promise<Calendar.ExpoCalendar> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === CALENDAR_TITLE && c.allowsModifications);
  if (existing) return existing;
  if (Platform.OS === 'ios') {
    const sources = Calendar.getSourcesSync();
    const local = sources.find((s) => s.type === Calendar.SourceType.LOCAL);
    const fallback = Calendar.getDefaultCalendarSync().source;
    const source = local ?? fallback;
    return Calendar.createCalendar({
      title: CALENDAR_TITLE,
      color: COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      ...(source?.id ? { sourceId: source.id } : {}),
      source,
      name: CALENDAR_TITLE,
    });
  }
  return Calendar.createCalendar({
    title: CALENDAR_TITLE,
    color: COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: 'Kairos', type: Calendar.SourceType.LOCAL as unknown as string },
    name: 'kairos-seasons',
    ownerAccount: 'kairos',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

export async function syncSeasonsToCalendar(days: SharedDay[], opts: CodenameOptions = {}): Promise<number> {
  const perm = await Calendar.requestCalendarPermissions();
  if (!perm.granted) throw new Error('Calendar access was not granted');
  const cal = await findOrCreateCalendar();
  const blocks = seasonBlocks(days, opts);
  if (blocks.length === 0) return 0;

  // Replace our events in the covered range.
  const start = new Date(`${blocks[0]!.start}T00:00:00`);
  const end = new Date(`${addDays(blocks[blocks.length - 1]!.end, 1)}T00:00:00`);
  const old = await cal.listEvents(start, end);
  await Promise.all(old.map((e) => e.delete()));

  for (const b of blocks) {
    await cal.createEvent({
      title: b.title,
      startDate: new Date(`${b.start}T00:00:00`),
      endDate: new Date(`${addDays(b.end, 1)}T00:00:00`),
      allDay: true,
      availability: Calendar.Availability.FREE,
      notes: '',
    });
  }
  return blocks.length;
}
