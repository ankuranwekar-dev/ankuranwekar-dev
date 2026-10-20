import { toIcs, type CodenameOptions, type SharedDay } from '@kairos/core';

/** On the web, hand him an .ics file to import into Google, Outlook or Apple Calendar. */
export async function syncSeasonsToCalendar(days: SharedDay[], opts: CodenameOptions = {}): Promise<number> {
  const ics = toIcs(days, { ...opts, calendarName: 'Seasons' });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seasons.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return (ics.match(/BEGIN:VEVENT/g) ?? []).length;
}
