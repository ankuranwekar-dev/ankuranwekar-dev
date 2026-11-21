# Shipping Tender to the App Store

This is the runbook for the steps that need a Mac and an Apple Developer account. Everything that could be prepared without them is in the repository already.

## Where things stand

| Item | Status |
| --- | --- |
| App code, both editions | Done. Type-checks; web build exercised end to end in Chromium |
| iOS and Android JavaScript bundles | Build (`expo export`), Hermes bytecode |
| App configuration (`app.json`, `app.config.ts`, `eas.json`) | Done; resolves cleanly for both editions |
| Privacy manifest, permission strings | Done |
| Store listing (`apps/app/store.config.json`) | Drafted. Publisher name, copyright and review email are filled in; the App Review contact phone is still a placeholder (`+1 000 000 0000`), and App Store Connect requires a real one |
| Privacy policy and support pages (`site/`) | Drafted; need your name, contact address and a public URL |
| Native iOS build (Xcode / CocoaPods) | Done: Release for iOS devices builds on Xcode 27.2 (see "Xcode version"), signs with team UMD9S65GU8 and installs on an iPhone 17 running iOS 27.2 |
| Simulator testing | Done on an iPhone 17 Pro Max simulator, light and dark, smallest and largest text sizes (before photo reading was added) |
| **Photo of her calendar** | Built: Apple Vision text recognition plus a perspective fit (`docs/SCIENCE.md`). 61 of 66 simulated camera photos read exactly, 16 of 18 of them through the real app on an iPhone. **Never tried on a real photograph of a real app**; do that before launch (see "Review risks") |
| Screenshots from a real simulator | Captured from the Release build: `docs/store-screenshots/` (6.9-inch, 1320 x 2868; light in the folder, dark in `dark/`) |
| **Widget and notifications on a device** | **Not run.** The widget has never been seen on a Home or Lock Screen, and no notification has been seen to fire |
| **Upload and submission** | **Not done.** Needs your Apple Developer account |

The first native build is where problems usually surface: a config plugin that disagrees with the SDK, a pod that fails to compile, a layout that the safe area clips. Budget time for that; none of it has been tested.

## Decisions that are yours

1. **App name.** `Tender`, for both the home-screen name and the store title. A search of the US and UAE App Stores on 20 November 2026 found no app with that exact name, but App Store Connect only settles it when you create the app record. If plain "Tender" is refused, use `Tender: Her Seasons` (change `title` in `store.config.json`). It is a common word, so a trademark search is worth doing before launch.
2. **Bundle identifier.** `com.9labs.tenderapp`, following your other apps' `com.9labs.*` (plain `com.9labs.tender` was already claimed by a test registration on your other team, and App IDs are unique across Apple). It is permanent once the app is created in App Store Connect, so change it (in `app.json` and the default in `app.config.ts`, or set `KAIROS_BUNDLE_ID` in the build environment) before then if you want something else.
3. **Edition.** The default build is the **solo** edition: his phone only, set up from a screenshot or a date, no server. This is the one to ship first: it has nothing to operate and the smallest review surface. The **paired** edition (her app, pairing, signals, Apple Health) switches on when `EXPO_PUBLIC_RELAY_URL` is set, and needs the relay deployed (see the end of this page).
4. **Price.** The listing assumes free. Subscriptions are not implemented.
5. **Publisher details.** Done: name, contact email and date are in `site/privacy.html`, `site/support.html` and `apps/app/store.config.json`. Still to do: the review contact phone number in `store.config.json`. Update the "Last updated" date in `site/privacy.html` whenever the policy changes.

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

- Welcome → **I'm her partner** → **Pick a date** → **Continue** → *You're all set* (**Turn on morning ideas**, which asks for notifications there, or **Not now**) → Today → **I did it**, which ends on *That's today's, done*.
- Welcome → **Her calendar** → **Take a photo** (on a device; point it at another phone's month view), or **Choose a photo or screenshot** (in the simulator, drag a screenshot of any tracker's month view in first so it is in Photos).
- Tap the orb (Rhythm), her initial (profile), and the idea card (detail).
- Notifications: finish setup, allow them, then check `Settings → Notifications → Tender`.
- Light and dark appearance; the largest and smallest Dynamic Type sizes.

Capture store screenshots from a 6.9-inch simulator (iPhone 16 Pro Max or newer):

```bash
xcrun simctl io booted screenshot today.png
```

The seven screens in `docs/store-screenshots/` (taken before photo reading and before the demo was removed, so the setup and import screens are out of date) avoid fertile-window wording on purpose (see "Health claims" below). When you retake them, answer the notification prompt before capturing, and pick a date that puts her in autumn or winter.

### Xcode version

Expo SDK 58 needs a recent Xcode. The project builds on **Xcode 27.2** (Release, for iOS devices, no patches), with `expo-doctor` at 20 of 20 checks. It does **not** build on Xcode 26.0: that Swift rejects `weak let` in `expo-modules-core` and a `sending` rule in `expo-modules-jsi` 58.0.21 and later. Expo's own build images use Xcode 27.1, so there is no reason to go back.

Finishing setup crashed the app on Xcode 26.0 (simulator) until notification setup was moved after the screen transition (a fault in Expo's notification module, not in Tender). It did not crash in six cold runs afterwards, but it was timing-dependent, so check it again on a real iPhone with the Xcode 27.2 build.

Android package names cannot start a segment with a digit, so Android uses `com.ninelabs.tender` while iOS uses `com.9labs.tenderapp`.

Then archive and upload: open `ios/Tender.xcworkspace` in Xcode, choose your team under *Signing & Capabilities*, select *Any iOS Device*, then *Product → Archive → Distribute App → App Store Connect*.

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

**App Privacy.** Without signing in nothing leaves the device. Signing in with Apple is optional and adds an encrypted backup (see `supabase/functions/tender-backup`), which changes the answers: **Identifiers → User ID** is collected (a keyed hash of Apple's identifier; never the identifier itself), used for **App Functionality**, **linked to the user's identity** (it is how the account finds its backup), **not used for tracking**. Everything else stays **not collected**: the backup is encrypted on the phone with a key the server never has, so Tender cannot read it (Apple's definition of "collected" excludes data transmitted in a form the developer cannot access), no name or email is requested from Apple, and there is no analytics or usage tracking of any kind. Sign in with Apple is not required by Guideline 4.8 (Tender offers no other login), and in-app deletion of the backup and account is provided as Guideline 5.1.1(v) requires: *Profile → Back up → Delete the backup and account*. If you would rather keep the "Data Not Collected" label, ship without `EXPO_PUBLIC_BACKUP_URL`: the account feature is then absent from the app.

**(Earlier answer, for a build with no backup URL): "Data Not Collected".** Nothing leaves the device. For the paired edition, a push token is sent to the relay (an identifier, used for app functionality, not linked to identity); the shared forecast is end-to-end encrypted and unreadable to you. Whether unreadable ciphertext counts as "collected" under Apple's definition is a judgement call; take advice before answering.

**Export compliance.** The app contains its own implementation of standard encryption (X25519, HKDF-SHA-256, XChaCha20-Poly1305) for pairing. `ITSAppUsesNonExemptEncryption` is deliberately not set, so App Store Connect will ask. Answer that the app uses standard encryption algorithms in addition to those in the operating system, and follow what it tells you from there (France has an extra declaration). This is a legal question; the answer above is a starting point, not advice.

**Age rating.** Apple requires a rating for every app; there is no "unrated" option. Answer the questionnaire honestly: there is no explicit content, but there are romantic themes and references to fertility and wellness topics. The privacy policy says Tender is intended for adults, and App Store Connect lets you set a higher age rating than the questionnaire computes, so choosing 18+ is possible; check the exact wording in the Age Rating section when you get there.

**Health claims.** The listing and the app say plainly that Tender is not a contraceptive and not a medical device. Keep it that way in any screenshots or marketing text you add; reviewers reject fertility apps that imply otherwise.

**Review notes** are in `store.config.json`. There is no login and no demo mode: App Review sets the app up from a date, or from a photo or screenshot of any calendar.

**URLs.** The `site/` folder is published with GitHub Pages from the `gh-pages` branch of this repository:

- Privacy policy URL: `https://ankuranwekar-dev.github.io/ankuranwekar-dev/privacy.html`
- Support URL: `https://ankuranwekar-dev.github.io/ankuranwekar-dev/support.html`

After editing anything in `site/` (the pages name the app, so a rename needs this), run `kairos/scripts/publish-site.sh`. It copies `site/` to `gh-pages` and force-pushes that branch, which only ever holds a copy of `site/`. Check that the privacy page still matches what the app does before each release.

## Review risks worth knowing

- **A woman's health data on a man's phone.** Nothing in Apple's guidelines forbids it, and the data never leaves the device, but a reviewer may ask. The answer: she provides the screenshot, the app says so, and nothing is transmitted.
- **Reading is unproven on real apps.** Screenshots and photographs both score well on look-alike calendars rendered or simulated for the benchmark (see `docs/SCIENCE.md`), but neither has been run on real screenshots or real photographs of Flo, Clue, Apple Health and the rest. Test with real ones before launch (a photo of a real tracker, in daylight and indoors, straight on and at an angle); the confirm screen lets the user correct a bad read, but a reviewer who sees a wrong first read will not be impressed. To measure the photo route on a phone without a second phone: build with `EXPO_PUBLIC_DEV_READ=1`, copy JPEGs and a `manifest.json` into the app's `Documents/photos` with `xcrun devicectl device copy to`, open `tender://dev-read`, and copy `Documents/results.json` back (never set that variable for a store build). A build made with that variable keeps its data under its own storage key, so it never reads or changes the data of a normal install on the same phone; the phone must still be free, because the hooks drive the screen by link.
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
