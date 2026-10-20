# Design

Kairos should feel like weather, not a dashboard: something he glances at and understands, that she trusts on sight, and that never embarrasses either of them in public.

## Principles

1. **One screen, one thought.** His Today screen answers one question: what can I do for her today? Everything else is one level down.
2. **Ambient before interactive.** Most of the value arrives without opening the app: a notification he can complete in place, a codenamed calendar, a widget. The app is for the occasional deeper look.
3. **Every tap earns its place.** He sets up in three taps; she in five. Done is one tap, on the notification.
4. **Warm, adult, quiet.** Not the pinks-and-petals of femtech, not the locker room of men's apps. Closer to a good hotel than a fitness app.
5. **Honest about uncertainty.** Fertile days glow with an intensity equal to their probability. Edges are soft because the science is.
6. **Private by default.** Nothing on a lock screen, calendar or widget names a period, a phase or fertility.

## Language: seasons

| Season | Phase | Palette (from → to · glow) | Read for him | For her |
| --- | --- | --- | --- | --- |
| Winter ❄︎ | Bleeding | `#8E2C48 → #3A1024` · `#C2456B` | Her energy is at its lowest. Comfort beats plans. | Rest counts as productive. |
| Spring ❀ | Follicular | `#FFC2A1 → #9FD8B9` · `#FFB08A` | Energy and optimism are rising. She's open to something new. | Momentum is building. |
| Summer ☀︎ | Fertile window + 1 day | `#FFD27A → #FF7E8E` · `#FFAA6B` | She's at her most radiant. Connection comes easily. | Your brightest days. |
| Autumn ❦ | Luteal | `#C3A6F0 → #E7A27C` · `#B79BEB` | Settling in. Calm, routine and comfort matter more now. | Turning inward. |
| Late autumn ❦ | Last 5 days before her period | same | Patience season. Small things can feel big; be her calm. | Be gentle with yourself. He has a heads-up. |

## The orb

Her season rendered as light (`apps/app/src/ui/orb.tsx`). An SVG sphere with a radial gradient from a highlight to the season's two stops, a darker rim, a specular glint, a slowly drifting aurora clipped inside the sphere, and a soft glow behind. It breathes on a 5.5-second cycle (a calm resting rhythm) and respects Reduce Motion. No numbers, no labels on it.

The app icon is the same object: a pearlescent orb holding all four seasons, on warm near-black.

## Type

- **Display:** Instrument Serif, regular and italic. Season names are set in italic in the season's color: "Maya's *spring*".
- **Interface:** the platform system face (SF Pro on Apple platforms, Roboto on Android, the system stack on the web).
- Scale: display 46/50, title 34/38, title2 26/30, headline 17/22 semibold, body 16/23, callout 15/21, footnote 13/18, caption 11.5 uppercase with 1.3 tracking.

## Color and theme

Two moods, both warm: **Dusk** (dark, the hero) `#0D0A0C` and **Dawn** (light) `#F7F2EE`. Accent color is always the current season's glow. On light backgrounds accent *text and icons* are deepened (×0.58) so they stay legible; fills and buttons keep the bright glow. Every screen carries a faint wash of the season's glow at the top.

## Materials

- **iOS 26+:** real Liquid Glass (`expo-glass-effect`) for cards and the system tab bar (`NativeTabs`), which also gives the tab bar its native minimise-on-scroll behaviour.
- **Older iOS and the web:** frosted blur with a hairline border and a top sheen.
- **Android:** tonal Material 3 surfaces; no real-time blur, because it costs more battery than it is worth on mid-range phones.

## Motion and haptics

One orchestrated motion per moment: the orb breathes; cards fade up; the Done badge springs in. Buttons compress 3.5% under the finger. Haptics: selection tick on taps, success on Done and on sending a signal, a soft warning on Unpair. All motion respects Reduce Motion.

## Copy voice

- Specific beats sweet: "Clear the kitchen before she gets to it", never "Show her you care".
- Second person to him, short sentences, no jargon, no innuendo, nothing he would be embarrassed to have on screen if she picked up his phone.
- Every idea has a **Why now** line, so he learns the pattern instead of following orders.
- Message drafts are labelled "Starting points. Say it your way."

## Surfaces

| Surface | His side | Her side | Status |
| --- | --- | --- | --- |
| App: Today | Orb, season read, chips (fertile window, period range), signal card, today's idea with Done / Another idea / Not today, coming up, "She mentioned…" capture | Orb, her read, eight signal tiles, quick log, his side in surprise mode, "He did something lovely" | Built |
| App: second tab | Rhythm: cycle ring with fertile glow and best-day dots, eight-week season grid, what helps / what doesn't, calendar sync, confidence | Playbook: what makes her feel loved, favorites, please-don't list, notes for him | Built |
| App: third tab | Her playbook as he sees it, and the things she mentioned | Sharing: why she's here, what he sees, live "he can see / never shared" list, pause, unpair | Built |
| Notifications | Local, discreet, actionable (Done, Tomorrow) | — | Built |
| Calendar | Codenamed seasons in a local calendar; `.ics` on the web | — | Built |
| Home and lock-screen widget (iOS) | Codename, glyph, today's idea if opted in | Her season | Built (WidgetKit via `expo-widgets`; compiled, not yet run on a device) |
| Apple Watch complication, Control Center control, Siri / App Intents | Today's idea | One-tap signals | Roadmap |
| Android Glance widget | | | Roadmap |
| Desktop website | Pitch with the live app in a phone frame, his/her switch and a cycle scrubber | | Built |

## Accessibility

In place: system fonts, accessibility labels on interactive controls, primary buttons at least 50 pt tall, color never the only carrier of meaning (seasons are always named in text), Reduce Motion honoured, light and dark themes both designed, and on the web the host page's forced theme (`data-theme`) respected.

Still to do before launch: a full VoiceOver and TalkBack pass; raising chips and compact controls (36–38 pt) to the 44 pt minimum; Dynamic Type limits on the display serif; an Arabic right-to-left layout pass.
