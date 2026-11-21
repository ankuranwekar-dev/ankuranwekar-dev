/**
 * Client for the sealed-backup server (supabase/functions/tender-backup). Configure it with EXPO_PUBLIC_BACKUP_URL, the
 * function's full address (https://<project>.supabase.co/functions/v1/tender-backup), and EXPO_PUBLIC_BACKUP_ANON_KEY if
 * the project wants one on the gateway; without a URL the app has no account feature.
 */
const URL = process.env.EXPO_PUBLIC_BACKUP_URL;
const KEY = process.env.EXPO_PUBLIC_BACKUP_ANON_KEY;

export const backupConfigured = Boolean(URL);

export class BackupHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: { version?: number; updatedAt?: string | null } = {},
  ) {
    super(message);
  }
}

async function call<T>(op: string, token: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!URL) throw new Error('Backup is not set up in this build');
  let res: Response;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(KEY ? { apikey: KEY, authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ op, token, ...extra }),
    });
  } catch {
    throw new BackupHttpError(0, 'No connection');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; version?: number; updatedAt?: string | null };
  if (!res.ok) throw new BackupHttpError(res.status, body.error ?? `Backup ${op} failed`, body);
  return body as T;
}

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

/** The backup's size and date, or null if the account has none. */
export async function remoteHead(token: string): Promise<RemoteInfo | null> {
  try {
    return await call<RemoteInfo>('head', token);
  } catch (e) {
    if (e instanceof BackupHttpError && e.status === 404) return null;
    throw e;
  }
}

export const remoteGet = (token: string) => call<RemoteBackup>('get', token);
export const remotePut = (token: string, blob: string, base: number) =>
  call<{ version: number; updatedAt: string }>('put', token, { blob, base });
export const remoteDelete = (token: string) => call<{ ok: true }>('delete', token);
