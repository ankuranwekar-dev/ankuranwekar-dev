# Shipping Kairos to the App Store

This is the runbook for the steps that need a Mac and an Apple Developer account. Everything that could be prepared without them is in the repository already.

## Where things stand

| Item | Status |
| --- | --- |
| App code, both editions | Done. Type-checks; web build exercised end to end in Chromium |
| iOS and Android JavaScript bundles | Build (`expo export`), Hermes bytecode |
| App configuration (`app.json`, `app.config.ts`, `eas.json`) | Done; resolves cleanly for both editions |
| Privacy manifest, permission strings | Done |
| Store listing (`apps/app/store.config.json`) | Drafted; four `REPLACE` fields are yours to fill |
| Privacy policy and support pages (`site/`) | Drafted; need your name, contact address and a public URL |
| **Native iOS build (Xcode / CocoaPods)** | **Not run. No Mac was available** |
| **Simulator and device testing** | **Not run** |
| **Screenshots from a real simulator** | **Not captured** (the ones in `docs/screenshots` are from the web build) |
| **Upload and submission** | **Not done.** Needs your Apple Developer account |

The first native build is where problems usually surface: a config plugin that disagrees with the SDK, a pod that fails to compile, a layout that the safe area clips. Budget time for that; none of it has been tested.

## Decisions that are yours

1. **App name.** The home-screen name is `Kairos`. The App Store name must be unique across the store, and plain "Kairos" is almost certainly taken, so the listing uses `Kairos: Her Seasons`. App Store Connect will tell you if that is taken too. A trademark search is worth doing before launch.
2. **Bundle identifier.** `love.kairos.app` is a placeholder. Use a reverse-domain identifier you control: set `KAIROS_BUNDLE_ID` in the build environment, or edit `app.json`.
3. **Edition.** The default build is the **solo** edition: his phone only, set up from a screenshot or a date, no server. This is the one to ship first: it has nothing to operate and the smallest review surface. The **paired** edition (her app, pairing, signals, Apple Health) switches on when `EXPO_PUBLIC_RELAY_URL` is set, and needs the relay deployed (see the end of this page).
4. **Price.** The listing assumes free. Subscriptions are not implemented.
5. **Publisher details.** Replace the placeholders in `site/privacy.html`, `site/support.html` and `apps/app/store.config.json`.

## Path A: your Mac, with Xcode

Requirements: a current Xcode, Node 22, pnpm 10, CocoaPods, and membership of the Apple Developer Program (US$99 a year).

```bash
cd kairos
pnpm install
pnpm test                      # 100 engine tests

cd apps/app
npx expo-doctor                # checks dependency versions against the SDK
npx expo run:ios               # generates ios/, builds, launches the iPhone simulator
```

Walk through it in the simulator:

- Welcome → **I'm her partner** → **Pick a date** → Today.
- Welcome → **Her screenshot**: drag a screenshot of any tracker's month view onto the simulator first so it is in Photos.
- **See a demo**, and use the bar at the top to move through a cycle and to switch phones.
- Tap the orb (Rhythm), her initial (profile), and the idea card (detail).
- Notifications: finish setup, allow them, then check `Settings → Notifications → Kairos`.
- Light and dark appearance; the largest and smallest Dynamic Type sizes.

Capture store screenshots from a 6.9-inch simulator (iPhone 16 Pro Max or newer):

```bash
xcrun simctl io booted screenshot today.png
```

Then archive and upload: open `ios/Kairos.xcworkspace` in Xcode, choose your team under *Signing & Capabilities*, select *Any iOS Device*, then *Product → Archive → Distribute App → App Store Connect*.

## Path B: build in the cloud with EAS

No local Xcode needed to build and upload, though you still need a Mac (or a physical iPhone with TestFlight) to test.

```bash
cd kairos/apps/app
npx eas-cli login
npx eas-cli init                               # creates the project, prints its ID
export EAS_PROJECT_ID=<the id it printed>
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios              # uploads to App Store Connect / TestFlight
npx eas-cli metadata:push                      # pushes store.config.json
```

EAS asks for your Apple ID once and manages certificates and provisioning for you.

## Path C: have Claude drive your Mac

If you connect your Mac to the Claude session that built this, the simulator build, the walkthrough, the screenshots and the fixes that follow can be done for you there. Signing in to your Apple account and pressing Submit stay with you.

## App Store Connect: what to answer

**App Privacy (solo edition): "Data Not Collected".** Nothing leaves the device. For the paired edition, a push token is sent to the relay (an identifier, used for app functionality, not linked to identity); the shared forecast is end-to-end encrypted and unreadable to you. Whether unreadable ciphertext counts as "collected" under Apple's definition is a judgement call; take advice before answering.

**Export compliance.** The app contains its own implementation of standard encryption (X25519, HKDF-SHA-256, XChaCha20-Poly1305) for pairing. `ITSAppUsesNonExemptEncryption` is deliberately not set, so App Store Connect will ask. Answer that the app uses standard encryption algorithms in addition to those in the operating system, and follow what it tells you from there (France has an extra declaration). This is a legal question; the answer above is a starting point, not advice.

**Age rating.** Answer the questionnaire honestly: there is no explicit content, but there are romantic themes and references to fertility. Expect 12+ or higher.

**Health claims.** The listing and the app say plainly that Kairos is not a contraceptive and not a medical device. Keep it that way in any screenshots or marketing text you add; reviewers reject fertility apps that imply otherwise.

**Review notes** are in `store.config.json`. The demo needs no login.

**URLs.** Host the `site/` folder anywhere public (GitHub Pages works) and enter `…/privacy.html` as the privacy policy URL and `…/support.html` as the support URL.

## Review risks worth knowing

- **A woman's health data on a man's phone.** Nothing in Apple's guidelines forbids it, and the data never leaves the device, but a reviewer may ask. The answer: she provides the screenshot, the app says so, and nothing is transmitted.
- **Screenshot reading is unproven on real apps.** It scores well on look-alike calendars rendered for the benchmark (see `docs/SCIENCE.md`), but it has not been run on real screenshots from Flo, Clue, Apple Health and the rest. Test with real ones before launch; the confirm screen lets the user correct a bad read, but a reviewer who sees a wrong first read will not be impressed.
- **The widget and notifications have never run on a device.**

## The paired edition

```bash
supabase db push                                   # kairos/supabase/migrations
supabase functions deploy relay --no-verify-jwt
```

Then build with:

```
EXPO_PUBLIC_RELAY_URL=https://<project>.supabase.co
EXPO_PUBLIC_RELAY_ANON_KEY=<publishable key>
EXPO_PUBLIC_LINK_BASE=https://<your domain>/pair   # optional
KAIROS_LINK_DOMAIN=<your domain>                   # optional, with the line above
```

This adds the camera, HealthKit and Health Connect capabilities to the binary, and with them a longer review: HealthKit apps are checked for a privacy policy and for a clear reason to read each data type.
