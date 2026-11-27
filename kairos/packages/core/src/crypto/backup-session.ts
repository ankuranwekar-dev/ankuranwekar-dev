/**
 * The decisions around a backup, with nothing platform-specific in them: who has the secret, what to do when both the
 * phone and the account hold data, what happens when another phone got there first.
 *
 * The app supplies four things (the server, the secret's storage, the phone's data, and a fresh Apple token) and gets back
 * a handful of operations. Keeping this here, rather than in a screen, is what lets every path be tested against the real
 * server handler.
 */

import {
  BackupError,
  fromRecoveryCode,
  newBackupSecret,
  openBackup,
  sealBackup,
  toRecoveryCode,
} from './backup';

export interface RemoteInfo {
  version: number;
  updatedAt: string;
  size: number;
}
export interface RemoteBackup {
  blob: string;
  version: number;
  updatedAt: string;
}

/** The server says another phone has backed up since the version we built on. */
export class ConflictError extends Error {}

export interface RemoteApi {
  head(token: string): Promise<RemoteInfo | null>;
  get(token: string): Promise<RemoteBackup>;
  /** Throws ConflictError when `base` is not the current version. */
  put(token: string, blob: string, base: number): Promise<{ version: number; updatedAt: string }>;
  delete(token: string): Promise<void>;
}

export interface SecretStore {
  load(): Promise<Uint8Array | null>;
  save(secret: Uint8Array): Promise<void>;
  forget(): Promise<void>;
}

export interface LocalData<D> {
  /** What a backup would carry, right now. */
  read(): D;
  /** Is there anything on this phone worth losing? */
  hasData(): boolean;
  /** Take a backup's data as this phone's own. */
  apply(data: D): void;
  /** The server version this phone last wrote or restored, if signed in. */
  baseVersion(): number | undefined;
  note(info: { version: number; lastBackupAt: string; conflict: boolean }): void;
}

export type Settled<D> =
  /** Signed in and backing up. `restored`: this phone took the account's data. `firstTime`: the account is new. */
  | { kind: 'ready'; restored: boolean; firstTime: boolean }
  /** The account and this phone both hold data, and it differs: the person chooses. */
  | { kind: 'choose'; remote: { data: D; savedAt: string } }
  /** A backup exists but this phone has no secret that opens it. */
  | { kind: 'need-code' };

export interface SessionDeps<D> {
  api: RemoteApi;
  keys: SecretStore;
  local: LocalData<D>;
  /** A valid Apple identity token for the signed-in person. May throw if they need to sign in again. */
  freshToken(): Promise<string>;
  same?(a: D, b: D): boolean;
}

export function createBackupSession<D>(deps: SessionDeps<D>) {
  const { api, keys, local } = deps;
  const same = deps.same ?? ((a: D, b: D) => JSON.stringify(a) === JSON.stringify(b));

  /** Held between "a backup was found" and "the person chose". */
  let pending: { data: D; savedAt: string; version: number } | undefined;

  /**
   * Replace the account's backup with this phone's data. An empty phone never does: a phone that was just reset (or one
   * that is still signed in after a reset) must not wipe the one copy that can bring everything back.
   */
  async function upload(token: string, secret: Uint8Array, base: number): Promise<boolean> {
    if (!local.hasData()) return false;
    const r = await api.put(token, sealBackup(secret, local.read()), base);
    local.note({ version: r.version, lastBackupAt: r.updatedAt, conflict: false });
    return true;
  }

  function take(data: D, version: number, updatedAt: string) {
    local.apply(data);
    local.note({ version, lastBackupAt: updatedAt, conflict: false });
    pending = undefined;
  }

  /** After signing in, or once a recovery code arrives: look at what the account holds and decide what happens next. */
  async function settle(token: string, secret: Uint8Array | null): Promise<Settled<D>> {
    const head = await api.head(token);
    if (!head) {
      // A new account: make the secret, and back up whatever this phone has.
      const made = secret ?? newBackupSecret();
      if (!secret) await keys.save(made);
      if (local.hasData()) await upload(token, made, 0);
      return { kind: 'ready', restored: false, firstTime: true };
    }
    if (!secret) return { kind: 'need-code' };

    const remote = await api.get(token);
    let opened;
    try {
      opened = openBackup<D>(secret, remote.blob);
    } catch (e) {
      if (e instanceof BackupError && e.reason === 'wrong-key') return { kind: 'need-code' };
      throw e;
    }
    pending = { data: opened.data, savedAt: opened.savedAt, version: remote.version };

    if (!local.hasData()) {
      take(opened.data, remote.version, remote.updatedAt);
      return { kind: 'ready', restored: true, firstTime: false };
    }
    if (same(local.read(), opened.data)) {
      local.note({ version: remote.version, lastBackupAt: remote.updatedAt, conflict: false });
      pending = undefined;
      return { kind: 'ready', restored: false, firstTime: false };
    }
    return { kind: 'choose', remote: { data: opened.data, savedAt: opened.savedAt } };
  }

  return {
    /** Right after Apple has said who this is. */
    settle: async (token: string) => settle(token, await keys.load()),

    /** The person chose the account's backup over this phone's data. */
    chooseBackup(): void {
      if (!pending) throw new BackupError('corrupt', 'There is no backup to use');
      take(pending.data, pending.version, pending.savedAt);
    },

    /** The person chose this phone's data: it replaces the backup. */
    async keepThisPhone(): Promise<void> {
      const secret = await keys.load();
      if (!secret || !pending) throw new BackupError('wrong-key', 'This phone has no backup secret');
      await upload(await deps.freshToken(), secret, pending.version);
      pending = undefined;
    },

    /** A recovery code, typed in on a phone without the secret. Throws a BackupError if it does not open the backup. */
    async enterCode(code: string): Promise<Settled<D>> {
      const secret = fromRecoveryCode(code);
      const token = await deps.freshToken();
      const remote = await api.get(token);
      openBackup(secret, remote.blob); // proves the code opens this backup before it is kept
      await keys.save(secret);
      return settle(token, secret);
    },

    /** Back up now, building on the version this phone last saw. Throws ConflictError if another phone got there first. */
    async backupNow(): Promise<void> {
      const secret = await keys.load();
      if (!secret) throw new BackupError('wrong-key', 'This phone has no backup secret');
      if (!local.hasData()) return; // nothing to save, and an empty phone must never replace a backup
      try {
        await upload(await deps.freshToken(), secret, local.baseVersion() ?? 0);
      } catch (e) {
        if (e instanceof ConflictError) local.note({ version: local.baseVersion() ?? 0, lastBackupAt: '', conflict: true });
        throw e;
      }
    },

    /** Look again at what the account holds, e.g. after a conflict. */
    async review(): Promise<Settled<D>> {
      return settle(await deps.freshToken(), await keys.load());
    },

    async recoveryCode(): Promise<string | null> {
      const secret = await keys.load();
      return secret ? toRecoveryCode(secret) : null;
    },

    /** Erase the account's backup from the server and forget the secret here. The data on the phone is not touched. */
    async deleteBackup(): Promise<void> {
      await api.delete(await deps.freshToken());
      await keys.forget();
      pending = undefined;
    },

    forgetPending(): void {
      pending = undefined;
    },
  };
}

export type BackupSession<D> = ReturnType<typeof createBackupSession<D>>;
