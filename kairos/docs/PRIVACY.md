# Privacy and security

**Promise:** her raw cycle data never leaves her phone. What she chooses to share with him is end-to-end encrypted. Our servers hold only ciphertext they cannot read, and delete it within 30 days.

This is a design constraint, not a feature. Reproductive health data has become legally and commercially dangerous:

- After *Dobbs v. Jackson* (June 2022), cycle data can be sought by subpoena in US states that restrict abortion.
- The FTC settled with Flo Health (2021) and with Premom's developer (2023, $100,000 civil penalty plus a ban on sharing health data for advertising) over health-data sharing.
- In August 2025 a federal jury in San Francisco found that Meta violated California's Invasion of Privacy Act by receiving Flo users' health data through SDKs.
- In 2022, at least one period tracker marketed "end-to-end encryption" while actually using only server-side encryption, and then removed the claim. The lesson: say exactly what the cryptography does, publish the code, and get it audited.
- Apple's App Store Guideline 5.1.3 forbids using HealthKit data for advertising, marketing or data mining, or sharing it with third parties for those purposes.
- In the UAE, Federal Law No. 2 of 2019 (the ICT in Health Fields law) restricts processing and storing health data outside the country except under exemptions set by the health authorities. Because Kairos's relay never holds readable health data, it is in a strong position, but counsel should confirm before a UAE launch.

---

## 1. What lives where

| Data | Her phone | His phone | Relay | Apple / Google push | Calendar |
| --- | --- | --- | --- | --- | --- |
| Periods, LH tests, temperatures, mucus, pregnancy tests | ✔ (and in Apple Health / Health Connect, which she already uses) | ✘ | ✘ | ✘ | ✘ |
| Forecast | ✔ computed on device | ✘ | ✘ | ✘ | ✘ |
| Snapshot (seasons, and fertility only at that share level) | ✔ | ✔ decrypted | ciphertext | ✘ | codenames only, his device |
| Her playbook | ✔ | ✔ decrypted | ciphertext | ✘ | ✘ |
| Signals | ✔ | ✔ decrypted | ciphertext | content-free wake-up | ✘ |
| His nudges and history | ✘ | ✔ planned on device | ✘ | ✘ (local notifications) | optional, his device |
| Names, email, phone number, date of birth | — | — | **never collected** | — | — |

There are no accounts. A pairing is identified by a random mailbox id derived from the invite secret.

## 2. Pairing

Implemented in `packages/core/src/crypto/pairing.ts` with audited, pure-JavaScript libraries (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`).

1. **Her phone** generates an X25519 key pair and a 32-byte invite secret, derives the mailbox id (`HKDF(secret, "pairing-id")`, 16 bytes) and a mailbox token (`HKDF(secret, "mailbox-token")`), and opens a mailbox on the relay by sending only the id and `SHA-256(token)`.
2. The invite travels **out of band**: a QR code he scans in person (best), or a link `https://kairos.love/pair#k1.<herPublicKey>.<secret>`. The secret is in the URL fragment, which browsers never send to servers.
3. **His phone** generates its own X25519 key pair and posts a join request: his public key plus `HMAC-SHA256(HKDF(secret, "join-mac"), herPublicKey ‖ hisPublicKey)`. The relay cannot forge or swap this without the secret.
4. **Both phones** compute `X25519(mine, theirs)`, run `HKDF-SHA256` salted with the invite secret and bound to both public keys, and split the output into two directional 32-byte keys.
5. **Both phones show the same four emoji** (`SHA-256` of both public keys, 24 bits). Matching emoji prove no one sat in the middle.

## 3. Messages

Every message is an envelope `{ v, type, seq, nonce, body }`: XChaCha20-Poly1305 with a random 24-byte nonce and associated data `kairos/v1 | pairId | type | seq`. Changing the type, sequence number or pairing, or flipping a single bit, makes decryption fail. Receivers drop any envelope whose sequence number is not newer than the last one accepted for that type, so replays are rejected. Keys are directional, so neither phone can be tricked into decrypting its own messages as the other's.

Tests: `packages/core/test/crypto.test.ts` and `relay.test.ts`. The relay test pairs two phones through the real relay handler, then serialises everything the relay stored and asserts that no plaintext (season names, her name, playbook entries) and no token appears in it.

## 4. The relay

`supabase/` contains the Postgres schema and the Edge Function.

- **Tables:** `mailboxes (pair_id, token_hash, created_at, last_seen)`, `envelopes (id, pair_id, sender, type, envelope, created_at)`, `push_tokens (pair_id, role, token)`.
- **Row Level Security is on with no policies**, and table privileges are revoked from `anon` and `authenticated`. Only the Edge Function, with the service role, touches the tables, and only after checking the mailbox token with a constant-time comparison.
- **Same answer** for "no such mailbox" and "wrong token", so mailboxes cannot be probed.
- **Limits:** envelopes ≤ 64 KB; only five message types; only he can post a join.
- **Minimisation:** a trigger keeps only the last three snapshots per sender; a retention function deletes envelopes after 30 days and idle mailboxes after 90 (schedule with `pg_cron`). Unpairing deletes the mailbox and, by cascade, everything in it.
- **Push:** when a message arrives, the relay sends the partner's devices a **content-free** wake-up (no title, no body, a version number only). The phone fetches, decrypts and decides locally what to show. Apple, Google and Expo learn only that *something* arrived. A later version should talk to APNs and FCM directly to take Expo's push service out of the path.

The migration has been run against Postgres (PGlite): constraints, pruning, retention, cascade deletes and the `anon` denial behave as described.

## 5. Notifications, widgets and calendars

- **His daily ideas are local notifications**, scheduled on his phone from the decrypted snapshot. No server composes or sees them.
- **Lock-screen copy is vague by default**: "A little idea for today · Takes about 15 minutes". Detailed text is opt-in and still never mentions her cycle.
- **Calendar events** are written by his phone into a local "Seasons" calendar: all-day, marked free, private, titled with a codename he can change (`packages/core/src/calendar/ics.ts`, `apps/app/src/platform/calendar.ts`). The web version generates an `.ics` file locally; nothing is uploaded.
- **The iOS widget** shows a codename and, only if he opted into detailed notifications, today's idea.

## 6. Keys at rest

Key material is stored in the iOS Keychain / Android Keystore-backed secure storage with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it is excluded from iCloud backups and does not migrate to a new phone. Re-pairing on a new phone is a 30-second QR scan. The web app can only use `localStorage`, which is why it is a companion and a demo, not the place to keep keys long-term.

## 7. Threat model

| Adversary | Can | Cannot |
| --- | --- | --- |
| The relay operator (us), a database leak, or a subpoena to us | See that a mailbox exists, when messages arrive, their size and type | Read any message, link a mailbox to a person, recover the token from the stored hash |
| Network attacker | Same metadata as above, through TLS | Read or alter messages |
| Apple / Google / Expo push services | See that his phone was woken | See why |
| A malicious relay trying to sit in the middle of pairing | Withhold or delay messages | Substitute its own key (the join MAC needs the invite secret; the safety emoji would differ) |
| Someone who picks up his unlocked phone | See what he sees: her season and, at the fertility level, her fertile days | See her temperatures, tests, notes or a pregnancy result |
| A controlling partner | See only what she shares | Stop her pausing or unpairing; see why she paused |

**Known v1 limitations, stated plainly:** keys are static for the life of a pairing (no forward secrecy; re-pairing rotates them); traffic metadata is visible to the relay; the share levels control what he is shown, not what he could infer by arithmetic (a period forecast implies an approximate ovulation date). v2 moves to a ratcheting protocol (MLS) and adds padding and batched delivery.

## 8. Commitments to make at launch

These are recommendations for the company, not things this repository can guarantee by itself:

- No ads, no SDKs that phone home with behaviour, no data brokers. Revenue comes from subscriptions.
- Publish `packages/core` as open source so anyone can check the cryptography.
- Commission an independent security audit before public launch and publish the report.
- Ship privacy nutrition labels that say "Data Not Collected" for health data, because it is not.
