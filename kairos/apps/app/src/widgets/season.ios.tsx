import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, opacity, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { SeasonWidgetProps } from './season-props';

/**
 * Home-screen and lock-screen widget (WidgetKit via expo-widgets).
 *
 * The layout below is compiled to a string by the 'widget' directive and runs
 * inside the widget extension, where every @expo/ui SwiftUI view and modifier
 * is a global. It must be a function expression and self-contained.
 *
 * Privacy: it only ever shows a codename ("Spring") and, if he opted into
 * detailed notifications, today's idea. Never a phase name, never a date.
 */
export const SeasonWidget = createWidget<SeasonWidgetProps>('SeasonWidget', function SeasonWidgetLayout(props, env) {
  'widget';
  if (env.widgetFamily === 'accessoryInline') {
    return <Text>{`${props.glyph} ${props.title}`}</Text>;
  }
  if (env.widgetFamily === 'accessoryCircular') {
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 18 })]}>{props.glyph}</Text>
        <Text modifiers={[font({ size: 11, weight: 'semibold' })]}>{props.short}</Text>
      </VStack>
    );
  }
  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{`${props.glyph} ${props.title}`}</Text>
        <Text modifiers={[font({ size: 12 })]}>{props.idea ?? props.line}</Text>
      </VStack>
    );
  }
  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[
        padding({ all: 2 }),
        containerBackground(
          {
            type: 'linearGradient',
            colors: [props.from, props.to],
            startPoint: { x: 0.2, y: 0 },
            endPoint: { x: 0.9, y: 1 },
          },
          'widget',
        ),
      ]}>
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(props.ink), opacity(0.75)]}>
        {props.meta}
      </Text>
      <Spacer />
      <Text modifiers={[font({ size: 26, design: 'serif' }), foregroundStyle(props.ink)]}>{props.title}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(props.ink), opacity(0.85)]}>
        {props.idea ?? props.line}
      </Text>
    </VStack>
  );
});

export function updateSeasonWidget(props: SeasonWidgetProps): void {
  try {
    SeasonWidget.updateSnapshot(props);
  } catch {
    // Widget extension not installed (e.g. Expo Go): nothing to update.
  }
}
