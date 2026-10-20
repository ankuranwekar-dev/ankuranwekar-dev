/**
 * End-to-end protocol test: two phones pairing and talking through the real
 * relay handler (in-memory store), with the relay treated as an adversary
 * that can read and tamper with everything it stores.
 */
import { describe, expect, it } from 'vitest';

import { createRelay, memoryStore, sha256Base64Url } from '../../../supabase/functions/relay/handler';
import {
  createInvite,
  createJoinRequest,
  decodeInvite,
  deriveSession,
  encodeInvite,
  generateKeyPair,
  mailboxToken,
  open,
  pairingId,
  seal,
  tokenHash,
  verifyJoinRequest,
  type Envelope,
  type JoinRequest,
} from '../src/crypto/pairing';

async function call(relay: ReturnType<typeof createRelay>, route: string, body: unknown) {
  const res = await relay(new Request(`https://relay.test/functions/v1/relay/${route}`, { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as any };
}

describe('relay', () => {
  it('server-side token hashing matches the client', async () => {
    const invite = createInvite(generateKeyPair());
    const token = mailboxToken(invite);
    expect(await sha256Base64Url(token)).toBe(tokenHash(token));
  });

  it('carries a full pairing and conversation without ever seeing plaintext', async () => {
    const store = memoryStore();
    const relay = createRelay(store);

    // Her phone.
    const her = generateKeyPair();
    const invite = createInvite(her);
    const link = encodeInvite(invite);
    const pairId = pairingId(invite);
    const token = mailboxToken(invite);
    expect((await call(relay, 'mailbox', { pairId, tokenHash: tokenHash(token) })).status).toBe(201);
    expect((await call(relay, 'mailbox', { pairId, tokenHash: tokenHash(token) })).status).toBe(409);

    // His phone scans the QR code.
    const him = generateKeyPair();
    const scanned = decodeInvite(link);
    const join = createJoinRequest(him, scanned);
    expect((await call(relay, 'send', { pairId, token: mailboxToken(scanned), from: 'him', type: 'join', envelope: join })).status).toBe(201);
    const hisSession = deriveSession('him', him, scanned.herPublicKey, scanned);

    // Her phone collects the join, verifies it, derives keys and sends a snapshot.
    const got = await call(relay, 'fetch', { pairId, token, for: 'her', after: 0 });
    expect(got.body.messages).toHaveLength(1);
    const hisKey = verifyJoinRequest(got.body.messages[0].envelope as JoinRequest, invite);
    const herSession = deriveSession('her', her, hisKey, invite);
    const snapshot = { season: 'spring', playbook: { name: 'Maya', flowers: 'peonies' } };
    await call(relay, 'send', { pairId, token, from: 'her', type: 'snapshot', envelope: seal(herSession, 'snapshot', 1, snapshot) });

    // He collects and decrypts.
    const mine = await call(relay, 'fetch', { pairId, token, for: 'him', after: 0 });
    expect(mine.body.messages.map((m: { type: string }) => m.type)).toEqual(['snapshot']);
    expect(open(hisSession, mine.body.messages[0].envelope as Envelope)).toEqual(snapshot);

    // The relay's view contains no plaintext.
    const everything = JSON.stringify(store.dump());
    for (const secret of ['spring', 'Maya', 'peonies', token]) expect(everything).not.toContain(secret);
  });

  it('refuses wrong tokens, unknown mailboxes and bad input alike', async () => {
    const relay = createRelay(memoryStore());
    const invite = createInvite(generateKeyPair());
    const pairId = pairingId(invite);
    await call(relay, 'mailbox', { pairId, tokenHash: tokenHash(mailboxToken(invite)) });
    const wrong = await call(relay, 'fetch', { pairId, token: 'nope', for: 'him', after: 0 });
    const missing = await call(relay, 'fetch', { pairId: 'A'.repeat(22), token: 'nope', for: 'him', after: 0 });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(wrong.body).toEqual(missing.body);
    expect((await call(relay, 'send', { pairId, token: mailboxToken(invite), from: 'her', type: 'join', envelope: {} })).status).toBe(400);
    expect((await call(relay, 'send', { pairId, token: mailboxToken(invite), from: 'her', type: 'evil', envelope: {} })).status).toBe(400);
    expect((await call(relay, 'send', { pairId, token: mailboxToken(invite), from: 'her', type: 'signal', envelope: { x: 'a'.repeat(70_000) } })).status).toBe(413);
    expect((await call(relay, 'mailbox', { pairId: 'short', tokenHash: 'x' })).status).toBe(400);
  });

  it('wakes the other phone with a content-free push', async () => {
    const pushed: string[][] = [];
    const relay = createRelay(memoryStore(), async (t) => {
      pushed.push(t);
    });
    const invite = createInvite(generateKeyPair());
    const pairId = pairingId(invite);
    const token = mailboxToken(invite);
    await call(relay, 'mailbox', { pairId, tokenHash: tokenHash(token) });
    await call(relay, 'push-token', { pairId, token, role: 'him', pushToken: 'ExponentPushToken[abc]' });
    await call(relay, 'send', { pairId, token, from: 'her', type: 'signal', envelope: { body: 'ciphertext' } });
    await call(relay, 'send', { pairId, token, from: 'him', type: 'heart', envelope: { body: 'ciphertext' } });
    expect(pushed).toEqual([['ExponentPushToken[abc]']]);
  });

  it('close deletes every trace', async () => {
    const store = memoryStore();
    const relay = createRelay(store);
    const invite = createInvite(generateKeyPair());
    const pairId = pairingId(invite);
    const token = mailboxToken(invite);
    await call(relay, 'mailbox', { pairId, tokenHash: tokenHash(token) });
    await call(relay, 'send', { pairId, token, from: 'her', type: 'snapshot', envelope: { body: 'x' } });
    expect((await call(relay, 'close', { pairId, token })).status).toBe(200);
    expect(store.dump()).toEqual({ boxes: [], envelopes: [], tokens: [] });
    expect((await call(relay, 'fetch', { pairId, token, for: 'him', after: 0 })).status).toBe(404);
  });
});
