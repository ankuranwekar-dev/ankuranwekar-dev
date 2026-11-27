/**
 * The Tender backup: one sealed blob per Apple account, and nothing else.
 *
 * It is written against Web-standard Request/Response and SubtleCrypto only, with storage and token verification
 * injected, so the same code runs in a Supabase Edge Function (Deno) and in Node tests.
 *
 * Request: POST JSON `{ op, token, ... }`, where `token` is the person's Sign in with Apple identity token.
 *   head    -> { version, updatedAt, size }              does a backup exist, how big, when
 *   get     -> { blob, version, updatedAt }              the sealed blob
 *   put     { blob, base } -> { version, updatedAt }     replace it; `base` is the version being replaced (0 for none)
 *   delete  -> { ok: true }                              erase the account's backup for good
 *   session -> { session, expiresAt }                    a Tender session token for this account
 *
 * `token` is either an Apple identity token or a Tender session token (`s1.…`). Apple's tokens last ten minutes and a
 * new one can only be had by showing the person Apple's sign-in sheet, so the app trades one for a session once, at
 * sign-in, and uses the session for everything after: backups never interrupt anyone. A session is the account hash
 * and an expiry, signed with a key derived from the pepper; `session` called with a live session renews it.
 *
 * What it can see: that an account exists, how large its blob is and when it last changed. What it cannot see: anything
 * inside the blob. The account is stored as a keyed hash of Apple's identifier, so a copy of the table does not name
 * anyone either.
 */

export interface BackupRow {
  blob: string;
  version: number;
  updatedAt: string;
}

export interface BackupStore {
  get(userHash: string): Promise<BackupRow | null>;
  /** Create (`expected` 0) or replace (`expected` is the current version). Null when the version has moved on. */
  put(userHash: string, blob: string, expected: number): Promise<BackupRow | null>;
  delete(userHash: string): Promise<void>;
}

export type TokenVerifier = (token: string) => Promise<{ sub: string }>;

export interface BackupOptions {
  store: BackupStore;
  verify: TokenVerifier;
  /** Secret that keys the account hash. Losing it orphans every backup; leaking it lets a leaked table be matched to Apple ids. */
  pepper: string;
  now?: () => number;
  /** Longest blob accepted, in characters. */
  maxChars?: number;
  /** Fewest milliseconds between two writes by one account. */
  minIntervalMs?: number;
  /** How long a session lasts, in days. */
  sessionDays?: number;
}

const SESSION_PREFIX = 's1.';

const BLOB_RE = /^[A-Za-z0-9_-]+$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Signs and checks Tender session tokens: `s1.<payload>.<signature>`, payload `{"u": account hash, "e": expiry s}`. */
export function sessionTokens(pepper: string) {
  const key = hmac(new TextEncoder().encode(pepper), 'tender-session-v1');
  return {
    async issue(user: string, expiresAt: number): Promise<string> {
      const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ u: user, e: expiresAt })));
      const sig = toBase64Url(await hmac(await key, SESSION_PREFIX + payload));
      return `${SESSION_PREFIX}${payload}.${sig}`;
    },
    /** The account hash and expiry, or null if the token is not a genuine session. Expiry is the caller's to check. */
    async read(token: string): Promise<{ user: string; expiresAt: number } | null> {
      if (!token.startsWith(SESSION_PREFIX) || token.length > 512) return null;
      const [payload, sig] = token.slice(SESSION_PREFIX.length).split('.');
      if (!payload || !sig) return null;
      try {
        const want = await hmac(await key, SESSION_PREFIX + payload);
        if (!sameBytes(want, fromBase64Url(sig))) return null;
        const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { u?: unknown; e?: unknown };
        if (typeof body.u !== 'string' || typeof body.e !== 'number') return null;
        return { user: body.u, expiresAt: body.e };
      } catch {
        return null;
      }
    },
  };
}

/** Keyed hash of the Apple identifier: 43 characters. */
export async function accountHash(sub: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sub))));
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export function createBackupApi(opts: BackupOptions): (req: Request) => Promise<Response> {
  const now = opts.now ?? (() => Date.now());
  const maxChars = opts.maxChars ?? 262_144;
  const minInterval = opts.minIntervalMs ?? 2000;
  const sessionSeconds = Math.round((opts.sessionDays ?? 180) * 86_400);
  const sessions = sessionTokens(opts.pepper);

  return async (req) => {
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'POST only');
      let body: { op?: unknown; token?: unknown; blob?: unknown; base?: unknown };
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, 'Body must be JSON');
      }
      if (typeof body.op !== 'string' || typeof body.token !== 'string') throw new HttpError(400, 'op and token are required');

      let user: string;
      if (body.token.startsWith(SESSION_PREFIX)) {
        const s = await sessions.read(body.token);
        if (!s || s.expiresAt * 1000 <= now()) throw new HttpError(401, 'Sign in again');
        user = s.user;
      } else {
        let sub: string;
        try {
          sub = (await opts.verify(body.token)).sub;
        } catch {
          throw new HttpError(401, 'Sign in again');
        }
        user = await accountHash(sub, opts.pepper);
      }

      switch (body.op) {
        case 'head': {
          const row = await opts.store.get(user);
          if (!row) throw new HttpError(404, 'No backup');
          return reply(200, { version: row.version, updatedAt: row.updatedAt, size: row.blob.length });
        }
        case 'get': {
          const row = await opts.store.get(user);
          if (!row) throw new HttpError(404, 'No backup');
          return reply(200, row);
        }
        case 'put': {
          const { blob, base } = body;
          if (typeof blob !== 'string' || !BLOB_RE.test(blob)) throw new HttpError(400, 'blob must be base64url');
          if (blob.length > maxChars) throw new HttpError(413, 'Backup is too large');
          if (typeof base !== 'number' || !Number.isInteger(base) || base < 0) throw new HttpError(400, 'base must be a version number');
          const current = await opts.store.get(user);
          if (current && now() - Date.parse(current.updatedAt) < minInterval) throw new HttpError(429, 'Too many backups');
          const row = await opts.store.put(user, blob, base);
          if (!row) {
            const latest = await opts.store.get(user);
            throw new HttpError(409, 'Another phone has backed up since', {
              version: latest?.version ?? 0,
              updatedAt: latest?.updatedAt ?? null,
            });
          }
          return reply(200, { version: row.version, updatedAt: row.updatedAt });
        }
        case 'session': {
          const expiresAt = Math.floor(now() / 1000) + sessionSeconds;
          return reply(200, { session: await sessions.issue(user, expiresAt), expiresAt: new Date(expiresAt * 1000).toISOString() });
        }
        case 'delete': {
          await opts.store.delete(user);
          return reply(200, { ok: true });
        }
        default:
          throw new HttpError(400, 'Unknown op');
      }
    } catch (e) {
      if (e instanceof HttpError) return reply(e.status, { error: e.message, ...e.extra });
      return reply(500, { error: 'Something went wrong' });
    }
  };
}

/** In-memory store for tests. */
export function memoryBackupStore(clock: () => number = () => Date.now()): BackupStore & { rows: Map<string, BackupRow> } {
  const rows = new Map<string, BackupRow>();
  return {
    rows,
    async get(user) {
      return rows.get(user) ?? null;
    },
    async put(user, blob, expected) {
      const cur = rows.get(user);
      if ((cur?.version ?? 0) !== expected) return null;
      const row = { blob, version: expected + 1, updatedAt: new Date(clock()).toISOString() };
      rows.set(user, row);
      return row;
    },
    async delete(user) {
      rows.delete(user);
    },
  };
}
