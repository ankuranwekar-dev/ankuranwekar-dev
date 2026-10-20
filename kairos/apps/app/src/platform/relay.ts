import {
  createInvite,
  createJoinRequest,
  decodeInvite,
  deriveSession,
  encodeInvite,
  fromBase64Url,
  generateKeyPair,
  mailboxToken,
  open,
  pairingId,
  safetyCode,
  seal,
  toBase64Url,
  tokenHash,
  verifyJoinRequest,
  type Envelope,
  type Invite,
  type JoinRequest,
  type KeyPair,
  type MessageType,
  type SessionKeys,
} from '@kairos/core';

import { secureDelete, secureGet, secureSet } from './secure';

/**
 * Client for the ciphertext-only relay (supabase/functions/relay).
 *
 * The relay is a mailbox: it stores envelopes it cannot read and hands them
 * to whoever presents the mailbox token. Configure it with
 * EXPO_PUBLIC_RELAY_URL and EXPO_PUBLIC_RELAY_ANON_KEY; without them the app
 * runs in demo mode only.
 */

const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL;
const RELAY_KEY = process.env.EXPO_PUBLIC_RELAY_ANON_KEY;

export const relayConfigured = Boolean(RELAY_URL && RELAY_KEY);

type Role = 'her' | 'him';

interface StoredPairing {
  role: Role;
  invite: string;
  me: { pk: string; sk: string };
  partnerPk?: string;
  /** Last message id received, and next sequence number per type we send. */
  cursor: number;
  seq: Partial<Record<MessageType, number>>;
  /** Highest sequence number accepted per type: anything not newer is a replay. */
  seen?: Partial<Record<MessageType, number>>;
}

const KEY = 'kairos.pairing.v1';

async function load(): Promise<StoredPairing | null> {
  const raw = await secureGet(KEY);
  return raw ? (JSON.parse(raw) as StoredPairing) : null;
}
async function save(p: StoredPairing): Promise<void> {
  await secureSet(KEY, JSON.stringify(p));
}

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!relayConfigured) throw new Error('Relay not configured');
  const res = await fetch(`${RELAY_URL}/functions/v1/relay/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: RELAY_KEY!, authorization: `Bearer ${RELAY_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Relay ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

const keyPairOf = (p: StoredPairing): KeyPair => ({ publicKey: fromBase64Url(p.me.pk), secretKey: fromBase64Url(p.me.sk) });

function session(p: StoredPairing): SessionKeys | null {
  if (!p.partnerPk) return null;
  return deriveSession(p.role, keyPairOf(p), fromBase64Url(p.partnerPk), decodeInvite(p.invite));
}

function mailbox(invite: Invite) {
  return { pairId: pairingId(invite), token: mailboxToken(invite) };
}

/** Her phone: create keys + invite and open a mailbox. Returns the link to show as a QR code. */
export async function startInvite(): Promise<{ link: string; pairId: string }> {
  const kp = generateKeyPair();
  const invite = createInvite(kp);
  const link = encodeInvite(invite);
  const { pairId, token } = mailbox(invite);
  await call('mailbox', { pairId, tokenHash: tokenHash(token) });
  await save({ role: 'her', invite: link, me: { pk: toBase64Url(kp.publicKey), sk: toBase64Url(kp.secretKey) }, cursor: 0, seq: {} });
  return { link, pairId };
}

interface Incoming {
  id: number;
  type: MessageType | 'join';
  envelope: Envelope | JoinRequest;
}

/** Her phone: poll for his join request; returns the safety code once paired. */
export async function checkForJoin(): Promise<string[] | null> {
  const p = await load();
  if (!p || p.role !== 'her' || p.partnerPk) return null;
  const invite = decodeInvite(p.invite);
  const { pairId, token } = mailbox(invite);
  const { messages } = await call<{ messages: Incoming[] }>('fetch', { pairId, token, for: 'her', after: p.cursor });
  for (const m of messages) {
    p.cursor = Math.max(p.cursor, m.id);
    if (m.type !== 'join') continue;
    try {
      const hisPk = verifyJoinRequest(m.envelope as JoinRequest, invite);
      p.partnerPk = toBase64Url(hisPk);
      await save(p);
      return safetyCode(invite.herPublicKey, hisPk);
    } catch {
      // A forged join; ignore it and keep waiting.
    }
  }
  await save(p);
  return null;
}

/** His phone: join from a scanned or opened invite link. */
export async function joinInvite(link: string): Promise<{ pairId: string; safety: string[] }> {
  const invite = decodeInvite(link);
  const kp = generateKeyPair();
  const { pairId, token } = mailbox(invite);
  await call('send', { pairId, token, from: 'him', type: 'join', envelope: createJoinRequest(kp, invite) });
  await save({
    role: 'him',
    invite: link,
    me: { pk: toBase64Url(kp.publicKey), sk: toBase64Url(kp.secretKey) },
    partnerPk: toBase64Url(invite.herPublicKey),
    cursor: 0,
    seq: {},
  });
  return { pairId, safety: safetyCode(invite.herPublicKey, kp.publicKey) };
}

export async function send(type: MessageType, payload: unknown): Promise<void> {
  const p = await load();
  if (!p) return;
  const keys = session(p);
  if (!keys) return;
  const seq = (p.seq[type] ?? 0) + 1;
  const { pairId, token } = mailbox(decodeInvite(p.invite));
  await call('send', { pairId, token, from: p.role, type, envelope: seal(keys, type, seq, payload) });
  p.seq[type] = seq;
  await save(p);
}

/** Fetch and decrypt everything new from the partner. Tampered or replayed envelopes are dropped. */
export async function receive(): Promise<{ type: MessageType; payload: unknown }[]> {
  const p = await load();
  if (!p) return [];
  const keys = session(p);
  if (!keys) return [];
  const { pairId, token } = mailbox(decodeInvite(p.invite));
  const { messages } = await call<{ messages: Incoming[] }>('fetch', { pairId, token, for: p.role, after: p.cursor });
  const out: { type: MessageType; payload: unknown }[] = [];
  const seen = (p.seen ??= {});
  for (const m of messages) {
    p.cursor = Math.max(p.cursor, m.id);
    if (m.type === 'join') continue;
    const env = m.envelope as Envelope;
    if ((seen[env.type] ?? 0) >= env.seq) continue;
    try {
      out.push({ type: env.type, payload: open(keys, env) });
      seen[env.type] = env.seq;
    } catch {
      /* not for us, or tampered */
    }
  }
  await save(p);
  return out;
}

/** Either phone: close the mailbox (deleting every envelope) and forget the keys. */
export async function unpair(): Promise<void> {
  const p = await load();
  if (p) {
    const { pairId, token } = mailbox(decodeInvite(p.invite));
    try {
      await call('close', { pairId, token });
    } catch {
      /* offline: the relay's 30-day expiry will clean up */
    }
  }
  await secureDelete(KEY);
}
