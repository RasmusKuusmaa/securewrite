# Private Writer — Sync Server

Backend for the web build's optional **account/sync mode** (`web/`). Lets a
vault follow you across browsers/devices instead of staying pinned to one
browser's IndexedDB.

**Zero-knowledge design** (see `src/schema.sql` for the full comment): this
server stores a bcrypt hash of an Argon2id-derived "auth key" to verify a
password/recovery-key/duress-password attempt, and separately stores the
vault key wrapped (AES-GCM) under a *different* Argon2id derivation of the
same secret. The two derivations use different salts, so this server can gate
access and rate-limit attempts without ever being able to unwrap a vault key
itself — even a full database leak doesn't expose document content. Documents
themselves are stored as opaque `{nonce, ciphertext}` blobs; the server never
sees a title or a word of content in plaintext.

This is entirely separate from the web build's local-only IndexedDB vault —
an account here doesn't unlock a local vault or vice versa.

## Setup

```
npm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — a Postgres connection string (e.g. a free Neon instance).
  `pgcrypto` must be available (Neon and most managed providers have it).
- `SESSION_SECRET` — a long random string, used to derive decoy salts for
  usernames that don't exist so `/api/auth/challenge` can't be used to
  enumerate accounts. Generate one with `openssl rand -hex 32`.
- `DEV_CLIENT_ORIGIN` — only needed if you run the Vite dev server *without*
  its `/api` proxy (see `web/vite.config.ts`); leave it set to
  `http://localhost:5173` for the normal dev workflow.
- `PORT` — defaults to `8787`.

## Local development

```
npm run dev
```

Starts on `:8787`, applies `schema.sql` idempotently on boot. Run
`cd ../web && npm run dev` alongside it — the web dev server proxies `/api`
requests here, so no CORS setup is needed.

## Production

```
npm run build   # builds web/dist, then compiles this server
npm start
```

In production (`NODE_ENV=production`) this process also serves `web/dist`
directly, so the built frontend and the API share one origin — no CORS,
one process to deploy.
