import {
  BackupError,
  ConflictError,
  createBackupSession,
  type RemoteApi,
  type Settled as CoreSettled,
} from '@kairos/core';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { appleCredentialState, freshAppleToken, onAppleRevoked, signInWithApple } from '@/platform/apple';
import {
  BackupHttpError,
  backupConfigured,
  remoteDelete,
  remoteGet,
  remoteHead,
  remotePut,
  remoteSession,
} from '@/platform/backup-api';
import {
  forgetBackupSecret,
  forgetBackupSession,
  loadBackupSecret,
  loadBackupSession,
  saveBackupSecret,
  saveBackupSession,
} from '@/platform/backup-key';

import {
  fingerprint,
  hasLocalData,
  pickBackup,
  sameData,
  summarise,
  type BackupData,
  type Summary,
} from './backup-data';
import { useStore } from './store';

/**
 * Sign in with Apple, and the sealed backup that goes with it.
 *
 * Signing in is always optional. The decisions (who has the secret, what to do when both the phone and the account hold
 * data, what happens when another phone got there first) live in @kairos/core, where they are tested against the real
 * server code; this file connects them to Apple, the keychain, the store and the network.
 */

export type Settled =
  /** Signed in and backing up. `restored` when this phone took the backup's data. */
  | { kind: 'ready'; restored: boolean; firstTime: boolean }
  /** A backup exists and so does data on this phone, and they differ: the person chooses. */
  | { kind: 'choose'; remote: Summary; local: Summary }
  /** A backup exists but this phone has no secret that opens it. */
  | { kind: 'need-code' };

export class AccountError extends Error {
  constructor(
    readonly reason: 'offline' | 'sign-in' | 'conflict' | 'no-secret' | 'server',
    message: string,
  ) {
    super(message);
  }
}

const nowIso = () => new Date().toISOString();
const state = () => useStore.getState();

const DAY = 86_400_000;

/**
 * Whether getting a token may show Apple's sign-in sheet. Only for something the person just tapped; automatic backups
 * run with this off, so the app never interrupts anyone with Apple's sheet on its own.
 */
let mayAskApple = true;

/** Runs a job that must never show Apple's sign-in sheet. */
export async function quietly<T>(job: () => Promise<T>): Promise<T> {
  const before = mayAskApple;
  mayAskApple = false;
  try {
    return await job();
  } finally {
    mayAskApple = before;
  }
}

/** Trade a token (Apple's, or a session about to lapse) for a fresh session and keep it. */
async function startSession(token: string): Promise<string | null> {
  try {
    const s = await remoteSession(token);
    await saveBackupSession({ token: s.session, expiresAt: s.expiresAt });
    return s.session;
  } catch {
    return null;
  }
}

/**
 * A token for the backup server. Normally the stored Tender session (renewed quietly when it has under a month left).
 * Only when there is none, and only for something the person just tapped, does this ask Apple, which shows its sheet.
 */
async function freshToken(): Promise<string> {
  const user = state().account?.user;
  if (!user) throw new AccountError('sign-in', 'Not signed in');

  const stored = await loadBackupSession();
  const left = stored ? Date.parse(stored.expiresAt) - Date.now() : 0;
  if (stored && left > DAY) {
    if (left < 30 * DAY) return (await startSession(stored.token)) ?? stored.token;
    return stored.token;
  }
  if (!mayAskApple) {
    state().patchAccount({ needsSignIn: true });
    throw new AccountError('sign-in', 'Sign in with Apple again');
  }
  let apple: string;
  try {
    apple = await freshAppleToken(user);
  } catch {
    throw new AccountError('sign-in', 'Sign in with Apple again');
  }
  state().patchAccount({ needsSignIn: false });
  return (await startSession(apple)) ?? apple;
}

/** Network and server failures, as the few things a person can act on. BackupErrors pass through for the code screen. */
function asAccountError(e: unknown): Error {
  if (e instanceof AccountError || e instanceof BackupError) return e;
  if (e instanceof ConflictError) return new AccountError('conflict', 'Another phone has backed up since');
  if (e instanceof BackupHttpError) {
    if (e.status === 0) return new AccountError('offline', 'No connection');
    if (e.status === 401) return new AccountError('sign-in', 'Sign in with Apple again');
    return new AccountError('server', e.message);
  }
  return new AccountError('server', e instanceof Error ? e.message : 'Something went wrong');
}

const api: RemoteApi = {
  head: remoteHead,
  get: remoteGet,
  async put(token, blob, base) {
    try {
      return await remotePut(token, blob, base);
    } catch (e) {
      if (e instanceof BackupHttpError && e.status === 409) throw new ConflictError();
      throw e;
    }
  },
  async delete(token) {
    await remoteDelete(token);
  },
};

const session = createBackupSession<BackupData>({
  api,
  keys: { load: loadBackupSecret, save: saveBackupSecret, forget: forgetBackupSecret },
  freshToken,
  same: sameData,
  local: {
    read: () => pickBackup(state()),
    hasData: () => hasLocalData(state()),
    apply: (data) => state().restore(data),
    baseVersion: () => state().account?.version,
    note: ({ version, lastBackupAt, conflict }) =>
      state().patchAccount({
        ...(conflict
          ? {}
          : { version, backedUp: fingerprint(pickBackup(state())), ...(lastBackupAt ? { lastBackupAt } : {}) }),
        conflict,
      }),
  },
});

/** The core's answer, with the two sides' facts worked out for the "which one?" question. */
function present(r: CoreSettled<BackupData>): Settled {
  if (r.kind !== 'choose') return r;
  return {
    kind: 'choose',
    remote: summarise(r.remote.data, r.remote.savedAt),
    local: summarise(pickBackup(state()), null),
  };
}

async function guarded<T>(job: () => Promise<T>): Promise<T> {
  try {
    return await job();
  } catch (e) {
    throw asAccountError(e);
  }
}

/** The Sign in with Apple button. */
export async function signIn(): Promise<Settled> {
  if (!backupConfigured) throw new AccountError('server', 'Backup is not set up in this build');
  const cred = await signInWithApple();
  // Signed in with Apple even if the backup cannot be reached right now: "Back up now" can try again.
  await forgetBackupSession(); // never let an older session (perhaps another Apple ID's) stand in for this one
  state().setAccount({ user: cred.user, since: nowIso() });
  // One Apple token, traded at once for a session: from here on nothing shows Apple's sheet again.
  const token = (await startSession(cred.token)) ?? cred.token;
  return guarded(async () => present(await session.settle(token)));
}

/** The person chose the backup over what is on this phone. */
export const chooseBackup = () => session.chooseBackup();

/** The person chose this phone's data over the backup: it replaces the backup. */
export const keepThisPhone = () => guarded(session.keepThisPhone);

/** The recovery code, typed in on a phone that does not have the secret. Throws a BackupError if it is wrong. */
export const enterRecoveryCode = (code: string) => guarded(async () => present(await session.enterCode(code)));

/** Back up now. A conflict marks the account so automatic backups wait for the person's choice. */
export async function backupNow(): Promise<void> {
  if (!state().account) throw new AccountError('sign-in', 'Not signed in');
  return guarded(session.backupNow);
}

/** Look again at what the account holds, e.g. after "another phone has backed up since". */
export const review = () => guarded(async () => present(await session.review()));

/** The recovery code to write down. */
export const currentRecoveryCode = () => session.recoveryCode();

/** Sign out on this phone. The backup stays where it is, ready for the next sign-in. */
export function signOut(): void {
  state().setAccount(undefined);
  session.forgetPending();
  forgetBackupSession().catch(() => {});
}

/**
 * Delete the account's backup from the server for good, then sign out here and forget the secret. The data on this
 * phone stays; "Start over" is the way to erase that.
 */
export async function deleteAccount(): Promise<void> {
  await guarded(session.deleteBackup);
  signOut();
}

/** Ask Apple whether the person has revoked Tender; if so, sign out here. Called when the app opens. */
export async function checkAppleStandsGood(): Promise<void> {
  const account = state().account;
  if (!account) return;
  const s = await appleCredentialState(account.user);
  if (s === 'revoked' || s === 'not-found') signOut();
}

/** Does the backup lack something this phone has? True after a change the app was closed before it could save. */
function backupIsDue(): boolean {
  const s = state();
  return Boolean(s.account) && hasLocalData(s) && fingerprint(pickBackup(s)) !== s.account?.backedUp;
}

/**
 * Before Start over: make sure the account holds what this phone holds, so Start over never loses anything. False when
 * that could not be done (no connection, signed out of Apple, another phone ahead); the person decides what then.
 */
export async function saveBeforeErasing(): Promise<boolean> {
  const s = state();
  if (!s.account || !backupConfigured || !hasLocalData(s)) return true;
  if (!backupIsDue()) return true;
  try {
    await quietly(backupNow);
    return true;
  } catch {
    return false;
  }
}

/**
 * Backs up quietly while signed in: soon after the app opens if the backup is behind, a little after the data changes,
 * straight away when the app is left, and not at all after a conflict (the person chooses first) or without a
 * connection (the next change, or the next time the app opens, tries again).
 */
export function useAutoBackup(ready: boolean): void {
  const signedIn = useStore((s) => Boolean(s.account) && !s.account?.conflict);
  useEffect(() => {
    if (!ready || !backupConfigured) return;
    checkAppleStandsGood().catch(() => {});
    return onAppleRevoked(signOut);
  }, [ready]);

  useEffect(() => {
    if (!ready || !signedIn || !backupConfigured) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      timer = undefined;
      if (backupIsDue()) quietly(backupNow).catch(() => {});
    };
    const later = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    if (backupIsDue()) later(3_000);

    let last = JSON.stringify(pickBackup(state()));
    const unsub = useStore.subscribe((s) => {
      const now = JSON.stringify(pickBackup(s));
      if (now === last) return;
      last = now;
      later(20_000);
    });
    const app = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && timer) {
        clearTimeout(timer);
        run();
      }
    });
    return () => {
      clearTimeout(timer);
      unsub();
      app.remove();
    };
  }, [ready, signedIn]);
}
