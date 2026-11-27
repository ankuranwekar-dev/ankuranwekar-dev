/**
 * Encrypted backup.
 *
 * A signed-in person's data is sealed on the phone before it goes anywhere, with a key the server never has.
 * The server holds one opaque blob per account and can say only how big it is and when it changed.
 *
 * The secret
 *  - 20 random bytes (160 bits), made once on the phone that turns backup on.
 *  - Kept in the iCloud Keychain, so another phone on the same Apple ID has it without anyone typing anything,
 *    and also shown as a *recovery code* a person can write down, for the day iCloud Keychain is off.
 *  - The encryption key is HKDF-SHA256 of the secret, so the secret itself is never used as a key.
 *
 * The blob
 *  - format byte (1) | 24-byte nonce | XChaCha20-Poly1305 ciphertext of the JSON, base64url.
 *  - The context string is authenticated, so a blob cannot be passed off as anything else.
 *
 * Wrong key and tampering both fail authentication, and they look the same from the outside by design.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, fromBase64Url, fromUtf8, toBase64Url, utf8 } from './encoding';

export const BACKUP_FORMAT = 1;
export const SECRET_BYTES = 20;

const CONTEXT = utf8('tender/backup/v1');
const KEY_LABEL = utf8('tender/backup/v1/key');
const CHECK_LABEL = utf8('tender/backup/v1/recovery-check');

export type BackupFailure = 'wrong-key' | 'corrupt' | 'newer';

export class BackupError extends Error {
  constructor(
    readonly reason: BackupFailure,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

/** The one thing to protect. Never leaves the phone except as the recovery code a person writes down. */
export function newBackupSecret(): Uint8Array {
  return randomBytes(SECRET_BYTES);
}

function keyFrom(secret: Uint8Array): Uint8Array {
  if (secret.length !== SECRET_BYTES) throw new BackupError('wrong-key', 'Backup secret has the wrong length');
  return hkdf(sha256, secret, undefined, KEY_LABEL, 32);
}

export interface BackupPayload<T> {
  v: number;
  savedAt: string;
  data: T;
}

/** Seal `data` into the blob the server stores. */
export function sealBackup<T>(secret: Uint8Array, data: T, savedAt = new Date().toISOString()): string {
  const nonce = randomBytes(24);
  const plain = utf8(JSON.stringify({ v: BACKUP_FORMAT, savedAt, data } satisfies BackupPayload<T>));
  const sealed = xchacha20poly1305(keyFrom(secret), nonce, CONTEXT).encrypt(plain);
  return toBase64Url(concat(Uint8Array.of(BACKUP_FORMAT), nonce, sealed));
}

/** Open a blob with the secret. Throws a BackupError that says whether to ask for another code or give up. */
export function openBackup<T>(secret: Uint8Array, blob: string): BackupPayload<T> {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(blob);
  } catch {
    throw new BackupError('corrupt', 'The backup is damaged');
  }
  if (bytes.length < 1 + 24 + 16 + 2) throw new BackupError('corrupt', 'The backup is damaged');
  const format = bytes[0]!;
  if (format > BACKUP_FORMAT) throw new BackupError('newer', 'This backup was made by a newer version of Tender');
  if (format !== BACKUP_FORMAT) throw new BackupError('corrupt', 'The backup is damaged');
  let plain: Uint8Array;
  try {
    plain = xchacha20poly1305(keyFrom(secret), bytes.subarray(1, 25), CONTEXT).decrypt(bytes.subarray(25));
  } catch {
    throw new BackupError('wrong-key', 'That recovery code does not open this backup');
  }
  let payload: BackupPayload<T>;
  try {
    payload = JSON.parse(fromUtf8(plain)) as BackupPayload<T>;
  } catch {
    throw new BackupError('corrupt', 'The backup is damaged');
  }
  if (typeof payload?.savedAt !== 'string' || payload.data === undefined) {
    throw new BackupError('corrupt', 'The backup is damaged');
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Recovery code: the secret as something a person can write down and type back.
// ---------------------------------------------------------------------------

/** Crockford base32: no I, L, O or U, so nothing is mistaken for anything else. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31]!;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31]!;
  return out;
}

function unbase32(s: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new BackupError('wrong-key', 'That is not a recovery code');
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (o < length) out[o++] = (buffer >> bits) & 255;
      buffer &= (1 << bits) - 1;
    }
  }
  return out;
}

const check = (secret: Uint8Array): string => base32(sha256(concat(CHECK_LABEL, secret)).subarray(0, 3)).slice(0, 4);

/** `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-CCCC`: eight groups of the secret and a group that catches typos. */
export function toRecoveryCode(secret: Uint8Array): string {
  if (secret.length !== SECRET_BYTES) throw new BackupError('wrong-key', 'Backup secret has the wrong length');
  const text = base32(secret) + check(secret);
  return text.match(/.{4}/g)!.join('-');
}

/** Forgiving about case, spaces, dashes and look-alikes (O for 0, I and L for 1). Throws if the checksum fails. */
export function fromRecoveryCode(code: string): Uint8Array {
  const clean = code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length !== 36) throw new BackupError('wrong-key', 'A recovery code has 36 letters and numbers');
  const secret = unbase32(clean.slice(0, 32), SECRET_BYTES);
  if (check(secret) !== clean.slice(32)) throw new BackupError('wrong-key', 'That code has a typo in it');
  return secret;
}

/** The secret as text for the keychain. */
export const secretToText = (secret: Uint8Array): string => toBase64Url(secret);
export const secretFromText = (text: string): Uint8Array => {
  const secret = fromBase64Url(text);
  if (secret.length !== SECRET_BYTES) throw new BackupError('wrong-key', 'Stored backup secret is damaged');
  return secret;
};
