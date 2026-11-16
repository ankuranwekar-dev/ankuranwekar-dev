/**
 * Look-alike month calendars in the visual styles common to period trackers.
 * None of these reproduce a real app's assets; they reproduce the patterns
 * (filled discs, pale predictions, tinted numerals, dots, bands, rings) that
 * the screenshot reader has to cope with.
 */

import { addDays, diffDays, weekday, type ISODate, type PeriodLog } from '../../src';

export interface Truth {
  today: ISODate;
  periods: Required<PeriodLog>[];
  predicted: Required<PeriodLog>[];
  fertile: { start: ISODate; end: ISODate; peak: ISODate }[];
}

export interface Style {
  name: string;
  layout: 'scroll' | 'page';
  weekStart: 0 | 1;
  dark?: boolean;
  page: string;
  text: string;
  muted: string;
  font: string;
  weight: number;
  size: number;
  rowHeight: number;
  header: 'narrow' | 'short' | 'two';
  headerCase?: 'upper';
  adjacent?: 'grey' | 'hidden';
  period: 'disc' | 'square' | 'band' | 'ring' | 'dot' | 'drop' | 'text';
  periodColour: string;
  predicted: 'pale' | 'dashed' | 'none';
  predictedColour: string;
  fertile: 'text' | 'pale' | 'ring' | 'dot' | 'none';
  fertileColour: string;
  today: 'grey-disc' | 'ring' | 'bold' | 'label' | 'accent-text';
  accent: string;
  chrome: 'tabs' | 'plain' | 'insights';
  titleAlign: 'left' | 'center';
  padding: number;
}

const BASE = {
  page: '#FFFFFF',
  text: '#1C1C1E',
  muted: '#B4B4BB',
  font: 'Inter',
  weight: 500,
  size: 17,
  rowHeight: 50,
  header: 'narrow',
  adjacent: 'hidden',
  predicted: 'pale',
  fertile: 'text',
  today: 'bold',
  chrome: 'tabs',
  titleAlign: 'left',
  padding: 12,
} as const;

export const STYLES: Style[] = [
  {
    ...BASE,
    name: 'coral',
    layout: 'scroll',
    weekStart: 0,
    period: 'disc',
    periodColour: '#FF5A77',
    predicted: 'dashed',
    predictedColour: '#FF5A77',
    fertile: 'text',
    fertileColour: '#12B3A6',
    today: 'label',
    accent: '#FF5A77',
    titleAlign: 'center',
    headerCase: 'upper',
  },
  {
    ...BASE,
    name: 'health',
    layout: 'scroll',
    weekStart: 0,
    font: 'Inter',
    weight: 400,
    size: 19,
    rowHeight: 54,
    period: 'disc',
    periodColour: '#FF3B30',
    predicted: 'pale',
    predictedColour: '#FFD3D0',
    fertile: 'pale',
    fertileColour: '#CDEBFB',
    today: 'bold',
    accent: '#FF2D55',
    chrome: 'plain',
  },
  {
    ...BASE,
    name: 'health-dark',
    layout: 'scroll',
    weekStart: 0,
    dark: true,
    page: '#000000',
    text: '#FFFFFF',
    muted: '#5A5A5F',
    size: 19,
    rowHeight: 54,
    period: 'disc',
    periodColour: '#FF453A',
    predicted: 'pale',
    predictedColour: '#5C1F1C',
    fertile: 'pale',
    fertileColour: '#173B4F',
    today: 'bold',
    accent: '#FF375F',
    chrome: 'plain',
  },
  {
    ...BASE,
    name: 'clue',
    layout: 'page',
    weekStart: 1,
    font: 'Liberation Sans',
    weight: 400,
    size: 16,
    rowHeight: 52,
    header: 'short',
    adjacent: 'grey',
    period: 'square',
    periodColour: '#E0344B',
    predicted: 'pale',
    predictedColour: '#F8CBD1',
    fertile: 'pale',
    fertileColour: '#BFE6EA',
    today: 'ring',
    accent: '#3B3F8C',
    chrome: 'insights',
    titleAlign: 'center',
  },
  {
    ...BASE,
    name: 'band',
    layout: 'page',
    weekStart: 1,
    font: 'DejaVu Sans',
    weight: 400,
    size: 15,
    rowHeight: 56,
    header: 'short',
    adjacent: 'grey',
    period: 'band',
    periodColour: '#F06292',
    predicted: 'pale',
    predictedColour: '#FBD3E0',
    fertile: 'pale',
    fertileColour: '#C8EFEA',
    today: 'ring',
    accent: '#3F8CFF',
    titleAlign: 'center',
  },
  {
    ...BASE,
    name: 'petal',
    layout: 'page',
    weekStart: 0,
    page: '#FFF5F8',
    font: 'Carlito',
    weight: 700,
    size: 18,
    rowHeight: 58,
    header: 'short',
    adjacent: 'hidden',
    period: 'drop',
    periodColour: '#F0447C',
    predicted: 'none',
    predictedColour: '#F0447C',
    fertile: 'dot',
    fertileColour: '#3DBE7B',
    today: 'accent-text',
    accent: '#8A56D8',
    chrome: 'tabs',
    titleAlign: 'center',
  },
  {
    ...BASE,
    name: 'noir',
    layout: 'page',
    weekStart: 1,
    dark: true,
    page: '#121016',
    text: '#F2EEF7',
    muted: '#4B4756',
    font: 'Inter',
    weight: 600,
    size: 16,
    rowHeight: 52,
    header: 'two',
    adjacent: 'grey',
    period: 'ring',
    periodColour: '#FF4F70',
    predicted: 'dashed',
    predictedColour: '#FF4F70',
    fertile: 'ring',
    fertileColour: '#9C7BFF',
    today: 'grey-disc',
    accent: '#9C7BFF',
    chrome: 'plain',
  },
  {
    ...BASE,
    name: 'ledger',
    layout: 'scroll',
    weekStart: 1,
    font: 'FreeSans',
    weight: 400,
    size: 16,
    rowHeight: 46,
    header: 'narrow',
    period: 'text',
    periodColour: '#D81B43',
    predicted: 'none',
    predictedColour: '#D81B43',
    fertile: 'dot',
    fertileColour: '#1E88E5',
    today: 'grey-disc',
    accent: '#1E88E5',
    chrome: 'tabs',
  },
  {
    ...BASE,
    name: 'dots',
    layout: 'page',
    weekStart: 0,
    font: 'Inter',
    weight: 500,
    size: 17,
    rowHeight: 60,
    header: 'narrow',
    adjacent: 'grey',
    period: 'dot',
    periodColour: '#E53958',
    predicted: 'none',
    predictedColour: '#E53958',
    fertile: 'dot',
    fertileColour: '#19A7A0',
    today: 'ring',
    accent: '#111111',
    chrome: 'insights',
    titleAlign: 'center',
  },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const iso = (y: number, m: number, d: number): ISODate =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const within = (d: ISODate, r: { start: ISODate; end: ISODate }) => d >= r.start && d <= r.end;

function dayClasses(date: ISODate, truth: Truth): string[] {
  const c: string[] = [];
  const p = truth.periods.find((r) => within(date, r));
  const q = truth.predicted.find((r) => within(date, r));
  const f = truth.fertile.find((r) => within(date, r));
  if (p) {
    c.push('period');
    if (date === p.start) c.push('first');
    if (date === p.end) c.push('last');
  } else if (q) c.push('predicted');
  else if (f) c.push(date === f.peak ? 'peak' : 'fertile');
  if (date === truth.today) c.push('today');
  return c;
}

function month(style: Style, truth: Truth, y: number, m: number): string {
  const first = iso(y, m, 1);
  const length = diffDays(first, m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1));
  const lead = (weekday(first) - style.weekStart + 7) % 7;
  const cells: string[] = [];
  const cell = (date: ISODate, out: boolean) => {
    const cls = out ? ['out'] : dayClasses(date, truth);
    const label = cls.includes('today') && style.today === 'label' ? '<i class="tag">TODAY</i>' : '';
    return `<div class="day ${cls.join(' ')}" data-date="${out ? '' : date}"><b>${Number(date.slice(8))}</b>${label}<u></u></div>`;
  };
  for (let i = 0; i < lead; i++) {
    cells.push(style.adjacent === 'grey' ? cell(addDays(first, i - lead), true) : '<div class="day blank"></div>');
  }
  for (let d = 0; d < length; d++) cells.push(cell(addDays(first, d), false));
  if (style.adjacent === 'grey') {
    const total = Math.ceil(cells.length / 7) * 7;
    for (let i = 0; cells.length < total; i++) cells.push(cell(addDays(first, length + i), true));
  }
  return `<section><h2>${MONTHS[m - 1]}${style.layout === 'page' ? ` ${y}` : ''}</h2><div class="grid">${cells.join('')}</div></section>`;
}

export function render(style: Style, truth: Truth, months: { y: number; m: number }[], scroll: number): string {
  const head = Array.from({ length: 7 }, (_, i) => {
    const n = NAMES[(style.weekStart + i) % 7]!;
    const t = style.header === 'narrow' ? n[0]! : style.header === 'two' ? n.slice(0, 2) : n.slice(0, 3);
    return `<span>${style.headerCase === 'upper' ? t.toUpperCase() : t}</span>`;
  }).join('');
  const pc = style.periodColour;
  const qc = style.predictedColour;
  const fc = style.fertileColour;
  const disc = (colour: string, radius = '50%') =>
    `content:"";position:absolute;z-index:-1;width:38px;height:38px;border-radius:${radius};background:${colour};`;
  const ring = (colour: string, dash = 'solid') =>
    `content:"";position:absolute;z-index:-1;width:36px;height:36px;border-radius:50%;border:2px ${dash} ${colour};box-sizing:border-box;`;
  const dot = (colour: string) =>
    `display:block;position:absolute;bottom:6px;width:6px;height:6px;border-radius:50%;background:${colour};`;

  const period: Record<Style['period'], string> = {
    disc: `.period::before{${disc(pc)}} .period b{color:#fff}`,
    square: `.period::before{${disc(pc, '9px')}} .period b{color:#fff}`,
    band: `.period::before{content:"";position:absolute;z-index:-1;left:0;right:0;height:34px;background:${pc}}
      .period.first::before{border-radius:17px 0 0 17px;left:6px} .period.last::before{border-radius:0 17px 17px 0;right:6px}
      .period.first.last::before{border-radius:17px} .period b{color:#fff}`,
    ring: `.period::before{${ring(pc)}}`,
    dot: `.period u{${dot(pc)}}`,
    drop: `.period u{display:block;position:absolute;bottom:5px;width:9px;height:9px;background:${pc};border-radius:0 50% 50% 50%;transform:rotate(45deg)}`,
    text: `.period b{color:${pc};font-weight:700}`,
  };
  const predicted: Record<Style['predicted'], string> = {
    pale:
      style.period === 'band'
        ? `.predicted::before{content:"";position:absolute;z-index:-1;left:0;right:0;height:34px;background:${qc}}`
        : `.predicted::before{${disc(qc, style.period === 'square' ? '9px' : '50%')}}`,
    dashed: `.predicted::before{${ring(qc, 'dashed')}}`,
    none: '',
  };
  const fertile: Record<Style['fertile'], string> = {
    text: `.fertile b,.peak b{color:${fc}} .peak::before{${ring(fc, 'dashed')}}`,
    pale: `.fertile::before,.peak::before{${disc(fc, style.period === 'square' ? '9px' : '50%')}}`,
    ring: `.fertile::before,.peak::before{${ring(fc)}}`,
    dot: `.fertile u,.peak u{${dot(fc)}}`,
    none: '',
  };
  const today: Record<Style['today'], string> = {
    'grey-disc': `.today:not(.period):not(.predicted)::before{${disc(style.dark ? '#3A3A40' : '#E7E7EC')}} .today b{font-weight:800}`,
    ring: `.today::after{content:"";position:absolute;width:42px;height:42px;border-radius:50%;border:1.5px solid ${style.accent};box-sizing:border-box}`,
    bold: `.today b{font-weight:800}`,
    label: `.today b{font-weight:800} .tag{position:absolute;top:1px;font:700 7px/1 ${style.font};letter-spacing:.4px;color:${style.text}}`,
    'accent-text': `.today:not(.period) b{color:${style.accent}} .today b{font-weight:800}`,
  };

  const legend = `<div class="legend"><span><i style="background:${pc}"></i>Period</span><span><i style="background:${fc}"></i>Fertile window</span><span><i style="background:${qc}"></i>Predicted</span></div>`;
  const insights = `<div class="card"><h3>Cycle day 14 of 29</h3><p>Your last 6 cycles averaged 29 days and your periods lasted 5 days. Log symptoms on 3 more days to see patterns here.</p></div>`;
  const tabs = `<nav>${['Today', 'Calendar', 'Insights', 'Messages', 'Partner']
    .map((t, i) => `<span class="${i === 1 ? 'on' : ''}"><i></i>${t}</span>`)
    .join('')}</nav>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${style.page};color:${style.text};font-family:${style.font},sans-serif;width:100vw;height:100vh;overflow:hidden;position:relative}
  .status{height:50px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 28px 8px;font:600 16px/1 ${style.font}}
  .status em{font-style:normal;display:flex;gap:5px;align-items:center}
  .status em i{width:22px;height:11px;border-radius:3px;border:1.5px solid ${style.text};opacity:.8}
  header{position:relative;z-index:5;background:${style.page}}
  .bar{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font:600 17px/1 ${style.font}}
  .bar a{color:${style.accent};font-weight:500}
  .week{display:grid;grid-template-columns:repeat(7,1fr);padding:6px ${style.padding}px 8px;font:600 ${style.header === 'narrow' ? 12 : 11}px/1 ${style.font};color:${style.muted};text-align:center;border-bottom:1px solid ${style.dark ? '#26242B' : '#ECECF0'}}
  main{padding:0 ${style.padding}px;transform:translateY(${-scroll}px)}
  section{padding-top:18px}
  h2{font:700 ${style.layout === 'page' ? 20 : 22}px/1.2 ${style.font};text-align:${style.titleAlign};padding:0 8px 10px;${style.name.startsWith('health') ? `color:${style.accent}` : ''}}
  .grid{display:grid;grid-template-columns:repeat(7,1fr)}
  .day{height:${style.rowHeight}px;position:relative;z-index:0;display:flex;align-items:center;justify-content:center}
  .day b{font:${style.weight} ${style.size}px/1 ${style.font};font-variant-numeric:tabular-nums}
  .day u{display:none;text-decoration:none}
  .out b{color:${style.muted}}
  ${period[style.period]} ${predicted[style.predicted]} ${fertile[style.fertile]} ${today[style.today]}
  .legend{display:flex;gap:16px;justify-content:center;padding:16px 0 4px;font:500 12px/1 ${style.font};color:${style.muted}}
  .legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .card{margin:14px 6px;padding:16px;border-radius:16px;background:${style.dark ? '#1E1B24' : '#F4F4F7'}}
  .card h3{font:700 16px/1.3 ${style.font};margin-bottom:6px}.card p{font:400 14px/1.45 ${style.font};opacity:.75}
  nav{position:absolute;left:0;right:0;bottom:0;height:84px;display:flex;justify-content:space-around;padding-top:10px;background:${style.page};border-top:1px solid ${style.dark ? '#26242B' : '#ECECF0'};font:500 10px/1 ${style.font};color:${style.muted};z-index:6}
  nav span{display:flex;flex-direction:column;align-items:center;gap:6px}nav i{width:24px;height:24px;border-radius:7px;background:currentColor;opacity:.55}
  nav .on{color:${style.accent}}
  </style></head><body>
  <header><div class="status"><span>9:41</span><em>5G <i></i></em></div>
  <div class="bar"><a>Close</a><span>${style.layout === 'scroll' ? 'Calendar' : ''}</span><a>Edit</a></div>
  <div class="week">${head}</div></header>
  <main>${months.map((mo) => month(style, truth, mo.y, mo.m)).join('')}${style.layout === 'page' ? legend : ''}${style.chrome === 'insights' ? insights : ''}</main>
  ${style.chrome === 'tabs' ? tabs : ''}
  </body></html>`;
}
