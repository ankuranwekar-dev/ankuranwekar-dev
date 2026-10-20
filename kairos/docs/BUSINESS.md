# Business

## The position in one line

Not another period tracker. She already has one. **Kairos turns what she tracks into what he does.**

## The market, honestly

Partner sharing is no longer new. Flo launched *Flo for Partners* (the partner gets educational stories about her cycle, ovulation and pregnancy); Clue has *Clue Connect* (an invite code shows the partner her cycle phases); and by 2026 there is a crowd of small "period tracker for men" and couples apps. So the question is not whether men can see her calendar. They can.

What none of them do well, as far as the public material shows:

| | Typical partner-sharing app | Kairos |
| --- | --- | --- |
| What he gets | Her calendar, phase names, articles | One specific, timed action a day, with lead time |
| Personal to her | Generic tips | Her own playbook: what makes her feel loved, her favorites, her "please don't" list, things she mentioned |
| Her voice | Mostly one-way | Eight one-tap signals that override the forecast |
| Fertility | Calendar estimate | Bayesian model fusing LH tests, temperature and mucus, with honest uncertainty |
| Never transactional | Not addressed | Planner constraint: big gestures spread across the whole cycle |
| Privacy | Account-based, server-side data; the category has a record of FTC actions and a 2025 jury verdict | End-to-end encrypted, no accounts, raw data never leaves her phone |
| Trying to conceive | Her fertile days | His part: clear evenings, keep it spontaneous, the two-week wait, test day, gentleness if her period comes |

The wedge is **action plus trust**. Action is what he lacks; trust is what she requires.

## Who pays

- **Her: free, forever, all features.** She is the gatekeeper. Any paywall on her side slows the only thing that matters early, pairing.
- **Him: freemium.**
  - *Free:* period heads-up, her signals, three ideas a week.
  - *Kairos Plus* (pricing hypothesis: $6.99 a month or $49.99 a year, to be tested): daily ideas, full playbook and mentions, lead-time planning, calendar, widget, trying-to-conceive mode.
- **Gift subscriptions.** "Give him Kairos" for weddings, anniversaries, a first pregnancy attempt. She can buy it for him; he can buy it to ask her to pair, with an invitation that explains the privacy model to her first.
- **Partnerships (later).** Fertility clinics and employer fertility benefits want partner engagement; Kairos can be offered as a benefit. Clinics get nothing back but anonymous, aggregate, opt-in outcomes, if that.
- **Commerce (careful, later).** Florist, restaurant and pharmacy shortcuts are plain search links today. Affiliate deals are possible but must never put health or cycle information into a URL, and must clear Apple Guideline 5.1.3. Treat it as small revenue at best.

### An illustrative model, not a forecast

All inputs below are assumptions to replace with real data.

| Input | Assumption |
| --- | --- |
| Women who install and invite | 200,000 in year one |
| Pairing within 7 days | 50% → 100,000 paired couples |
| His paid conversion | 10% → 10,000 subscribers |
| Average revenue per subscriber after store fees (Apple/Google 15% small-business rate) | ~$42 a year |
| Year-one subscription revenue | ~$420,000 |

The levers are obvious from the table: pairing rate and his conversion dominate. That is why the product spends its design budget on the invite moment and on his first two weeks.

## Go-to-market

1. **Lead with her trust, sell to him.** The story that travels is "the app that makes men better at being there", and the proof she needs is "he can't see my data". Every channel carries both halves.
2. **Two funnels.**
   - *Her first:* she installs (for the signals, the period support, or because they are trying), and invites him from the Sharing screen.
   - *Him first:* he installs, and the app helps him ask her: a beautiful invite that leads with what she controls. This is the growth loop most partner apps lack.
3. **Trying-to-conceive couples are the beachhead.** Highest motivation, clearest value, natural partners (fertility clinics, OB-GYNs, prenatal brands). Roughly one in six people face infertility; the evaluation prompt at 12 months (6 if 35+) is a genuine service.
4. **GCC launch angle.** A marriage-centred culture and low, falling fertility (the UAE was at about 1.2 children per woman in 2023, World Bank). Requirements: Arabic with right-to-left layout, tasteful copy (the library already avoids explicit content), both Saturday–Sunday (UAE) and Friday–Saturday (Saudi Arabia, Qatar) weekends (already supported in settings), and legal review under the UAE ICT health law and PDPL.
5. **Creators, not ads.** Couples creators, men's self-improvement podcasts, and wedding planners. The app's screenshots do the explaining: an orb, a season, one kind idea.
6. **Moments that sell themselves.** Valentine's Day, anniversaries, Ramadan and Eid gifting, wedding season, New Year resolutions.

## Regulatory posture

- **Wellness, not medical device, at launch.** No contraception claims (Natural Cycles and Clue had to obtain FDA clearance for that). Careful wording on conception ("helps you time things", not "improves your chances by X%") until a clinical study supports a claim. Regulatory counsel should review claims for the US (FDA general-wellness guidance), the EU (MDR) and the UAE before launch.
- **Health data law.** GDPR treats data about health and sex life as special-category data; explicit consent is required, and end-to-end encryption narrows what the company processes at all. UAE: PDPL plus the ICT in Health Fields law. US: FTC Act section 5 and the Health Breach Notification Rule apply to health apps outside HIPAA.
- **App stores.** HealthKit data never used for marketing; 17+ rating likely; copy reviewed against sexual-content rules.

## What this can and cannot do for "the species"

The honest answer: no app will reverse the global decline in fertility. Its causes are economic and social: education and careers, housing, the cost of children, later marriage and smaller chosen families. Forecasts put global fertility at about 1.8 children per woman by 2050.

What Kairos can do is narrower and worth doing:

- help couples who want children get the timing right without turning their relationship into a schedule;
- keep both partners engaged and kind through the hardest part, the waiting and the disappointments;
- push couples who are struggling to see a doctor at 12 months (6 if she is 35+) instead of drifting, because the most effective fertility intervention is often simply an earlier one;
- and, for everyone else, make the relationship a little better every month, which is a precondition for families of any size.

## Build plan

| Phase | Weeks | Team | Output |
| --- | --- | --- | --- |
| 0. Prototype | Done | — | This repository: engine, app, relay, docs, live demo |
| 1. Private beta | 1–12 | 2 React Native engineers, 1 product designer, founder/PM, fractional security engineer, clinical advisor (OB-GYN or reproductive endocrinologist) | Real pairing on TestFlight and Play internal testing, push-to-wake, Siri and widget signals, Arabic, 50 couples |
| 2. Launch | 13–24 | + growth lead, + support | App Store and Play launch in the UAE and English-speaking markets, security audit published, subscriptions live |
| 3. Proof | 25–52 | + data scientist (privacy-preserving, opt-in) | Prospective accuracy study, clinic partnerships, Apple Watch, Android widget |

## Name

*Kairos* fits the idea (the right moment), works in English and Arabic-speaking markets, and is neutral enough that she is as comfortable with it on her home screen as he is. It is also used by other companies in unrelated fields, so a trademark search in classes 9, 42 and 44 is the first legal task. Fallbacks: *Tend*, *Attune*, *Wavelength*.
