import * as Apple from 'expo-apple-authentication';

import { AppleCancelled, type AppleCredential, type AppleState } from './apple';

export { AppleCancelled, type AppleCredential, type AppleState };

export async function appleAvailable(): Promise<boolean> {
  try {
    return await Apple.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Asks for nothing but the identity: no name, no email. Tender has no use for either, and a token that carries neither
 * cannot leak either.
 */
export async function signInWithApple(): Promise<AppleCredential> {
  try {
    const c = await Apple.signInAsync({ requestedScopes: [] });
    if (!c.identityToken) throw new Error('Apple did not return an identity token');
    return { user: c.user, token: c.identityToken };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AppleCancelled();
    throw e;
  }
}

/** A new identity token for a person who has signed in before, without showing anything. */
export async function freshAppleToken(user: string): Promise<string> {
  const c = await Apple.refreshAsync({ user, requestedScopes: [] });
  if (!c.identityToken) throw new Error('Apple did not return an identity token');
  return c.identityToken;
}

export async function appleCredentialState(user: string): Promise<AppleState> {
  try {
    const s = await Apple.getCredentialStateAsync(user);
    if (s === Apple.AppleAuthenticationCredentialState.AUTHORIZED) return 'authorized';
    if (s === Apple.AppleAuthenticationCredentialState.REVOKED) return 'revoked';
    if (s === Apple.AppleAuthenticationCredentialState.NOT_FOUND) return 'not-found';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Fires when the person revokes Tender in Settings → Apple Account → Sign in with Apple. */
export function onAppleRevoked(listener: () => void): () => void {
  const sub = Apple.addRevokeListener(listener);
  return () => sub.remove();
}
