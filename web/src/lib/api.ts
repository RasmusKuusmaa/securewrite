import type { WrappedKey } from "./crypto";

// Thin client for ../../server's /api/auth and /api/documents routes. Relative
// paths only - dev proxies /api to the server (vite.config.ts), production
// serves both from the same origin (server/src/index.ts) - so there's no base
// URL and no CORS/credentials configuration needed here.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message = typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    const retryAfterSeconds = body.retryAfterSeconds;
    if (typeof retryAfterSeconds === "number") {
      throw new Error(`${message}. Try again in ${retryAfterSeconds}s.`);
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export interface SessionInfo {
  username: string;
  isDecoy: boolean;
}

// /auth/session answers "am I logged in" with a plain 401 when not - an
// expected state, not an error, so this returns null instead of throwing.
export async function fetchSession(): Promise<SessionInfo | null> {
  const res = await fetch("/api/auth/session");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export interface LoginResult {
  vaultSalt: string;
  wrappedKey: WrappedKey;
  isDecoy: boolean;
}

export const api = {
  signup(body: {
    username: string;
    authSalt: string;
    authKey: string;
    vaultSalt: string;
    passwordWrappedKey: WrappedKey;
    recoveryAuthSalt: string;
    recoveryAuthKey: string;
    recoveryVaultSalt: string;
    recoveryWrappedKey: WrappedKey;
  }): Promise<void> {
    return postJson("/api/auth/signup", body);
  },

  challenge(username: string, method: "password" | "recovery" | "duress"): Promise<{ salt: string }> {
    const params = new URLSearchParams({ username, method });
    return request(`/api/auth/challenge?${params.toString()}`);
  },

  login(body: { username: string; method: "password" | "recovery" | "duress"; authKey: string }): Promise<LoginResult> {
    return postJson("/api/auth/login", body);
  },

  logout(): Promise<void> {
    return postJson("/api/auth/logout", {});
  },

  me(): Promise<{ authSalt: string; vaultSalt: string }> {
    return request("/api/auth/me");
  },

  duressStatus(): Promise<{ configured: boolean }> {
    return request("/api/auth/duress-status");
  },

  setupDuress(body: {
    collisionAuthKey: string;
    authSalt: string;
    authKey: string;
    vaultSalt: string;
    wrappedKey: WrappedKey;
  }): Promise<void> {
    return postJson("/api/auth/duress", body);
  },

  listDocuments(): Promise<{ id: string; nonce: string; ciphertext: string }[]> {
    return request("/api/documents");
  },

  createDocument(body: { nonce: string; ciphertext: string }): Promise<{ id: string; nonce: string; ciphertext: string }> {
    return postJson("/api/documents", body);
  },

  getDocument(id: string): Promise<{ id: string; nonce: string; ciphertext: string }> {
    return request(`/api/documents/${id}`);
  },

  putDocument(id: string, body: { nonce: string; ciphertext: string }): Promise<{ updatedAt: number }> {
    return request(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },

  deleteDocument(id: string): Promise<void> {
    return request(`/api/documents/${id}`, { method: "DELETE" });
  },
};
