# Sign in with Apple and the sealed backup

Optional. Nothing in Tender needs an account. Signing in with Apple keeps **one encrypted backup** of the person's own data (her cycle, ideas done, settings) so a new or reinstalled phone picks up where the old one left off, and the History screen survives. Tender asks Apple for **no name and no email**.

## How it works

1. **Sign in with Apple** on the phone (`expo-apple-authentication`, scopes: none). Apple returns a stable per-app user id and a short-lived identity token.
2. **A secret is made on the phone**: 20 random bytes. It is kept in the **iCloud Keychain** (one synchronizable item, `modules/tender-keychain`) so another phone on the same Apple ID has it, and in this phone's own keychain. It is also shown once as a **recovery code** (`XXXX-…`, nine groups, checksummed) to write down, for the day iCloud Keychain is off.
3. **The data is sealed on the phone**: XChaCha20-Poly1305 over the JSON, keyed by HKDF of the secret (`packages/core/src/crypto/backup.ts`). The blob is sent with the identity token.
4. **The server** (`supabase/functions/tender-backup`) verifies the token against Apple's public keys (signature, issuer, audience = the bundle id, expiry), then stores one blob per account under a **keyed hash of the Apple id** (pepper in Supabase Vault). It sees how big the blob is and when it changed, and nothing else.
5. **Restore**: sign in on the new phone. If the secret arrived through iCloud Keychain it opens by itself; otherwise the app asks for the recovery code (a wrong code opens nothing and keeps nothing). If both the phone and the account hold different data, the person chooses which to keep. Another phone backing up first is detected by a version number and never overwritten silently.
6. **Delete**: *Profile → Back up → Delete the backup and account* erases the blob from the server and forgets the secret here. The data on the phone stays.

What a backup carries is listed in `apps/app/src/state/backup-data.ts`: cycle, intent, share level, playbook (her name and favourites), settings, ideas done, mentions. Not pairing keys, not anything received from her phone, not this phone's calendar link.

## Where it runs

| | |
| --- | --- |
| Server | Supabase project `Socially Connected` (`eetqqwtjsebywzfuaydp`, Tokyo), function `tender-backup`, table `public.tender_backups`, Vault secret `tender_backup_pepper` |
| Address | `https://eetqqwtjsebywzfuaydp.supabase.co/functions/v1/tender-backup` (set in `apps/app/.env` as `EXPO_PUBLIC_BACKUP_URL`; delete that line to build an app with no account feature) |
| Why shared | The free plan allows two active projects. Names are prefixed `tender` so nothing touches the other app, and the table is closed to the API roles. It is a single table and a single function; moving to a dedicated project later is a matter of running the migration there and changing the address, because the blob is opaque |

Redeploy after changing the function: `supabase functions deploy tender-backup --no-verify-jwt`, or the Supabase dashboard / MCP. Apply `supabase/migrations/20261121000000_tender_backups.sql` once. **Do not delete the Vault secret**: it keys every account's hash, and losing it orphans every backup.

## What is tested

- `test/backup.test.ts`: sealing, wrong key, tampering, truncation, newer format, recovery-code round trip and typo detection in every position, and the server (real handler, in-memory store, a fake Apple with a generated RSA key): valid tokens, a token from another key, wrong audience, wrong issuer, expired, no subject, `alg: none`, `alg: HS256`, an altered payload, key rotation, size, shape, method, pace, account isolation, no readable data or Apple id in the table.
- `test/backup-session.test.ts`: the stories around it: a new account, an empty phone, a second phone with and without the secret, a wrong recovery code, both sides holding data (either choice), the same data on both, a stale phone refused and shown the choice, Apple needing a new sign-in, deletion and starting again.
- The deployed function was called with junk, missing fields, GET and a non-JSON body (401, 400, 405, 400), and the table was checked: RLS on, no access for `anon` or `authenticated`, the pepper function runnable only by the service role.

## What is not yet proven

- A real sign-in on a real iPhone: the Apple sheet, the identity token Apple really issues, the iCloud Keychain item reaching a second device. The server has only been called with tokens made by the tests.
- The Sign in with Apple capability on the App ID (`com.9labs.tenderapp`) in the developer portal; automatic signing is expected to enable it.
- Backup and restore across two physical phones.
