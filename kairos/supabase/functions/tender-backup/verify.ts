/**
 * Verifies a "Sign in with Apple" identity token, with Web-standard SubtleCrypto only, so it runs in a Supabase Edge
 * Function (Deno) and in Node tests alike.
 *
 * What it checks: an RS256 signature from one of Apple's published keys, the issuer, that the token was minted for
 * this app (audience), and that it has not expired. What it returns: the account's stable Apple identifier (`sub`)
 * and nothing else. Tender does not ask Apple for a name or an email, so neither is ever seen.
 */

export interface AppleJwk {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
}

export interface VerifierOptions {
  /** The app's bundle identifier (the token's `aud` for a native sign-in). */
  audience: string;
  /** Apple's current public keys. Called again once if a token names a key that is not in the last answer. */
  keys: (refresh: boolean) => Promise<AppleJwk[]>;
  issuer?: string;
  /** Seconds since the epoch. */
  now?: () => number;
}

export class TokenError extends Error {}

function b64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

export function createAppleVerifier(opts: VerifierOptions): (token: string) => Promise<{ sub: string }> {
  const issuer = opts.issuer ?? 'https://appleid.apple.com';
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  return async (token) => {
    if (typeof token !== 'string' || token.length > 4096) throw new TokenError('malformed');
    const parts = token.split('.');
    if (parts.length !== 3) throw new TokenError('malformed');
    let header: { alg?: string; kid?: string };
    let payload: { iss?: string; aud?: string | string[]; exp?: number; iat?: number; sub?: string };
    try {
      header = json(parts[0]!);
      payload = json(parts[1]!);
    } catch {
      throw new TokenError('malformed');
    }
    if (header.alg !== 'RS256' || !header.kid) throw new TokenError('algorithm');

    let jwk = (await opts.keys(false)).find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) jwk = (await opts.keys(true)).find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) throw new TokenError('unknown key');

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64url(parts[2]!),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) throw new TokenError('signature');

    if (payload.iss !== issuer) throw new TokenError('issuer');
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(opts.audience)) throw new TokenError('audience');
    const t = now();
    if (typeof payload.exp !== 'number' || payload.exp <= t) throw new TokenError('expired');
    if (typeof payload.iat === 'number' && payload.iat > t + 120) throw new TokenError('from the future');
    if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128) throw new TokenError('subject');
    return { sub: payload.sub };
  };
}

/** Apple's keys over the network, cached for an hour and refetched when a token names a key we do not have. */
export function appleKeysFromNetwork(fetcher: typeof fetch = fetch, ttlMs = 3_600_000): VerifierOptions['keys'] {
  let cached: { at: number; keys: AppleJwk[] } | undefined;
  return async (refresh) => {
    if (cached) {
      const age = Date.now() - cached.at;
      // A token naming an unknown key triggers a refresh, but never more than once a minute: nobody can make this
      // function hammer Apple by sending it junk.
      if (age < (refresh ? 60_000 : ttlMs)) return cached.keys;
    }
    const res = await fetcher('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new TokenError('keys unavailable');
    const body = (await res.json()) as { keys: AppleJwk[] };
    cached = { at: Date.now(), keys: body.keys };
    return cached.keys;
  };
}
