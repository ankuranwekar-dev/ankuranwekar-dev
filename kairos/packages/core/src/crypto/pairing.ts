/**
 * Pairing and end-to-end encryption.
 *
 * Threat model in one line: the relay server is untrusted. It stores and
 * forwards ciphertext and never holds a key that could read her cycle.
 *
 * Flow
 *  1. Her phone makes an X25519 key pair and a 32-byte invite secret. The
 *     invite travels out of band — a QR code he scans, or a link she sends —
 *     with the secret in the URL fragment, which browsers never send to servers.
 *  2. His phone makes its own key pair and posts a join request to the relay
 *     mailbox derived from the secret. The request carries his public key and
 *     an HMAC keyed by the secret, so the relay cannot swap in its own key.
 *  3. Both phones run X25519 + HKDF-SHA256 (salted with the invite secret) and
 *     get two directional XChaCha20-Poly1305 keys.
 *  4. Both show the same four-emoji safety code. Matching codes prove no one
 *     sat in the middle.
 *
 * v1 limitations, stated plainly: keys are static for the life of a pairing
 * (no forward secrecy; re-pairing rotates them), and metadata — that two
 * devices talk, when, and how much — is visible to the relay.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, equalBytes, fromBase64Url, fromUtf8, toBase64Url, utf8 } from './encoding';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const { secretKey, publicKey } = x25519.keygen();
  return { secretKey, publicKey };
}

export interface Invite {
  v: 1;
  herPublicKey: Uint8Array;
  secret: Uint8Array;
}

export function createInvite(her: KeyPair): Invite {
  return { v: 1, herPublicKey: her.publicKey, secret: randomBytes(32) };
}

const INVITE_PREFIX = 'k1';

/** `https://kairos.love/pair#k1.<herPublicKey>.<secret>` — the fragment never reaches a server. */
export function encodeInvite(invite: Invite, base = 'https://kairos.love/pair'): string {
  return `${base}#${INVITE_PREFIX}.${toBase64Url(invite.herPublicKey)}.${toBase64Url(invite.secret)}`;
}

export function decodeInvite(link: string): Invite {
  const fragment = link.includes('#') ? link.slice(link.indexOf('#') + 1) : link;
  const [prefix, pub, secret] = fragment.split('.');
  if (prefix !== INVITE_PREFIX || !pub || !secret) throw new Error('Not a Kairos invite');
  const herPublicKey = fromBase64Url(pub);
  const s = fromBase64Url(secret);
  if (herPublicKey.length !== 32 || s.length !== 32) throw new Error('Malformed Kairos invite');
  return { v: 1, herPublicKey, secret: s };
}

const label = (s: string) => utf8(`kairos/v1/${s}`);

/** Relay mailbox id. Derived from the secret; reveals nothing about it. */
export function pairingId(invite: Invite): string {
  return toBase64Url(hkdf(sha256, invite.secret, undefined, label('pairing-id'), 16));
}

/**
 * Bearer token for the relay mailbox. Both phones derive it from the invite
 * secret; the relay stores only its SHA-256, so a database leak cannot be
 * replayed against the mailbox, and the token itself reveals nothing about
 * the encryption keys (independent HKDF label).
 */
export function mailboxToken(invite: Invite): string {
  return toBase64Url(hkdf(sha256, invite.secret, undefined, label('mailbox-token'), 32));
}

export function tokenHash(token: string): string {
  return toBase64Url(sha256(utf8(token)));
}

export interface JoinRequest {
  v: 1;
  partnerPublicKey: string;
  mac: string;
}

function joinMacKey(invite: Invite): Uint8Array {
  return hkdf(sha256, invite.secret, undefined, label('join-mac'), 32);
}

export function createJoinRequest(him: KeyPair, invite: Invite): JoinRequest {
  const mac = hmac(sha256, joinMacKey(invite), concat(invite.herPublicKey, him.publicKey));
  return { v: 1, partnerPublicKey: toBase64Url(him.publicKey), mac: toBase64Url(mac) };
}

/** Her side: returns his public key if the request was made by someone holding the invite. */
export function verifyJoinRequest(req: JoinRequest, invite: Invite): Uint8Array {
  const hisPublicKey = fromBase64Url(req.partnerPublicKey);
  if (hisPublicKey.length !== 32) throw new Error('Malformed join request');
  const expected = hmac(sha256, joinMacKey(invite), concat(invite.herPublicKey, hisPublicKey));
  if (!equalBytes(expected, fromBase64Url(req.mac))) throw new Error('Join request failed verification');
  return hisPublicKey;
}

export interface SessionKeys {
  pairId: string;
  /** Key for messages this device sends. */
  send: Uint8Array;
  /** Key for messages this device receives. */
  receive: Uint8Array;
  herPublicKey: Uint8Array;
  hisPublicKey: Uint8Array;
}

export function deriveSession(
  role: 'her' | 'him',
  mine: KeyPair,
  theirPublicKey: Uint8Array,
  invite: Invite,
): SessionKeys {
  const herPublicKey = role === 'her' ? mine.publicKey : theirPublicKey;
  const hisPublicKey = role === 'her' ? theirPublicKey : mine.publicKey;
  if (role === 'him' && !equalBytes(herPublicKey, invite.herPublicKey)) {
    throw new Error('Invite does not match her key');
  }
  const shared = x25519.getSharedSecret(mine.secretKey, theirPublicKey);
  const okm = hkdf(sha256, shared, invite.secret, concat(label('session'), herPublicKey, hisPublicKey), 64);
  const herToHim = okm.slice(0, 32);
  const himToHer = okm.slice(32, 64);
  return {
    pairId: pairingId(invite),
    send: role === 'her' ? herToHim : himToHer,
    receive: role === 'her' ? himToHer : herToHim,
    herPublicKey,
    hisPublicKey,
  };
}

// 64 friendly, visually distinct emoji: 6 bits each, 4 of them = 24 bits.
const SAFETY_EMOJI = [
  '🌸',
  '🌙',
  '☀️',
  '🌊',
  '🍑',
  '🍋',
  '🍒',
  '🥥',
  '🌵',
  '🍄',
  '🌻',
  '🌹',
  '🍀',
  '🌈',
  '⭐️',
  '🔥',
  '❄️',
  '🐚',
  '🦋',
  '🐝',
  '🐢',
  '🦊',
  '🐼',
  '🐧',
  '🦉',
  '🐬',
  '🦄',
  '🐙',
  '🐞',
  '🦜',
  '🐳',
  '🦩',
  '🎈',
  '🎁',
  '🎵',
  '🎨',
  '📚',
  '🔑',
  '🕯️',
  '⚓️',
  '🚲',
  '⛵️',
  '✈️',
  '🏔️',
  '🏝️',
  '🗝️',
  '💎',
  '🧭',
  '🍯',
  '🥐',
  '🧁',
  '🍫',
  '🍉',
  '🍇',
  '🥑',
  '🌶️',
  '☕️',
  '🍵',
  '🧩',
  '🪁',
  '🪐',
  '🧸',
  '🎻',
  '🌿',
] as const;

/** Four emoji both phones display after pairing. If they match, nobody is in the middle. */
export function safetyCode(herPublicKey: Uint8Array, hisPublicKey: Uint8Array): string[] {
  const h = sha256(concat(label('safety'), herPublicKey, hisPublicKey));
  const n = (h[0]! << 16) | (h[1]! << 8) | h[2]!;
  return [18, 12, 6, 0].map((shift) => SAFETY_EMOJI[(n >> shift) & 63]!);
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export type MessageType = 'snapshot' | 'signal' | 'heart' | 'revoke';

export interface Envelope {
  v: 1;
  type: MessageType;
  /** Monotonic per sender and type; receivers drop anything not newer than the last seen. */
  seq: number;
  nonce: string;
  body: string;
}

function aad(pairId: string, type: MessageType, seq: number): Uint8Array {
  return utf8(`kairos/v1|${pairId}|${type}|${seq}`);
}

export function seal(keys: SessionKeys, type: MessageType, seq: number, payload: unknown): Envelope {
  const nonce = randomBytes(24);
  const body = xchacha20poly1305(keys.send, nonce, aad(keys.pairId, type, seq)).encrypt(utf8(JSON.stringify(payload)));
  return { v: 1, type, seq, nonce: toBase64Url(nonce), body: toBase64Url(body) };
}

/** Throws if the envelope was tampered with, replayed into another pair, or relabelled. */
export function open<T = unknown>(keys: SessionKeys, env: Envelope): T {
  if (env.v !== 1) throw new Error('Unsupported envelope version');
  const plain = xchacha20poly1305(keys.receive, fromBase64Url(env.nonce), aad(keys.pairId, env.type, env.seq)).decrypt(
    fromBase64Url(env.body),
  );
  return JSON.parse(fromUtf8(plain)) as T;
}
