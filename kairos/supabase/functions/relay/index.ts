// Supabase Edge Function entry point (Deno). Deploy with:
//   supabase functions deploy relay --no-verify-jwt
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set automatically on Supabase).
// Optional EXPO_ACCESS_TOKEN for content-free wake-up pushes through Expo.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { createRelay, type EnvelopeType, type RelayStore, type Role } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const store: RelayStore = {
  async getTokenHash(pairId) {
    const { data } = await db.from('mailboxes').select('token_hash').eq('pair_id', pairId).maybeSingle();
    return data?.token_hash ?? null;
  },
  async createMailbox(pairId, tokenHash) {
    const { error } = await db.from('mailboxes').insert({ pair_id: pairId, token_hash: tokenHash });
    return !error;
  },
  async touch(pairId) {
    await db.from('mailboxes').update({ last_seen: new Date().toISOString() }).eq('pair_id', pairId);
  },
  async insert(pairId, sender, type, envelope) {
    const { data, error } = await db
      .from('envelopes')
      .insert({ pair_id: pairId, sender, type, envelope })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as number;
  },
  async listAfter(pairId, notFrom, after, limit) {
    const { data, error } = await db
      .from('envelopes')
      .select('id, sender, type, envelope')
      .eq('pair_id', pairId)
      .neq('sender', notFrom)
      .gt('id', after)
      .order('id', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as { id: number; sender: Role; type: EnvelopeType; envelope: unknown }[];
  },
  async savePushToken(pairId, role, token) {
    await db.from('push_tokens').upsert({ pair_id: pairId, role, token, updated_at: new Date().toISOString() });
  },
  async pushTokens(pairId, role) {
    const { data } = await db.from('push_tokens').select('token').eq('pair_id', pairId).eq('role', role);
    return (data ?? []).map((r: { token: string }) => r.token);
  },
  async deleteMailbox(pairId) {
    await db.from('mailboxes').delete().eq('pair_id', pairId);
  },
};

/**
 * Content-free wake-up: no title, no body, no data beyond a version marker.
 * The phone wakes, fetches from the relay, decrypts, and only then decides
 * what (if anything) to show.
 */
async function push(tokens: string[]): Promise<void> {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(tokens.map((to) => ({ to, _contentAvailable: true, data: { v: 1 }, priority: 'high' }))),
  });
}

Deno.serve(createRelay(store, push));
