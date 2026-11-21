import { getRandomValues } from 'expo-crypto';

/**
 * The encryption library draws its random bytes (keys, nonces, the backup secret) from `crypto.getRandomValues`, which
 * React Native does not provide. Without this, making the backup secret threw before anything was saved. expo-crypto
 * supplies the same function from the system's secure random source. The browser already has one and keeps it.
 */
const g = globalThis as { crypto?: Partial<Crypto> };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues } as Crypto;
}
