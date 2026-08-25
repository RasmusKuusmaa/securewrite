import { createHmac, randomBytes, randomUUID } from "node:crypto";

const SERVER_SECRET = process.env.SESSION_SECRET;
if (!SERVER_SECRET) {
  throw new Error("SESSION_SECRET is not set");
}

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function newUserId(): string {
  return randomUUID();
}

// Same Argon2id salt length the client uses (crypto.ts SALT_LEN = 16 bytes),
// base64-encoded to match the shape a real stored salt would have. Returned
// for a username/method combination that doesn't exist so /auth/challenge
// responds identically either way - without this, response differences would
// let an attacker enumerate which usernames have an account (or a duress
// password configured) just by probing the endpoint.
export function fakeSalt(username: string, method: string): string {
  return createHmac("sha256", SERVER_SECRET!)
    .update(`${method}:${username}`)
    .digest()
    .subarray(0, 16)
    .toString("base64");
}

// Same backoff curve as the local vault (web/src/lib/vaultService.ts) -
// enforced server-side here since a networked client can't be trusted to
// honor its own rate limit.
export function backoffMs(failedAttempts: number): number {
  if (failedAttempts <= 3) return 0;
  const exp = Math.min(failedAttempts - 3, 10);
  const ms = 1000 * Math.pow(2, exp);
  return Math.min(ms, 5 * 60 * 1000);
}
