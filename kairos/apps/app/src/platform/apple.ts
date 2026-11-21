/** Sign in with Apple exists only on iPhone. Everywhere else the app runs without an account, as it always has. */

export interface AppleCredential {
  /** Apple's stable identifier for this person and this app. */
  user: string;
  /** A short-lived identity token for the backup server to check. */
  token: string;
}

export type AppleState = 'authorized' | 'revoked' | 'not-found' | 'unknown';

/** She dismissed the Apple sheet. Not an error worth showing. */
export class AppleCancelled extends Error {}

export async function appleAvailable(): Promise<boolean> {
  return false;
}
export async function signInWithApple(): Promise<AppleCredential> {
  throw new Error('Sign in with Apple is not available here');
}
export async function freshAppleToken(_user: string): Promise<string> {
  throw new Error('Sign in with Apple is not available here');
}
export async function appleCredentialState(_user: string): Promise<AppleState> {
  return 'unknown';
}
export function onAppleRevoked(_listener: () => void): () => void {
  return () => {};
}
