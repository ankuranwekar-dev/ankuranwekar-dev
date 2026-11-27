import type { SeasonWidgetProps } from './season-props';

/** Widgets are iOS-only for now (Android Glance support is on the roadmap); elsewhere this is a no-op. */
export function updateSeasonWidget(_props: SeasonWidgetProps): void {}
