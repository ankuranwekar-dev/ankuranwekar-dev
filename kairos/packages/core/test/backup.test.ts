/**
 * Encrypted backup, end to end: a phone seals its data, the backup server (the real handler with an in-memory store)
 * holds it for a Sign in with Apple account, and another phone opens it with the recovery code. The server is treated
 * as an adversary: it never sees a key, and a token that is not Apple's is refused.
 */
import { describe, expect, it } from 'vitest';

import { createBackupApi, memoryBackupStore, accountHash } from '../../../supabase/functions/tender-backup/handler';
import { createAppleVerifier, type AppleJwk } from '../../../supabase/functions/tender-backup/verify';
import {
  BackupError,
  fromRecoveryCode,
  newBackupSecret,
  openBackup,
  sealBackup,
  secretFromText,
  secretToText,
  toRecoveryCode,
} from '../src/crypto/backup';
import { toBase64Url } from '../src/crypto/encoding';

const sample = {
  playbook: { name: 'Richa' },
  cycle: { periods: [{ start: '2026-11-14' }] },
  history: [{ key: 'words.letter@2026-11-20', outcome: 'done', title: 'Write her a real letter' }],
};

describe('sealing a backup', () => {
  it('round-trips, and the blob is not readable without the secret', () => {
    const secret = newBackupSecret();
    const blob = sealBackup(secret, sample, '2026-11-21T00:00:00.000Z');
    expect(blob).toMatch(/^[A-Za-z0-9_-]+$/);
    // Nothing recognisable survives: not the name, not a date, not a title.
    for (const word of ['Richa', '2026-11-14', 'letter', 'periods']) expect(blob).not.toContain(word);
    const opened = openBackup<typeof sample>(secret, blob);
    expect(opened.data).toEqual(sample);
    expect(opened.savedAt).toBe('2026-11-21T00:00:00.000Z');
  });

  it('never makes the same blob twice', () => {
    const secret = newBackupSecret();
    expect(sealBackup(secret, sample)).not.toBe(sealBackup(secret, sample));
  });

  it('refuses the wrong secret and any change to the blob', () => {
    const secret = newBackupSecret();
    const blob = sealBackup(secret, sample);
    expect(() => openBackup(newBackupSecret(), blob)).toThrowError(expect.objectContaining({ reason: 'wrong-key' }));
    // Flip one character in the ciphertext.
    const i = Math.floor(blob.length / 2);
    const bent = blob.slice(0, i) + (blob[i] === 'A' ? 'B' : 'A') + blob.slice(i + 1);
    expect(() => openBackup(secret, bent)).toThrowError(expect.objectContaining({ reason: 'wrong-key' }));
  });

  it('tells a damaged blob from a wrong key, and a newer format from both', () => {
    const secret = newBackupSecret();
    expect(() => openBackup(secret, 'not base64 !!')).toThrowError(expect.objectContaining({ reason: 'corrupt' }));
    expect(() => openBackup(secret, 'AAAA')).toThrowError(expect.objectContaining({ reason: 'corrupt' }));
    const blob = sealBackup(secret, sample);
    const bytes = Uint8Array.from(Buffer.from(blob, 'base64url'));
    bytes[0] = 9;
    expect(() => openBackup(secret, toBase64Url(bytes))).toThrowError(expect.objectContaining({ reason: 'newer' }));
  });

  it('keeps the secret as text for the keychain', () => {
    const secret = newBackupSecret();
    expect(secretFromText(secretToText(secret))).toEqual(secret);
    expect(() => secretFromText('AAAA')).toThrow(BackupError);
  });
});

describe('the recovery code', () => {
  it('is nine groups of four, and turns back into the same secret', () => {
    const secret = newBackupSecret();
    const code = toRecoveryCode(secret);
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(fromRecoveryCode(code)).toEqual(secret);
  });

  it('forgives case, spaces, missing dashes and look-alike letters', () => {
    const secret = newBackupSecret();
    const code = toRecoveryCode(secret);
    expect(fromRecoveryCode(code.toLowerCase())).toEqual(secret);
    expect(fromRecoveryCode(code.replace(/-/g, ' '))).toEqual(secret);
    expect(fromRecoveryCode(code.replace(/-/g, ''))).toEqual(secret);
    expect(fromRecoveryCode(code.replace(/0/g, 'o').replace(/1/g, 'l'))).toEqual(secret);
  });

  it('catches a typo in any position', () => {
    const secret = newBackupSecret();
    const code = toRecoveryCode(secret).replace(/-/g, '');
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < code.length; i++) {
      const other = alphabet[(alphabet.indexOf(code[i]!) + 1) % 32]!;
      const typo = code.slice(0, i) + other + code.slice(i + 1);
      expect(() => fromRecoveryCode(typo), `position ${i}`).toThrow(BackupError);
    }
  });

  it('refuses things that are not a code', () => {
    expect(() => fromRecoveryCode('')).toThrow(BackupError);
    expect(() => fromRecoveryCode('ABCD-EFGH')).toThrow(BackupError);
    expect(() => fromRecoveryCode('!'.repeat(36))).toThrow(BackupError);
  });
});

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

const AUD = 'com.9labs.tenderapp';

async function appleKeys() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as AppleJwk;
  jwk.kid = 'test-key';
  return { pair, jwk };
}

const enc = (o: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(o)));

async function mintToken(
  pair: CryptoKeyPair,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'test-key' },
) {
  const input = `${enc(header)}.${enc(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input)));
  return `${input}.${toBase64Url(sig)}`;
}

async function setup(start = 1_800_000_000_000) {
  const { pair, jwk } = await appleKeys();
  let clock = start;
  const store = memoryBackupStore(() => clock);
  const verify = createAppleVerifier({
    audience: AUD,
    keys: async () => [jwk],
    now: () => Math.floor(clock / 1000),
  });
  const api = createBackupApi({ store, verify, pepper: 'p'.repeat(48), now: () => clock });
  const token = (sub: string, over: Record<string, unknown> = {}) =>
    mintToken(pair, {
      iss: 'https://appleid.apple.com',
      aud: AUD,
      sub,
      iat: Math.floor(clock / 1000),
      exp: Math.floor(clock / 1000) + 600,
      ...over,
    });
  const call = async (body: unknown, method = 'POST') => {
    const res = await api(new Request('https://backup.test/functions/v1/backup', { method, body: method === 'POST' ? JSON.stringify(body) : null }));
    return { status: res.status, body: (await res.json()) as any };
  };
  return { api, store, token, call, tick: (ms: number) => (clock += ms), pair, jwk };
}

describe('the backup server', () => {
  it('holds an account\'s sealed backup and hands it to a second phone', async () => {
    const t = await setup();
    const secret = newBackupSecret();
    const blob = sealBackup(secret, sample);

    expect((await t.call({ op: 'head', token: await t.token('apple-user-1') })).status).toBe(404);
    const put = await t.call({ op: 'put', token: await t.token('apple-user-1'), blob, base: 0 });
    expect(put.status).toBe(200);
    expect(put.body.version).toBe(1);

    const head = await t.call({ op: 'head', token: await t.token('apple-user-1') });
    expect(head.body).toMatchObject({ version: 1, size: blob.length });

    // Another phone, same Apple account, fresh token, the recovery code typed in.
    const got = await t.call({ op: 'get', token: await t.token('apple-user-1') });
    const opened = openBackup<typeof sample>(fromRecoveryCode(toRecoveryCode(secret)), got.body.blob);
    expect(opened.data).toEqual(sample);
  });

  it('keeps accounts apart, and never stores the Apple id or anything readable', async () => {
    const t = await setup();
    const a = sealBackup(newBackupSecret(), { who: 'a' });
    const b = sealBackup(newBackupSecret(), { who: 'b' });
    await t.call({ op: 'put', token: await t.token('apple-user-1'), blob: a, base: 0 });
    await t.call({ op: 'put', token: await t.token('apple-user-2'), blob: b, base: 0 });
    expect((await t.call({ op: 'get', token: await t.token('apple-user-1') })).body.blob).toBe(a);
    expect((await t.call({ op: 'get', token: await t.token('apple-user-2') })).body.blob).toBe(b);

    const keys = [...t.store.rows.keys()];
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(k).toHaveLength(43);
      expect(k).not.toContain('apple-user');
    }
    expect(keys).toContain(await accountHash('apple-user-1', 'p'.repeat(48)));
    // A different pepper gives different hashes: a copy of the table alone cannot be matched to Apple ids.
    expect(await accountHash('apple-user-1', 'q'.repeat(48))).not.toBe(keys[0]);
  });

  it('will not overwrite a newer backup from another phone', async () => {
    const t = await setup();
    const tok = () => t.token('apple-user-1');
    const first = await t.call({ op: 'put', token: await tok(), blob: sealBackup(newBackupSecret(), 1), base: 0 });
    t.tick(5000);
    const second = await t.call({ op: 'put', token: await tok(), blob: sealBackup(newBackupSecret(), 2), base: first.body.version });
    expect(second.body.version).toBe(2);
    t.tick(5000);
    // The first phone still thinks it is on version 1.
    const stale = await t.call({ op: 'put', token: await tok(), blob: sealBackup(newBackupSecret(), 3), base: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.version).toBe(2);
    // And cannot claim a fresh start over an existing backup.
    t.tick(5000);
    expect((await t.call({ op: 'put', token: await tok(), blob: sealBackup(newBackupSecret(), 4), base: 0 })).status).toBe(409);
  });

  it('deletes everything on request, and keeps deleting safe to repeat', async () => {
    const t = await setup();
    await t.call({ op: 'put', token: await t.token('apple-user-1'), blob: sealBackup(newBackupSecret(), 1), base: 0 });
    expect((await t.call({ op: 'delete', token: await t.token('apple-user-1') })).body).toEqual({ ok: true });
    expect(t.store.rows.size).toBe(0);
    expect((await t.call({ op: 'get', token: await t.token('apple-user-1') })).status).toBe(404);
    expect((await t.call({ op: 'delete', token: await t.token('apple-user-1') })).status).toBe(200);
  });

  it('refuses tokens that are not Apple\'s, for this app, and in date', async () => {
    const t = await setup();
    const blob = sealBackup(newBackupSecret(), 1);
    const attempt = async (token: string) => (await t.call({ op: 'put', token, blob, base: 0 })).status;

    expect(await attempt(await t.token('u'))).toBe(200);
    t.store.rows.clear();
    t.tick(5000);

    // Signed by someone else's key.
    const other = await appleKeys();
    expect(await attempt(await mintToken(other.pair, { iss: 'https://appleid.apple.com', aud: AUD, sub: 'u', exp: 1_800_000_999 }))).toBe(401);
    // Right key, wrong audience (a token minted for another app), wrong issuer, expired, no subject.
    expect(await attempt(await t.token('u', { aud: 'com.someone.else' }))).toBe(401);
    expect(await attempt(await t.token('u', { iss: 'https://evil.example' }))).toBe(401);
    expect(await attempt(await t.token('u', { exp: 1_700_000_000 }))).toBe(401);
    expect(await attempt(await t.token('u', { sub: undefined }))).toBe(401);
    // Algorithm confusion: an unsigned token, and one that claims HS256.
    expect(await attempt(`${enc({ alg: 'none' })}.${enc({ iss: 'https://appleid.apple.com', aud: AUD, sub: 'u', exp: 1_900_000_000 })}.`)).toBe(401);
    expect(await attempt(await mintToken(t.pair, { iss: 'https://appleid.apple.com', aud: AUD, sub: 'u', exp: 1_900_000_000 }, { alg: 'HS256', kid: 'test-key' }))).toBe(401);
    // Altered payload under the original signature.
    const good = await t.token('u');
    const [h, , s] = good.split('.');
    expect(await attempt(`${h}.${enc({ iss: 'https://appleid.apple.com', aud: AUD, sub: 'someone-else', exp: 1_900_000_000 })}.${s}`)).toBe(401);
    expect(await attempt('garbage')).toBe(401);
    expect(t.store.rows.size).toBe(0);
  });

  it('looks up a rotated Apple key before giving up on a token', async () => {
    const { pair, jwk } = await appleKeys();
    let published: AppleJwk[] = [];
    let fetches = 0;
    const verify = createAppleVerifier({
      audience: AUD,
      keys: async (refresh) => {
        if (refresh) {
          fetches++;
          published = [jwk];
        }
        return published;
      },
      now: () => 1_800_000_000,
    });
    const token = await mintToken(pair, { iss: 'https://appleid.apple.com', aud: AUD, sub: 'u', exp: 1_800_000_600 });
    expect((await verify(token)).sub).toBe('u');
    expect(fetches).toBe(1);
  });

  it('enforces size, shape, method and pace', async () => {
    const t = await setup();
    const tok = await t.token('u');
    expect((await t.call({ op: 'put', token: tok, blob: 'x'.repeat(262_145), base: 0 })).status).toBe(413);
    expect((await t.call({ op: 'put', token: tok, blob: 'not base64!', base: 0 })).status).toBe(400);
    expect((await t.call({ op: 'put', token: tok, blob: 'abc', base: -1 })).status).toBe(400);
    expect((await t.call({ op: 'frobnicate', token: tok })).status).toBe(400);
    expect((await t.call({ op: 'head' })).status).toBe(400);
    expect((await t.call({}, 'GET')).status).toBe(405);

    const blob = sealBackup(newBackupSecret(), 1);
    expect((await t.call({ op: 'put', token: tok, blob, base: 0 })).status).toBe(200);
    // Writing again at once is refused; after a moment it is allowed.
    expect((await t.call({ op: 'put', token: tok, blob, base: 1 })).status).toBe(429);
    t.tick(2500);
    expect((await t.call({ op: 'put', token: tok, blob, base: 1 })).status).toBe(200);
  });
});

describe('sessions (so backups never show Apple\'s sign-in sheet)', () => {
  const DAY = 86_400_000;

  it('trades one Apple token for a session that works for months, with no Apple token after', async () => {
    const t = await setup();
    const res = await t.call({ op: 'session', token: await t.token('apple-user-1') });
    expect(res.status).toBe(200);
    const session: string = res.body.session;
    expect(session.startsWith('s1.')).toBe(true);
    expect(Date.parse(res.body.expiresAt)).toBe(1_800_000_000_000 + 180 * DAY);

    // Apple's token is long expired; the session still backs up, months later.
    t.tick(90 * DAY);
    const blob = sealBackup(newBackupSecret(), sample);
    expect((await t.call({ op: 'put', token: session, blob, base: 0 })).status).toBe(200);
    expect((await t.call({ op: 'head', token: session })).body.version).toBe(1);

    // It is the same account as the Apple identity: a fresh Apple token sees the same backup.
    expect((await t.call({ op: 'head', token: await t.token('apple-user-1') })).body.version).toBe(1);
  });

  it('renews itself without Apple, and stops working once expired', async () => {
    const t = await setup();
    const first = (await t.call({ op: 'session', token: await t.token('apple-user-1') })).body.session;
    t.tick(170 * DAY);
    const renewed = await t.call({ op: 'session', token: first });
    expect(renewed.status).toBe(200);
    expect(Date.parse(renewed.body.expiresAt)).toBe(1_800_000_000_000 + 350 * DAY);

    t.tick(11 * DAY); // the first session is now past its 180 days
    expect((await t.call({ op: 'head', token: first })).status).toBe(401);
    expect((await t.call({ op: 'session', token: first })).status).toBe(401);
    expect((await t.call({ op: 'head', token: renewed.body.session })).status).toBe(404); // valid, just no backup yet
  });

  it('cannot be forged, altered or moved to another account', async () => {
    const t = await setup();
    const a = (await t.call({ op: 'session', token: await t.token('apple-user-1') })).body.session as string;
    await t.call({ op: 'put', token: a, blob: sealBackup(newBackupSecret(), sample), base: 0 });

    const [, payload, sig] = a.split('.');
    const other = toBase64Url(new TextEncoder().encode(JSON.stringify({ u: 'someone-else', e: 9_999_999_999 })));
    for (const bad of [`s1.${other}.${sig}`, `s1.${payload}.${sig!.slice(0, -2)}AA`, `s1.${payload}`, 's1.', 's1.x.y']) {
      expect((await t.call({ op: 'head', token: bad })).status).toBe(401);
    }

    // A server with a different pepper does not accept this one's sessions.
    const elsewhere = createBackupApi({ store: t.store, verify: async () => ({ sub: 'x' }), pepper: 'q'.repeat(48) });
    const res = await elsewhere(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ op: 'head', token: a }) }));
    expect(res.status).toBe(401);

    // Another person's session does not see this backup.
    const b = (await t.call({ op: 'session', token: await t.token('apple-user-2') })).body.session;
    expect((await t.call({ op: 'head', token: b })).status).toBe(404);
  });
});
