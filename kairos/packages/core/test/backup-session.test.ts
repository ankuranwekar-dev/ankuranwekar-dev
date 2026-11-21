/**
 * The decisions around a backup, run against the real backup server code: two phones, one Apple account, a server that
 * can see nothing. Each test is a story a real person could live through.
 */
import { describe, expect, it } from 'vitest';

import { accountHash, createBackupApi, memoryBackupStore } from '../../../supabase/functions/tender-backup/handler';
import { createAppleVerifier, type AppleJwk } from '../../../supabase/functions/tender-backup/verify';
import {
  BackupError,
  ConflictError,
  createBackupSession,
  newBackupSecret,
  openBackup,
  toRecoveryCode,
  type RemoteApi,
  type SecretStore,
} from '../src';
import { toBase64Url } from '../src/crypto/encoding';

interface Data {
  onboarded: boolean;
  name: string;
  periods: string[];
  done: string[];
}
const empty = (): Data => ({ onboarded: false, name: '', periods: [], done: [] });
const richa: Data = { onboarded: true, name: 'Richa', periods: ['2026-11-14'], done: ['letter'] };

// --- a server, and Apple -----------------------------------------------------------------------------------------

const AUD = 'com.9labs.tenderapp';
const enc = (o: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(o)));

async function world() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k' } as AppleJwk;
  let clock = 1_800_000_000_000;
  const store = memoryBackupStore(() => clock);
  const handler = createBackupApi({
    store,
    pepper: 'p'.repeat(48),
    now: () => clock,
    verify: createAppleVerifier({ audience: AUD, keys: async () => [jwk], now: () => Math.floor(clock / 1000) }),
  });
  const token = async (sub: string) => {
    const input = `${enc({ alg: 'RS256', kid: 'k' })}.${enc({ iss: 'https://appleid.apple.com', aud: AUD, sub, iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 600 })}`;
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input)));
    return `${input}.${toBase64Url(sig)}`;
  };
  const post = async (op: string, tok: string, extra: object = {}) => {
    clock += 3000; // a few seconds between writes, as in life
    const res = await handler(new Request('https://x.test/backup', { method: 'POST', body: JSON.stringify({ op, token: tok, ...extra }) }));
    return { status: res.status, body: (await res.json()) as any };
  };
  const apiFor = (): RemoteApi => ({
    async head(t) {
      const r = await post('head', t);
      if (r.status === 404) return null;
      if (r.status !== 200) throw new Error(`head ${r.status}`);
      return r.body;
    },
    async get(t) {
      const r = await post('get', t);
      if (r.status !== 200) throw new Error(`get ${r.status}`);
      return r.body;
    },
    async put(t, blob, base) {
      const r = await post('put', t, { blob, base });
      if (r.status === 409) throw new ConflictError();
      if (r.status !== 200) throw new Error(`put ${r.status}`);
      return r.body;
    },
    async delete(t) {
      const r = await post('delete', t);
      if (r.status !== 200) throw new Error(`delete ${r.status}`);
    },
  });
  return { store, token, apiFor, post, tick: (ms: number) => (clock += ms) };
}

type World = Awaited<ReturnType<typeof world>>;

/** One phone: its own data, its own keychain, optionally an iCloud Keychain shared with another phone. */
function phone(w: World, sub: string, data: Data = empty(), icloud?: { secret?: Uint8Array }) {
  const state = { data, version: undefined as number | undefined, conflict: false, lastBackupAt: '' };
  let local: Uint8Array | null = null;
  const keys: SecretStore = {
    async load() {
      return icloud?.secret ?? local;
    },
    async save(s) {
      local = s;
      if (icloud) icloud.secret = s;
    },
    async forget() {
      local = null;
      if (icloud) icloud.secret = undefined;
    },
  };
  const session = createBackupSession<Data>({
    api: w.apiFor(),
    keys,
    freshToken: () => w.token(sub),
    local: {
      read: () => state.data,
      hasData: () => state.data.onboarded || state.data.periods.length > 0,
      apply: (d) => (state.data = d),
      baseVersion: () => state.version,
      note: (i) => {
        if (i.lastBackupAt) state.lastBackupAt = i.lastBackupAt;
        state.conflict = i.conflict;
        if (!i.conflict) state.version = i.version;
      },
    },
  });
  return { state, keys, session, signIn: async () => session.settle(await w.token(sub)) };
}

describe('turning backup on', () => {
  it('a new account backs up what the phone has, and the server cannot read it', async () => {
    const w = await world();
    const a = phone(w, 'apple-1', structuredClone(richa));
    expect(await a.signIn()).toEqual({ kind: 'ready', restored: false, firstTime: true });
    expect(a.state.version).toBe(1);

    const [row] = [...w.store.rows.values()];
    for (const word of ['Richa', '2026-11-14', 'letter']) expect(row!.blob).not.toContain(word);
    const secret = (await a.keys.load())!;
    expect(openBackup<Data>(secret, row!.blob).data).toEqual(richa);
    // The recovery code is that same secret, ready to write down.
    expect(await a.session.recoveryCode()).toBe(toRecoveryCode(secret));
  });

  it('a new account on an empty phone makes the secret but has nothing to upload yet', async () => {
    const w = await world();
    const a = phone(w, 'apple-1');
    expect(await a.signIn()).toEqual({ kind: 'ready', restored: false, firstTime: true });
    expect(w.store.rows.size).toBe(0);
    expect(await a.keys.load()).not.toBeNull();
  });

  it('keeps two Apple accounts apart', async () => {
    const w = await world();
    await phone(w, 'apple-1', structuredClone(richa)).signIn();
    const other = phone(w, 'apple-2');
    // No backup under the second account, so it starts fresh rather than seeing the first.
    expect(await other.signIn()).toMatchObject({ kind: 'ready', firstTime: true });
    expect(other.state.data).toEqual(empty());
  });
});

describe('a second phone', () => {
  it('restores everything when the secret arrives through iCloud Keychain', async () => {
    const w = await world();
    const icloud: { secret?: Uint8Array } = {};
    await phone(w, 'apple-1', structuredClone(richa), icloud).signIn();

    const b = phone(w, 'apple-1', empty(), icloud);
    expect(await b.signIn()).toEqual({ kind: 'ready', restored: true, firstTime: false });
    expect(b.state.data).toEqual(richa);
    expect(b.state.version).toBe(1);
  });

  it('asks for the recovery code when the secret did not arrive, and refuses a wrong one', async () => {
    const w = await world();
    const a = phone(w, 'apple-1', structuredClone(richa));
    await a.signIn();
    const code = (await a.session.recoveryCode())!;

    const b = phone(w, 'apple-1');
    expect(await b.signIn()).toEqual({ kind: 'need-code' });
    expect(b.state.data).toEqual(empty());

    // A well-formed code for someone else's secret: it does not open this backup, and nothing is kept.
    await expect(b.session.enterCode(toRecoveryCode(newBackupSecret()))).rejects.toMatchObject({ reason: 'wrong-key' });
    expect(await b.keys.load()).toBeNull();
    expect(b.state.data).toEqual(empty());
    // A typo is caught before the server is even asked.
    await expect(b.session.enterCode(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'))).rejects.toBeInstanceOf(BackupError);

    // The right code, however it was typed.
    expect(await b.session.enterCode(code.toLowerCase().replace(/-/g, ' '))).toEqual({ kind: 'ready', restored: true, firstTime: false });
    expect(b.state.data).toEqual(richa);
    expect(await b.keys.load()).not.toBeNull();
  });

  it('asks which to keep when both hold different data, and does what is chosen', async () => {
    const w = await world();
    const icloud: { secret?: Uint8Array } = {};
    await phone(w, 'apple-1', structuredClone(richa), icloud).signIn();

    const mine: Data = { onboarded: true, name: 'Priya', periods: ['2026-10-01'], done: [] };
    const b = phone(w, 'apple-1', structuredClone(mine), icloud);
    const first = await b.signIn();
    expect(first).toMatchObject({ kind: 'choose', remote: { data: richa } });
    expect(b.state.data).toEqual(mine); // nothing changed until the person chose

    b.session.chooseBackup();
    expect(b.state.data).toEqual(richa);

    // The other way round: this phone's data replaces the backup.
    const c = phone(w, 'apple-1', structuredClone(mine), icloud);
    expect(await c.signIn()).toMatchObject({ kind: 'choose' });
    await c.session.keepThisPhone();
    const d = phone(w, 'apple-1', empty(), icloud);
    expect(await d.signIn()).toMatchObject({ restored: true });
    expect(d.state.data).toEqual(mine);
  });

  it('brings everything back after Start over on a phone that kept its keychain', async () => {
    const w = await world();
    const a = phone(w, 'apple-1', structuredClone(richa));
    await a.signIn();

    // Start over: the phone's data is erased; the secret in the keychain and the account on the server are not.
    a.state.data = empty();
    a.state.version = undefined;
    expect(await a.session.review()).toEqual({ kind: 'ready', restored: true, firstTime: false });
    expect(a.state.data).toEqual(richa);
    expect(a.state.version).toBe(1);
  });

  it('does not ask when both already say the same thing', async () => {
    const w = await world();
    const icloud: { secret?: Uint8Array } = {};
    await phone(w, 'apple-1', structuredClone(richa), icloud).signIn();
    const b = phone(w, 'apple-1', structuredClone(richa), icloud);
    expect(await b.signIn()).toEqual({ kind: 'ready', restored: false, firstTime: false });
    expect(b.state.version).toBe(1);
  });
});

describe('keeping it up to date', () => {
  it('backs up changes, each on top of the last', async () => {
    const w = await world();
    const a = phone(w, 'apple-1', structuredClone(richa));
    await a.signIn();
    a.state.data = { ...a.state.data, done: ['letter', 'flowers'] };
    await a.session.backupNow();
    expect(a.state.version).toBe(2);
    expect([...w.store.rows.values()][0]!.version).toBe(2);
  });

  it('never overwrites a newer backup from another phone, and lets the person choose', async () => {
    const w = await world();
    const icloud: { secret?: Uint8Array } = {};
    const a = phone(w, 'apple-1', structuredClone(richa), icloud);
    await a.signIn();
    const b = phone(w, 'apple-1', empty(), icloud);
    await b.signIn(); // restored at version 1

    // Phone A backs up a change; phone B, still on version 1, makes its own change.
    a.state.data = { ...a.state.data, done: ['letter', 'dinner'] };
    await a.session.backupNow();
    b.state.data = { ...b.state.data, name: 'Richa S' };
    await expect(b.session.backupNow()).rejects.toBeInstanceOf(ConflictError);
    expect(b.state.conflict).toBe(true);
    expect([...w.store.rows.values()][0]!.version).toBe(2); // A's backup is intact

    const review = await b.session.review();
    expect(review).toMatchObject({ kind: 'choose', remote: { data: { done: ['letter', 'dinner'] } } });
    b.session.chooseBackup();
    expect(b.state.data.done).toEqual(['letter', 'dinner']);
    expect(b.state.conflict).toBe(false);
    expect(b.state.version).toBe(2);
  });

  it('fails cleanly when Apple needs the person to sign in again', async () => {
    const w = await world();
    const a = phone(w, 'apple-1', structuredClone(richa));
    await a.signIn();
    const before = structuredClone(a.state.data);
    const broken = createBackupSession<Data>({
      api: w.apiFor(),
      keys: a.keys,
      freshToken: async () => {
        throw new Error('sign in again');
      },
      local: {
        read: () => a.state.data,
        hasData: () => true,
        apply: () => {},
        baseVersion: () => a.state.version,
        note: () => {},
      },
    });
    await expect(broken.backupNow()).rejects.toThrow('sign in again');
    expect(a.state.data).toEqual(before);
    expect([...w.store.rows.values()][0]!.version).toBe(1);
  });
});

describe('deleting the backup', () => {
  it('erases it from the server and forgets the secret, and leaves the phone\'s data alone', async () => {
    const w = await world();
    const a = phone(w, 'apple-1', structuredClone(richa));
    await a.signIn();
    await a.session.deleteBackup();
    expect(w.store.rows.size).toBe(0);
    expect(await a.keys.load()).toBeNull();
    expect(a.state.data).toEqual(richa);

    // Signing in again afterwards starts a brand new backup, with a new secret.
    const again = phone(w, 'apple-1', structuredClone(richa));
    expect(await again.signIn()).toMatchObject({ kind: 'ready', firstTime: true });
  });

  it('a stolen copy of the table says nothing about who or what', async () => {
    const w = await world();
    await phone(w, 'apple-1', structuredClone(richa)).signIn();
    const [key, row] = [...w.store.rows.entries()][0]!;
    expect(key).toBe(await accountHash('apple-1', 'p'.repeat(48)));
    expect(JSON.stringify(row)).not.toMatch(/Richa|apple-1|2026/);
  });
});
