// Mirrors src-tauri/src/crypto.rs: same Argon2id cost params, same AES-256-GCM
// wrap/unwrap scheme, so the web vault gets the same offline-brute-force
// resistance as the desktop one. This is a *separate* vault, though - a
// password used on desktop does not unlock the web version or vice versa.
export const VAULT_KEY_LEN = 32;
export const SALT_LEN = 16;
export const RECOVERY_KEY_BYTES = 16;

const ARGON2_MEM_KIB = 65536; // 64 MiB
const ARGON2_TIME = 3;
const ARGON2_PARALLELISM = 4;

export interface WrappedKey {
  nonce: string;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Best-effort key scrub - JS has no guaranteed-scrubbed memory the way Rust's
 * `zeroize` does (the GC may have already copied the buffer), but overwriting
 * before dropping the reference costs nothing and helps in the common case. */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

// Argon2id runs in a dedicated worker (see argon2Worker.ts) so the ~64 MiB
// cost parameter's several-second computation doesn't freeze the tab - a
// WASM call blocks whatever thread invokes it regardless of the Promise
// wrapper, so without this every unlock attempt would hang the whole UI.
let argon2Worker: Worker | null = null;
function getArgon2Worker(): Worker {
  if (!argon2Worker) {
    argon2Worker = new Worker(new URL("./argon2Worker.ts", import.meta.url), { type: "module" });
  }
  return argon2Worker;
}

// Calls are serialized through this queue - the app only ever awaits one
// derivation at a time in practice, but this keeps concurrent callers safe
// without needing per-request message ids.
let argon2Queue: Promise<unknown> = Promise.resolve();

export function deriveKey(secret: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const run = (): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const worker = getArgon2Worker();
      const onMessage = (e: MessageEvent<{ result?: Uint8Array; error?: string }>) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.result!);
      };
      const onError = (e: ErrorEvent) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(new Error(e.message));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({
        password: secret,
        salt,
        parallelism: ARGON2_PARALLELISM,
        iterations: ARGON2_TIME,
        memorySize: ARGON2_MEM_KIB,
        hashLength: VAULT_KEY_LEN,
      });
    });

  const result = argon2Queue.then(run, run);
  argon2Queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function aesEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const nonce = randomBytes(12);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, plaintext),
  );
  return { nonce, ciphertext };
}

async function aesDecrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, ciphertext);
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("decryption failed");
  }
}

export async function wrapKey(kek: Uint8Array, vaultKey: Uint8Array): Promise<WrappedKey> {
  const { nonce, ciphertext } = await aesEncrypt(kek, vaultKey);
  return { nonce: toBase64(nonce), ciphertext: toBase64(ciphertext) };
}

export async function unwrapKey(kek: Uint8Array, wrapped: WrappedKey): Promise<Uint8Array> {
  return aesDecrypt(kek, fromBase64(wrapped.nonce), fromBase64(wrapped.ciphertext));
}

export async function encryptJson(key: Uint8Array, payload: unknown): Promise<{ nonce: string; ciphertext: string }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const { nonce, ciphertext } = await aesEncrypt(key, plaintext);
  return { nonce: toBase64(nonce), ciphertext: toBase64(ciphertext) };
}

export async function decryptJson<T>(key: Uint8Array, nonceB64: string, ciphertextB64: string): Promise<T> {
  const plaintext = await aesDecrypt(key, fromBase64(nonceB64), fromBase64(ciphertextB64));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function formatRecoveryKey(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += 4) groups.push(hex.slice(i, i + 4));
  return groups.join("-");
}

export function normalizeRecoveryKey(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (cleaned.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export { toBase64, fromBase64 };
