import { addDays, diffDays, weekday, type ISODate, type Pixels } from '@kairos/core';

export const sampleAvailable = typeof document !== 'undefined';

const W = 720;
const PAD = 26;
const COL = (W - PAD * 2) / 7;
const ROW = 92;
const FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";

const first = (d: ISODate): ISODate => `${d.slice(0, 8)}01`;

/**
 * Draws a period-tracker month view the way many apps do (filled discs for
 * period days, a dashed ring for predicted ones), so that someone trying the
 * web demo without a screenshot to hand can watch the reader work. The reader
 * is given only these pixels, exactly as it would be given a real screenshot.
 */
export function sampleCalendar(today: ISODate): Pixels | null {
  if (!sampleAvailable) return null;
  const thisMonth = first(today);
  const lastMonth = first(addDays(thisMonth, -1));
  const months = [lastMonth, thisMonth];

  // A 29-day cycle with five-day periods; the latest began nine days ago.
  const latest = addDays(today, -9);
  const logged = new Set<ISODate>();
  const predicted = new Set<ISODate>();
  for (const start of [addDays(latest, -29), latest]) for (let i = 0; i < 5; i++) logged.add(addDays(start, i));
  for (let i = 0; i < 5; i++) predicted.add(addDays(latest, 29 + i));
  const fertile = new Set<ISODate>();
  for (let i = 10; i <= 15; i++) fertile.add(addDays(latest, i));

  const rows = (m: ISODate) => Math.ceil((weekday(m) + diffDays(m, first(addDays(m, 32)))) / 7);
  const height = 250 + months.reduce((h, m) => h + 96 + rows(m) * ROW, 0) + 60;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, W, height);
  g.textBaseline = 'middle';

  g.fillStyle = '#1C1C1E';
  g.font = `600 30px ${FONT}`;
  g.textAlign = 'left';
  g.fillText('9:41', 52, 62);
  g.textAlign = 'center';
  g.font = `600 32px ${FONT}`;
  g.fillText('Calendar', W / 2, 140);
  g.font = `600 22px ${FONT}`;
  g.fillStyle = '#A9A9B2';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((l, i) => g.fillText(l, PAD + COL * (i + 0.5), 208));
  g.fillStyle = '#ECECF0';
  g.fillRect(0, 236, W, 2);

  let y = 250;
  for (const m of months) {
    g.fillStyle = '#1C1C1E';
    g.textAlign = 'left';
    g.font = `700 38px ${FONT}`;
    g.fillText(new Date(`${m}T12:00:00`).toLocaleDateString('en-US', { month: 'long' }), PAD + 14, y + 52);
    y += 96;
    const length = diffDays(m, first(addDays(m, 32)));
    g.textAlign = 'center';
    for (let d = 0; d < length; d++) {
      const date = addDays(m, d);
      const slot = weekday(m) + d;
      const cx = PAD + COL * ((slot % 7) + 0.5);
      const cy = y + ROW * (Math.floor(slot / 7) + 0.5);
      if (logged.has(date) && date <= today) {
        g.fillStyle = '#FF5A77';
        g.beginPath();
        g.arc(cx, cy, 35, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#FFFFFF';
      } else if (predicted.has(date) || (logged.has(date) && date > today)) {
        g.strokeStyle = '#FF5A77';
        g.lineWidth = 3.5;
        g.setLineDash([9, 8]);
        g.beginPath();
        g.arc(cx, cy, 33, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#1C1C1E';
      } else g.fillStyle = fertile.has(date) ? '#12A89C' : '#1C1C1E';
      g.font = `${date === today ? 700 : 500} 31px ${FONT}`;
      g.fillText(String(d + 1), cx, cy + 1);
    }
    y += rows(m) * ROW;
  }

  const { data } = g.getImageData(0, 0, W, height);
  return { width: W, height, data };
}
