# Design

Tender should feel like weather, not a dashboard: something he glances at and understands, that she trusts on sight, and that never embarrasses either of them in public.

## Principles

1. **One screen.** The app is Today. His answers one question: what can I do for her today? Hers answers another: what do I want him to know? There are no tabs.
2. **Two doors out of it.** Tapping the orb opens Rhythm (where she is, what is coming). The round button at the top right opens everything else (who she is, what is shared, how ideas arrive). Nothing is more than one tap from Today, and nothing else competes with it.
3. **Fewer words.** A screen gets a title and, at most, one line. A season is a colour and a word. The next three weeks are a ribbon, not a sentence. Explanations live one tap down, on the idea itself.
4. **Ambient before interactive.** Most of the value arrives without opening the app: a notification he can complete in place, a codenamed calendar, a widget.
5. **Every tap earns its place.** Setup is one choice and one confirmation. Done is one tap, on the notification.
6. **Warm, adult, quiet.** Not the pinks-and-petals of femtech, not the locker room of men's apps. Closer to a good hotel than a fitness app.
7. **Honest about uncertainty.** Fertile days glow with an intensity equal to their probability. What was read from a screenshot is shown for correction, never applied silently.
8. **Private by default.** Nothing on a lock screen, calendar or widget names a period, a phase or fertility.

### What the second version removed

The first build had three tabs a side, a five-step and a three-step onboarding, and a Today screen that carried chips, a "coming up" list and a note field under the idea. All of it was defensible and together it was too much. Now:

| Was | Is |
| --- | --- |
| Three tabs per person | One screen, two sheets |
| Onboarding of 5 steps (her) and 3 (him) | One choice, one confirmation |
| Season read of one or two sentences | Three to five words |
| Text chips ("Fertile window in 2 days", "Period in 17–23 days") | A three-week colour ribbon and one fact |
| Idea card with kind, time, title, detail, "why now", four buttons | Title, one or two lines, Done, two icon buttons |
| "Coming up", "She mentioned", calendar sync on Today | Moved one level down |
| Settings as a separate modal | Folded into the one profile sheet |

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

- **One typeface: Arial** for everything. It ships with iOS, so nothing is bundled; Android has no Arial (and it cannot be redistributed), so it falls back to the system sans there, and the web build asks for Arial then Helvetica.
- **Display:** Arial bold. Season names are set in bold italic in the season's color: "Maya's *spring*".
- Scale: display 38/43 bold, title 30/35 bold, title2 23/28 bold, headline 17/22 semibold, body 16/23, callout 15/21, footnote 13/18, caption 11.5 uppercase with 1.3 tracking.
- Arial is wider than the condensed serif the display sizes were first drawn for, which is why they are smaller than they were (46/34/26); "Maya's late autumn" is the widest title and still fits on one line.

## Color and theme

Two moods, both warm: **Dusk** (dark, the hero) `#0D0A0C` and **Dawn** (light) `#F7F2EE`. Accent color is always the current season's glow. On light backgrounds accent *text and icons* are deepened (×0.58) so they stay legible; fills and buttons keep the bright glow. Every screen carries a faint wash of the season's glow at the top.

## Materials

- **iOS 26+:** real Liquid Glass (`expo-glass-effect`) for cards, and the system's own glass for the sheets.
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
| Today | Orb, her season, a few words, three-week ribbon, one fact, today's idea with Done / another / not today. A signal from her, or "did her period start?", appears above the idea when there is one | Orb, her season, day of cycle, eight signal tiles, one period button, a heart for when he gets it right | Built |
| Rhythm (tap the orb) | Cycle ring, five-week season grid, what lands well now, the next three ideas, add seasons to calendar | Ring and grid | Built |
| Profile (button, top right) | Her name, how her cycle is kept current, trying-for-a-baby switch, how often and when ideas arrive, what she loves, things she mentioned | Her name, what he sees, pause, what she loves, her cycle sources | Built |
| Idea detail (tap the idea) | Why now, message starting points or a shortcut, Done | — | Built |
| Setup | One choice of three (her screenshot, her code, a date), then a calendar to confirm | One choice of three (Health, a screenshot, a date), then what he sees with a live preview | Built |
| Notifications | Local, discreet, actionable (Done, Tomorrow) | — | Built |
| Calendar | Codenamed seasons in a local calendar; `.ics` on the web | — | Built |
| Home and lock-screen widget (iOS) | Codename, glyph, today's idea if opted in | Her season | Built (compiled, not yet run on a device) |
| Apple Watch complication, Control Center control, Siri / App Intents | Today's idea | One-tap signals | Roadmap |
| Android Glance widget | | | Roadmap |
| Desktop website | Pitch with the live app in a phone frame | | Built |

The sheets are native form sheets on iOS (Liquid Glass on iOS 26), and full pages with a close button on Android and the web.

## Accessibility

In place: system fonts, accessibility labels on interactive controls, primary buttons at least 50 pt tall, color never the only carrier of meaning (seasons are always named in text), Reduce Motion honoured, light and dark themes both designed, and on the web the host page's forced theme (`data-theme`) respected.

Still to do before launch: a full VoiceOver and TalkBack pass; raising chips and compact controls (34–40 pt) to the 44 pt minimum; a text alternative for the colour ribbon beyond its single label; Dynamic Type limits on the display serif; an Arabic right-to-left layout pass.
