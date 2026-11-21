// Supabase Edge Function entry point (Deno). Deploy with:
//   supabase functions deploy backup --no-verify-jwt
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
  const { data, error } = await db.rpc('backup_pepper');
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
    const { data, error } = await db.from('backups').select('blob, version, updated_at').eq('user_hash', user).maybeSingle();
    if (error) throw error;
    return data ? toRow(data) : null;
  },
  async put(user, blob, expected) {
    const now = new Date().toISOString();
    if (expected === 0) {
      const { data, error } = await db
        .from('backups')
        .insert({ user_hash: user, blob, version: 1, updated_at: now })
        .select('blob, version, updated_at')
        .maybeSingle();
      if (error) return null; // already exists: the version has moved on
      return data ? toRow(data) : null;
    }
    const { data, error } = await db
      .from('backups')
      .update({ blob, version: expected + 1, updated_at: now })
      .eq('user_hash', user)
      .eq('version', expected)
      .select('blob, version, updated_at')
      .maybeSingle();
    if (error) throw error;
    return data ? toRow(data) : null;
  },
  async delete(user) {
    const { error } = await db.from('backups').delete().eq('user_hash', user);
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
