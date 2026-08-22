import { getMeta, putMeta, docStoreClear } from "./db";
import {
  WrappedKey,
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

// Mirrors src-tauri/src/crypto.rs one function at a time - see that file for
// the reasoning behind each design choice (duress collision check, backoff
// curve, why recovery key never opens the decoy, etc). Only the storage
// medium changes: IndexedDB instead of a JSON file in the OS app-data dir.

interface VaultFile {
  version: number;
  passwordSalt: string;
  passwordWrappedKey: WrappedKey;
  recoverySalt: string;
  recoveryWrappedKey: WrappedKey;
  failedAttempts: number;
  lockedUntil: number;
  duressSalt?: string;
  duressWrappedKey?: WrappedKey;
}

interface UnlockedVault {
  key: Uint8Array;
  isDecoy: boolean;
}

let unlocked: UnlockedVault | null = null;

function nowMs(): number {
  return Date.now();
}

async function readVault(): Promise<VaultFile> {
  const vault = await getMeta<VaultFile>("vault");
  if (!vault) throw new Error("Vault is not set up");
  return vault;
}

async function writeVault(vault: VaultFile): Promise<void> {
  await putMeta("vault", vault);
}

export async function isInitialized(): Promise<boolean> {
  return (await getMeta<VaultFile>("vault")) !== undefined;
}

export async function vaultStatus(): Promise<{ initialized: boolean; unlocked: boolean; isDecoy: boolean }> {
  return {
    initialized: await isInitialized(),
    unlocked: unlocked !== null,
    isDecoy: unlocked?.isDecoy ?? false,
  };
}

export async function setupVault(password: string): Promise<string> {
  if (await isInitialized()) throw new Error("Vault already set up");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const vaultKey = randomBytes(VAULT_KEY_LEN);

  const passwordSalt = randomBytes(SALT_LEN);
  const passwordKek = await deriveKey(new TextEncoder().encode(password), passwordSalt);
  const passwordWrappedKey = await wrapKey(passwordKek, vaultKey);

  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES);
  const recoveryKeyDisplay = formatRecoveryKey(recoveryBytes);

  const recoverySalt = randomBytes(SALT_LEN);
  const recoveryKek = await deriveKey(recoveryBytes, recoverySalt);
  const recoveryWrappedKey = await wrapKey(recoveryKek, vaultKey);

  const vault: VaultFile = {
    version: 1,
    passwordSalt: toBase64(passwordSalt),
    passwordWrappedKey,
    recoverySalt: toBase64(recoverySalt),
    recoveryWrappedKey,
    failedAttempts: 0,
    lockedUntil: 0,
  };
  await writeVault(vault);

  unlocked = { key: vaultKey, isDecoy: false };
  return recoveryKeyDisplay;
}

export async function setupDuressPassword(duressPassword: string): Promise<void> {
  if (!unlocked) throw new Error("Vault is locked");
  if (unlocked.isDecoy) throw new Error("Not available");
  if (duressPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const vault = await readVault();

  const realSalt = fromBase64(vault.passwordSalt);
  const realKek = await deriveKey(new TextEncoder().encode(duressPassword), realSalt);
  const collides = await unwrapKey(realKek, vault.passwordWrappedKey)
    .then(() => true)
    .catch(() => false);
  if (collides) {
    throw new Error("Duress password must be different from your master password");
  }

  const decoyVaultKey = randomBytes(VAULT_KEY_LEN);
  const duressSalt = randomBytes(SALT_LEN);
  const duressKek = await deriveKey(new TextEncoder().encode(duressPassword), duressSalt);
  const duressWrappedKey = await wrapKey(duressKek, decoyVaultKey);

  vault.duressSalt = toBase64(duressSalt);
  vault.duressWrappedKey = duressWrappedKey;
  await writeVault(vault);
  await docStoreClear("documents_decoy");
}

export async function hasDuressConfigured(): Promise<boolean> {
  if (!unlocked) throw new Error("Vault is locked");
  if (unlocked.isDecoy) throw new Error("Not available");
  const vault = await readVault();
  return vault.duressWrappedKey !== undefined;
}

function backoffMs(failedAttempts: number): number {
  if (failedAttempts <= 3) return 0;
  const exp = Math.min(failedAttempts - 3, 10);
  const ms = 1000 * Math.pow(2, exp);
  return Math.min(ms, 5 * 60 * 1000);
}

export async function unlockWithPassword(password: string): Promise<boolean> {
  const vault = await readVault();
  const now = nowMs();
  if (now < vault.lockedUntil) {
    const waitS = Math.ceil((vault.lockedUntil - now) / 1000);
    throw new Error(`Too many attempts. Try again in ${waitS}s.`);
  }

  const realSalt = fromBase64(vault.passwordSalt);
  const realKek = await deriveKey(new TextEncoder().encode(password), realSalt);
  try {
    const vaultKey = await unwrapKey(realKek, vault.passwordWrappedKey);
    vault.failedAttempts = 0;
    vault.lockedUntil = 0;
    await writeVault(vault);
    unlocked = { key: vaultKey, isDecoy: false };
    return false;
  } catch {
    // fall through to duress check
  }

  if (vault.duressSalt && vault.duressWrappedKey) {
    const duressSalt = fromBase64(vault.duressSalt);
    const duressKek = await deriveKey(new TextEncoder().encode(password), duressSalt);
    try {
      const decoyKey = await unwrapKey(duressKek, vault.duressWrappedKey);
      vault.failedAttempts = 0;
      vault.lockedUntil = 0;
      await writeVault(vault);
      unlocked = { key: decoyKey, isDecoy: true };
      return true;
    } catch {
      // fall through to failure path
    }
  }

  vault.failedAttempts += 1;
  vault.lockedUntil = now + backoffMs(vault.failedAttempts);
  await writeVault(vault);
  throw new Error("Incorrect password or recovery key");
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  const bytes = normalizeRecoveryKey(recoveryKey);
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new Error("Incorrect password or recovery key");
  }

  const vault = await readVault();
  const now = nowMs();
  if (now < vault.lockedUntil) {
    const waitS = Math.ceil((vault.lockedUntil - now) / 1000);
    throw new Error(`Too many attempts. Try again in ${waitS}s.`);
  }

  const salt = fromBase64(vault.recoverySalt);
  const kek = await deriveKey(bytes, salt);
  try {
    const vaultKey = await unwrapKey(kek, vault.recoveryWrappedKey);
    vault.failedAttempts = 0;
    vault.lockedUntil = 0;
    await writeVault(vault);
    unlocked = { key: vaultKey, isDecoy: false };
  } catch {
    vault.failedAttempts += 1;
    vault.lockedUntil = now + backoffMs(vault.failedAttempts);
    await writeVault(vault);
    throw new Error("Incorrect password or recovery key");
  }
}

export async function lockVault(): Promise<void> {
  if (unlocked) wipe(unlocked.key);
  unlocked = null;
}

export function getVaultContext(): { key: Uint8Array; isDecoy: boolean } {
  if (!unlocked) throw new Error("Vault is locked");
  return unlocked;
}
