import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromUtf8, toBase64Url, utf8 } from '../src/crypto/encoding';
import {
  createInvite,
  createJoinRequest,
  decodeInvite,
  deriveSession,
  encodeInvite,
  generateKeyPair,
  mailboxToken,
  tokenHash,
  open,
  pairingId,
  safetyCode,
  seal,
  verifyJoinRequest,
} from '../src/crypto/pairing';

function pair() {
  const her = generateKeyPair();
  const invite = createInvite(her);
  const link = encodeInvite(invite);
  // ...link travels by QR code...
  const him = generateKeyPair();
  const received = decodeInvite(link);
  const req = createJoinRequest(him, received);
  const hisKey = verifyJoinRequest(req, invite);
  const herSession = deriveSession('her', her, hisKey, invite);
  const hisSession = deriveSession('him', him, received.herPublicKey, received);
  return { her, him, invite, link, herSession, hisSession };
}

describe('encoding', () => {
  it('round-trips base64url for every length', () => {
    for (let n = 0; n < 70; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(fromBase64Url(toBase64Url(b))).toEqual(b);
    }
  });

  it('round-trips UTF-8 including emoji and Arabic', () => {
    for (const s of ['hello', 'Café ☕️', 'مرحبا', '🌸🌙 peonies & “quotes”']) {
      expect(fromUtf8(utf8(s))).toBe(s);
      expect(utf8(s)).toEqual(new TextEncoder().encode(s));
    }
  });
});

describe('pairing', () => {
  it('keeps the invite secret out of the URL path', () => {
    const { link } = pair();
    const url = new URL(link);
    expect(url.pathname).toBe('/pair');
    expect(url.search).toBe('');
    expect(url.hash.startsWith('#k1.')).toBe(true);
  });

  it('derives matching directional keys and the same safety code on both phones', () => {
    const { herSession, hisSession } = pair();
    expect(herSession.send).toEqual(hisSession.receive);
    expect(herSession.receive).toEqual(hisSession.send);
    expect(herSession.send).not.toEqual(herSession.receive);
    expect(herSession.pairId).toBe(hisSession.pairId);
    const a = safetyCode(herSession.herPublicKey, herSession.hisPublicKey);
    const b = safetyCode(hisSession.herPublicKey, hisSession.hisPublicKey);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
  });

  it('rejects a join request from someone without the invite (relay MITM)', () => {
    const { invite } = pair();
    const mallory = generateKeyPair();
    const forgedInvite = { ...invite, secret: new Uint8Array(32) };
    const req = createJoinRequest(mallory, forgedInvite);
    expect(() => verifyJoinRequest(req, invite)).toThrow();
    const tampered = { ...createJoinRequest(generateKeyPair(), invite), partnerPublicKey: toBase64Url(mallory.publicKey) };
    expect(() => verifyJoinRequest(tampered, invite)).toThrow();
  });

  it('the relay mailbox id reveals nothing about the secret', () => {
    const { invite } = pair();
    const id = pairingId(invite);
    expect(id).not.toContain(toBase64Url(invite.secret).slice(0, 8));
    expect(fromBase64Url(id)).toHaveLength(16);
  });

  it('derives a mailbox token both phones agree on, unrelated to the keys', () => {
    const { invite, link, herSession } = pair();
    const token = mailboxToken(invite);
    expect(mailboxToken(decodeInvite(link))).toBe(token);
    expect(token).not.toBe(toBase64Url(herSession.send));
    expect(tokenHash(token)).not.toBe(token);
    expect(fromBase64Url(tokenHash(token))).toHaveLength(32);
  });

  it('rejects malformed invites', () => {
    expect(() => decodeInvite('https://kairos.love/pair#k2.abc.def')).toThrow();
    expect(() => decodeInvite('https://example.com')).toThrow();
  });
});

describe('envelopes', () => {
  it('her snapshot reaches him intact', () => {
    const { herSession, hisSession } = pair();
    const payload = { season: 'spring', note: 'peonies 🌸' };
    const env = seal(herSession, 'snapshot', 7, payload);
    expect(env.body).not.toContain('spring');
    expect(open(hisSession, env)).toEqual(payload);
  });

  it('detects tampering, relabelling and cross-pair replay', () => {
    const a = pair();
    const b = pair();
    const env = seal(a.herSession, 'signal', 3, { id: 'hold-me' });
    const flipped = fromBase64Url(env.body);
    flipped[0] = flipped[0]! ^ 1;
    expect(() => open(a.hisSession, { ...env, body: toBase64Url(flipped) })).toThrow();
    expect(() => open(a.hisSession, { ...env, type: 'snapshot' })).toThrow();
    expect(() => open(a.hisSession, { ...env, seq: 4 })).toThrow();
    expect(() => open(b.hisSession, env)).toThrow();
    // He cannot open his own outgoing messages with his receive key (keys are directional).
    expect(() => open(a.hisSession, seal(a.hisSession, 'heart', 1, {}))).toThrow();
  });
});
