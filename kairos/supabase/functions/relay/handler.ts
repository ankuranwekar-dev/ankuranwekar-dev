/**
 * The Kairos relay: a dumb, careful mailbox for ciphertext.
 *
 * It is written against Web-standard Request/Response and SubtleCrypto only,
 * with storage and push injected, so the same code runs in a Supabase Edge
 * Function (Deno), in Node tests, or behind any other runtime.
 *
 * Routes (all POST, JSON):
 *   /mailbox     { pairId, tokenHash }                 her phone opens a mailbox
 *   /send        { pairId, token, from, type, envelope } either phone posts
 *   /fetch       { pairId, token, for, after }          either phone collects
 *   /push-token  { pairId, token, role, pushToken }     register for wake-ups
 *   /close       { pairId, token }                      delete everything
 *
 * What the relay can see: that a mailbox exists, when messages arrive, their
 * size and type. What it cannot see: anything inside them.
 */

export type Role = 'her' | 'him';
export type EnvelopeType = 'join' | 'snapshot' | 'signal' | 'heart' | 'revoke';

export interface StoredEnvelope {
  id: number;
  sender: Role;
  type: EnvelopeType;
  envelope: unknown;
}

export interface RelayStore {
  getTokenHash(pairId: string): Promise<string | null>;
  createMailbox(pairId: string, tokenHash: string): Promise<boolean>;
  touch(pairId: string): Promise<void>;
  insert(pairId: string, sender: Role, type: EnvelopeType, envelope: unknown): Promise<number>;
  listAfter(pairId: string, notFrom: Role, after: number, limit: number): Promise<StoredEnvelope[]>;
  savePushToken(pairId: string, role: Role, token: string): Promise<void>;
  pushTokens(pairId: string, role: Role): Promise<string[]>;
  deleteMailbox(pairId: string): Promise<void>;
}

/** Sends a content-free wake-up. The push service learns only that *something* arrived. */
export type PushSender = (tokens: string[]) => Promise<void>;

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const HASH_RE = /^[A-Za-z0-9_-]{43}$/;
const TYPES: ReadonlySet<string> = new Set(['join', 'snapshot', 'signal', 'heart', 'revoke']);
const MAX_ENVELOPE_BYTES = 64 * 1024;
const PAGE = 100;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toBase64Url(new Uint8Array(digest));
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function str(body: Record<string, unknown>, key: string, re?: RegExp): string {
  const v = body[key];
  if (typeof v !== 'string' || (re && !re.test(v))) throw new HttpError(400, `Invalid ${key}`);
  return v;
}

function role(body: Record<string, unknown>, key: string): Role {
  const v = body[key];
  if (v !== 'her' && v !== 'him') throw new HttpError(400, `Invalid ${key}`);
  return v;
}

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });

export function createRelay(store: RelayStore, push: PushSender = async () => {}) {
  async function authorise(body: Record<string, unknown>): Promise<string> {
    const pairId = str(body, 'pairId', ID_RE);
    const token = str(body, 'token');
    const stored = await store.getTokenHash(pairId);
    // Same response for "no such mailbox" and "wrong token": nothing to probe.
    if (!stored || !safeEqual(stored, await sha256Base64Url(token))) throw new HttpError(404, 'Not found');
    return pairId;
  }

  const routes: Record<string, (body: Record<string, unknown>) => Promise<Response>> = {
    async mailbox(body) {
      const pairId = str(body, 'pairId', ID_RE);
      const tokenHash = str(body, 'tokenHash', HASH_RE);
      const created = await store.createMailbox(pairId, tokenHash);
      if (!created) throw new HttpError(409, 'Mailbox exists');
      return json(201, { ok: true });
    },

    async send(body) {
      const pairId = await authorise(body);
      const from = role(body, 'from');
      const type = str(body, 'type');
      if (!TYPES.has(type)) throw new HttpError(400, 'Invalid type');
      if (type === 'join' && from !== 'him') throw new HttpError(400, 'Only he joins');
      const envelope = body.envelope;
      if (envelope === null || typeof envelope !== 'object') throw new HttpError(400, 'Invalid envelope');
      if (new TextEncoder().encode(JSON.stringify(envelope)).length > MAX_ENVELOPE_BYTES) {
        throw new HttpError(413, 'Envelope too large');
      }
      const id = await store.insert(pairId, from, type as EnvelopeType, envelope);
      await store.touch(pairId);
      const other: Role = from === 'her' ? 'him' : 'her';
      const tokens = await store.pushTokens(pairId, other);
      if (tokens.length) await push(tokens).catch(() => {});
      return json(201, { id });
    },

    async fetch(body) {
      const pairId = await authorise(body);
      const me = role(body, 'for');
      const after = typeof body.after === 'number' && Number.isInteger(body.after) && body.after >= 0 ? body.after : 0;
      const messages = await store.listAfter(pairId, me, after, PAGE);
      await store.touch(pairId);
      return json(200, { messages });
    },

    async 'push-token'(body) {
      const pairId = await authorise(body);
      const r = role(body, 'role');
      const token = str(body, 'pushToken');
      if (token.length > 256) throw new HttpError(400, 'Invalid pushToken');
      await store.savePushToken(pairId, r, token);
      return json(200, { ok: true });
    },

    async close(body) {
      const pairId = await authorise(body);
      await store.deleteMailbox(pairId);
      return json(200, { ok: true });
    },
  };

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, apikey, content-type',
        },
      });
    }
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const route = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
    const fn = routes[route];
    if (!fn) return json(404, { error: 'Not found' });
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }
    try {
      return await fn(body);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      return json(500, { error: 'Internal error' });
    }
  };
}

/** In-memory store for tests and local development. */
export function memoryStore(): RelayStore & { dump(): unknown } {
  const boxes = new Map<string, { tokenHash: string; lastSeen: number }>();
  const envelopes: (StoredEnvelope & { pairId: string })[] = [];
  const tokens = new Map<string, Set<string>>();
  let seq = 0;
  return {
    async getTokenHash(pairId) {
      return boxes.get(pairId)?.tokenHash ?? null;
    },
    async createMailbox(pairId, tokenHash) {
      if (boxes.has(pairId)) return false;
      boxes.set(pairId, { tokenHash, lastSeen: Date.now() });
      return true;
    },
    async touch(pairId) {
      const b = boxes.get(pairId);
      if (b) b.lastSeen = Date.now();
    },
    async insert(pairId, sender, type, envelope) {
      const id = ++seq;
      envelopes.push({ id, pairId, sender, type, envelope });
      return id;
    },
    async listAfter(pairId, notFrom, after, limit) {
      return envelopes
        .filter((e) => e.pairId === pairId && e.sender !== notFrom && e.id > after)
        .slice(0, limit)
        .map(({ id, sender, type, envelope }) => ({ id, sender, type, envelope }));
    },
    async savePushToken(pairId, r, token) {
      const k = `${pairId}|${r}`;
      tokens.set(k, (tokens.get(k) ?? new Set()).add(token));
    },
    async pushTokens(pairId, r) {
      return [...(tokens.get(`${pairId}|${r}`) ?? [])];
    },
    async deleteMailbox(pairId) {
      boxes.delete(pairId);
      for (let i = envelopes.length - 1; i >= 0; i--) if (envelopes[i]!.pairId === pairId) envelopes.splice(i, 1);
      for (const k of [...tokens.keys()]) if (k.startsWith(`${pairId}|`)) tokens.delete(k);
    },
    dump() {
      return { boxes: [...boxes.entries()], envelopes, tokens: [...tokens.entries()] };
    },
  };
}
