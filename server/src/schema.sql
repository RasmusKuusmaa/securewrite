-- Applied idempotently on server startup (see db.ts). Wrapped-key columns are
-- JSONB {nonce, ciphertext} - same shape crypto.ts produces client-side.
--
-- Zero-knowledge note: auth_hash/recovery_auth_hash/duress_auth_hash are
-- bcrypt hashes of a value the client derives via Argon2id(secret, *_auth_salt)
-- - a DIFFERENT salt than the one used to derive the key that unwraps
-- password_wrapped_key/recovery_wrapped_key/duress_wrapped_key. That split
-- means this server can verify "you know the password" (to gate access and
-- enforce rate limiting) without ever being able to derive the key that
-- decrypts a document, even if this whole database leaked.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,

  auth_salt TEXT NOT NULL,
  auth_hash TEXT NOT NULL,
  vault_salt TEXT NOT NULL,
  password_wrapped_key JSONB NOT NULL,

  recovery_auth_salt TEXT NOT NULL,
  recovery_auth_hash TEXT NOT NULL,
  recovery_vault_salt TEXT NOT NULL,
  recovery_wrapped_key JSONB NOT NULL,

  duress_auth_salt TEXT,
  duress_auth_hash TEXT,
  duress_vault_salt TEXT,
  duress_wrapped_key JSONB,

  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_decoy BOOLEAN NOT NULL,
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents(user_id, is_decoy);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_decoy BOOLEAN NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
