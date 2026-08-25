import { api, fetchSession } from "./api";
import {
  VAULT_KEY_LEN,
  SALT_LEN,
  RECOVERY_KEY_BYTES,
  deriveKey,
  wrapKey,
  unwrapKey,
  formatRecoveryKey,
  normalizeRecoveryKey,
  randomBytes,
  wipe,
  toBase64,
  fromBase64,
} from "./crypto";

// Sync-mode counterpart to vaultService.ts, backed by ../../server instead of
// IndexedDB. The server's auth_salt/auth_hash pair (used to authenticate) is
// deliberately separate from vault_salt/*_wrapped_key (used to derive the KEK
// that unwraps the vault key, client-side only) - see server/src/schema.sql.
// So every login/signup here does two Argon2id derivations per secret, not
// one like the local vault.

interface UnlockedVault {
  key: Uint8Array;
  isDecoy: boolean;
}

let unlocked: UnlockedVault | null = null;

function encode(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function vaultStatus(): Promise<{
  initialized: boolean;
  unlocked: boolean;
  isDecoy: boolean;
  username: string | null;
}> {
  const session = await fetchSession();
  return {
    initialized: session !== null,
    unlocked: unlocked !== null,
    isDecoy: unlocked?.isDecoy ?? session?.isDecoy ?? false,
    username: session?.username ?? null,
  };
}

export async function setupAccount(username: string, password: string): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const vaultKey = randomBytes(VAULT_KEY_LEN);

  const authSalt = randomBytes(SALT_LEN);
  const authKey = toBase64(await deriveKey(encode(password), authSalt));
  const vaultSalt = randomBytes(SALT_LEN);
  const vaultKek = await deriveKey(encode(password), vaultSalt);
  const passwordWrappedKey = await wrapKey(vaultKek, vaultKey);

  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES);
  const recoveryKeyDisplay = formatRecoveryKey(recoveryBytes);
  const recoveryAuthSalt = randomBytes(SALT_LEN);
  const recoveryAuthKey = toBase64(await deriveKey(recoveryBytes, recoveryAuthSalt));
  const recoveryVaultSalt = randomBytes(SALT_LEN);
  const recoveryVaultKek = await deriveKey(recoveryBytes, recoveryVaultSalt);
  const recoveryWrappedKey = await wrapKey(recoveryVaultKek, vaultKey);

  await api.signup({
    username,
    authSalt: toBase64(authSalt),
    authKey,
    vaultSalt: toBase64(vaultSalt),
    passwordWrappedKey,
    recoveryAuthSalt: toBase64(recoveryAuthSalt),
    recoveryAuthKey,
    recoveryVaultSalt: toBase64(recoveryVaultSalt),
    recoveryWrappedKey,
  });

  unlocked = { key: vaultKey, isDecoy: false };
  return recoveryKeyDisplay;
}

async function loginWithMethod(
  username: string,
  method: "password" | "recovery" | "duress",
  secretBytes: Uint8Array,
): Promise<boolean> {
  const { salt } = await api.challenge(username, method);
  const authSalt = fromBase64(salt);
  const authKey = toBase64(await deriveKey(secretBytes, authSalt));

  const result = await api.login({ username, method, authKey });

  const vaultSalt = fromBase64(result.vaultSalt);
  const vaultKek = await deriveKey(secretBytes, vaultSalt);
  const vaultKey = await unwrapKey(vaultKek, result.wrappedKey);

  unlocked = { key: vaultKey, isDecoy: result.isDecoy };
  return result.isDecoy;
}

export async function unlockWithPassword(username: string, password: string): Promise<boolean> {
  return loginWithMethod(username, "password", encode(password));
}

export async function unlockWithRecoveryKey(username: string, recoveryKey: string): Promise<void> {
  const bytes = normalizeRecoveryKey(recoveryKey);
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new Error("Incorrect password or recovery key");
  }
  await loginWithMethod(username, "recovery", bytes);
}

export async function lockVault(): Promise<void> {
  if (unlocked) wipe(unlocked.key);
  unlocked = null;
}

export async function logout(): Promise<void> {
  await lockVault();
  await api.logout();
}

export async function setupDuressPassword(duressPassword: string): Promise<void> {
  if (!unlocked) throw new Error("Vault is locked");
  if (unlocked.isDecoy) throw new Error("Not available");
  if (duressPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const me = await api.me();
  const collisionAuthKey = toBase64(await deriveKey(encode(duressPassword), fromBase64(me.authSalt)));

  const decoyVaultKey = randomBytes(VAULT_KEY_LEN);
  const authSalt = randomBytes(SALT_LEN);
  const authKey = toBase64(await deriveKey(encode(duressPassword), authSalt));
  const vaultSalt = randomBytes(SALT_LEN);
  const vaultKek = await deriveKey(encode(duressPassword), vaultSalt);
  const wrappedKey = await wrapKey(vaultKek, decoyVaultKey);

  // The server runs the actual collision check (bcrypt-comparing
  // collisionAuthKey against the real account's auth_hash) - it returns a
  // 400 there if it matches, which api.setupDuress lets propagate as a thrown
  // Error, same as the local vault's collision rejection.
  await api.setupDuress({
    collisionAuthKey,
    authSalt: toBase64(authSalt),
    authKey,
    vaultSalt: toBase64(vaultSalt),
    wrappedKey,
  });
}

export async function hasDuressConfigured(): Promise<boolean> {
  if (!unlocked) throw new Error("Vault is locked");
  if (unlocked.isDecoy) throw new Error("Not available");
  const { configured } = await api.duressStatus();
  return configured;
}

export function getVaultContext(): { key: Uint8Array; isDecoy: boolean } {
  if (!unlocked) throw new Error("Vault is locked");
  return unlocked;
}
