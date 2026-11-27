import { secretFromText, secretToText } from '@kairos/core';
import { requireOptionalNativeModule } from 'expo';

import { secureDelete, secureGet, secureSet } from './secure';

interface TenderKeychain {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

/** iOS only: one keychain item that iCloud Keychain carries to the person's other phones. */
const synced = requireOptionalNativeModule<TenderKeychain>('TenderKeychain');

const LOCAL = 'tender.backup.secret.v1';

/**
 * The backup secret: the one thing that opens the backup. It is looked for in the iCloud Keychain first, so a new phone
 * on the same Apple ID has it already, then in this phone's own keychain. It never goes to the server.
 */
export async function loadBackupSecret(): Promise<Uint8Array | null> {
  for (const read of [() => synced?.get() ?? Promise.resolve(null), () => secureGet(LOCAL)]) {
    try {
      const text = await read();
      if (text) return secretFromText(text);
    } catch {
      /* try the next place */
    }
  }
  return null;
}

/** Writes to both places, so losing the synced copy (iCloud Keychain switched off) does not lose the secret here. */
export async function saveBackupSecret(secret: Uint8Array): Promise<void> {
  const text = secretToText(secret);
  await secureSet(LOCAL, text);
  try {
    await synced?.set(text);
  } catch {
    /* iCloud Keychain unavailable: the local copy and the recovery code remain */
  }
}

export async function forgetBackupSecret(): Promise<void> {
  await secureDelete(LOCAL).catch(() => {});
  await synced?.remove().catch(() => {});
}

/** Whether another phone could get the secret without a recovery code. Best effort: the module cannot see iCloud's setting. */
export const secretCanSync = synced != null;

const SESSION = 'tender.backup.session.v1';

export interface BackupSessionToken {
  token: string;
  expiresAt: string;
}

/**
 * The Tender session for the backup server. Apple's identity tokens last ten minutes and a new one means showing Apple's
 * sign-in sheet, so the app keeps this instead: months long, renewed quietly, in this phone's keychain only.
 */
export async function loadBackupSession(): Promise<BackupSessionToken | null> {
  try {
    const text = await secureGet(SESSION);
    return text ? (JSON.parse(text) as BackupSessionToken) : null;
  } catch {
    return null;
  }
}

export async function saveBackupSession(s: BackupSessionToken): Promise<void> {
  await secureSet(SESSION, JSON.stringify(s)).catch(() => {});
}

export async function forgetBackupSession(): Promise<void> {
  await secureDelete(SESSION).catch(() => {});
}
