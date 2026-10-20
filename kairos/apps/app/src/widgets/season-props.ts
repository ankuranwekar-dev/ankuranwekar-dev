export interface SeasonWidgetProps {
  /** Codename only: "Spring", "Late autumn". */
  title: string;
  glyph: string;
  /** Two-word form for the circular lock-screen widget. */
  short: string;
  /** One gentle line about the season. */
  line: string;
  /** e.g. "Day 10 · Kairos" or "Kairos". */
  meta: string;
  /** Today's idea title, only when he opted into detailed notifications. */
  idea?: string;
  from: string;
  to: string;
  ink: string;
}
