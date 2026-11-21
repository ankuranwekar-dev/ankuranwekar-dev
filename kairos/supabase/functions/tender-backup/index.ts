// Supabase Edge Function entry point (Deno). Deploy with:
//   supabase functions deploy tender-backup --no-verify-jwt
// Optional secrets: APPLE_CLIENT_ID (the app's bundle id, default com.9labs.tenderapp) and BACKUP_PEPPER (otherwise the
// pepper from Supabase Vault, made by the migration). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { createBackupApi, type BackupRow, type BackupStore } from './handler.ts';
import { appleKeysFromNetwork, createAppleVerifier } from './verify.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/**
 * The pepper that keys the hash of Apple identifiers: BACKUP_PEPPER if one is set, otherwise the one the migration made
 * in Supabase Vault. Read once, when the function starts.
 */
async function loadPepper(): Promise<string> {
  const fromEnv = Deno.env.get('BACKUP_PEPPER');
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  const { data, error } = await db.rpc('tender_backup_pepper');
  if (error || typeof data !== 'string' || data.length < 32) throw new Error('No backup pepper: run the migration');
  return data;
}
const pepper = await loadPepper();

const toRow = (r: { blob: string; version: number; updated_at: string }): BackupRow => ({
  blob: r.blob,
  version: r.version,
  updatedAt: r.updated_at,
});

const store: BackupStore = {
  async get(user) {
    const { data, error } = await db.from('tender_backups').select('blob, version, updated_at').eq('user_hash', user).maybeSingle();
    if (error) throw error;
    return data ? toRow(data) : null;
  },
  async put(user, blob, expected) {
    // One function does the version check and keeps the backup it replaces (see the migration).
    const { data, error } = await db.rpc('tender_backup_put', { p_user: user, p_blob: blob, p_expected: expected });
    if (error) throw error;
    return data ? toRow(data) : null;
  },
  async delete(user) {
    const { error } = await db.from('tender_backups').delete().eq('user_hash', user);
    if (error) throw error;
  },
};

Deno.serve(
  createBackupApi({
    store,
    pepper,
    verify: createAppleVerifier({
      audience: Deno.env.get('APPLE_CLIENT_ID') ?? 'com.9labs.tenderapp',
      keys: appleKeysFromNetwork(),
    }),
  }),
);
