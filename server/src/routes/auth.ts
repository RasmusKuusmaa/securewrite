import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { newUserId, fakeSalt, backoffMs } from "../util.js";
import { createSession, destroySession, requireAuth, requireRealSession } from "../session.js";

const router = Router();
const BCRYPT_ROUNDS = 12;

interface UserRow {
  id: string;
  username: string;
  auth_salt: string;
  auth_hash: string;
  vault_salt: string;
  password_wrapped_key: { nonce: string; ciphertext: string };
  recovery_auth_salt: string;
  recovery_auth_hash: string;
  recovery_vault_salt: string;
  recovery_wrapped_key: { nonce: string; ciphertext: string };
  duress_auth_salt: string | null;
  duress_auth_hash: string | null;
  duress_vault_salt: string | null;
  duress_wrapped_key: { nonce: string; ciphertext: string } | null;
  failed_attempts: number;
  locked_until: string;
}

function isValidUsername(username: unknown): username is string {
  return typeof username === "string" && /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

router.post("/signup", async (req, res) => {
  const {
    username,
    authSalt,
    authKey,
    vaultSalt,
    passwordWrappedKey,
    recoveryAuthSalt,
    recoveryAuthKey,
    recoveryVaultSalt,
    recoveryWrappedKey,
  } = req.body ?? {};

  if (!isValidUsername(username)) {
    res.status(400).json({ error: "Username must be 3-32 characters: letters, numbers, _ or -" });
    return;
  }
  if (
    typeof authSalt !== "string" ||
    typeof authKey !== "string" ||
    typeof vaultSalt !== "string" ||
    typeof recoveryAuthSalt !== "string" ||
    typeof recoveryAuthKey !== "string" ||
    typeof recoveryVaultSalt !== "string" ||
    !passwordWrappedKey?.nonce ||
    !passwordWrappedKey?.ciphertext ||
    !recoveryWrappedKey?.nonce ||
    !recoveryWrappedKey?.ciphertext
  ) {
    res.status(400).json({ error: "Malformed signup payload" });
    return;
  }

  const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: "Username is taken" });
    return;
  }

  const authHash = await bcrypt.hash(authKey, BCRYPT_ROUNDS);
  const recoveryAuthHash = await bcrypt.hash(recoveryAuthKey, BCRYPT_ROUNDS);
  const id = newUserId();

  await pool.query(
    `INSERT INTO users
      (id, username, auth_salt, auth_hash, vault_salt, password_wrapped_key,
       recovery_auth_salt, recovery_auth_hash, recovery_vault_salt, recovery_wrapped_key,
       created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      username,
      authSalt,
      authHash,
      vaultSalt,
      passwordWrappedKey,
      recoveryAuthSalt,
      recoveryAuthHash,
      recoveryVaultSalt,
      recoveryWrappedKey,
      Date.now(),
    ],
  );

  await createSession(res, id, false);
  res.status(201).json({});
});

router.get("/challenge", async (req, res) => {
  const username = String(req.query.username ?? "");
  const method = String(req.query.method ?? "password");
  if (!["password", "recovery", "duress"].includes(method)) {
    res.status(400).json({ error: "Invalid method" });
    return;
  }

  const result = await pool.query<UserRow>("SELECT * FROM users WHERE username = $1", [username]);
  const user = result.rows[0];

  const saltColumn =
    method === "password" ? user?.auth_salt : method === "recovery" ? user?.recovery_auth_salt : user?.duress_auth_salt;

  // Same response shape whether the account, or that account's duress
  // password, exists or not - otherwise this endpoint would let an attacker
  // enumerate valid usernames (or detect which accounts have duress set up)
  // just by comparing responses.
  res.json({ salt: saltColumn ?? fakeSalt(username, method) });
});

router.post("/login", async (req, res) => {
  const { username, method, authKey } = req.body ?? {};
  if (typeof username !== "string" || typeof authKey !== "string") {
    res.status(400).json({ error: "Malformed login payload" });
    return;
  }
  if (!["password", "recovery", "duress"].includes(method)) {
    res.status(400).json({ error: "Invalid method" });
    return;
  }

  const result = await pool.query<UserRow>("SELECT * FROM users WHERE username = $1", [username]);
  const user = result.rows[0];
  if (!user) {
    // Still run a bcrypt compare against a dummy hash so response timing
    // doesn't reveal whether the username exists.
    await bcrypt.compare(authKey, "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Wy6EO5NM.iC7pXV.Wh7B2fSbmxzhO");
    res.status(401).json({ error: "Incorrect username, password, or recovery key" });
    return;
  }

  const now = Date.now();
  if (now < Number(user.locked_until)) {
    const retryAfterSeconds = Math.ceil((Number(user.locked_until) - now) / 1000);
    res.status(423).json({ error: "Too many attempts", retryAfterSeconds });
    return;
  }

  const hashColumn = method === "password" ? user.auth_hash : method === "recovery" ? user.recovery_auth_hash : user.duress_auth_hash;

  const matches = hashColumn ? await bcrypt.compare(authKey, hashColumn) : false;
  if (!matches) {
    const failedAttempts = user.failed_attempts + 1;
    await pool.query("UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3", [
      failedAttempts,
      now + backoffMs(failedAttempts),
      user.id,
    ]);
    res.status(401).json({ error: "Incorrect username, password, or recovery key" });
    return;
  }

  await pool.query("UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = $1", [user.id]);

  const isDecoy = method === "duress";
  await createSession(res, user.id, isDecoy);

  if (method === "password") {
    res.json({ vaultSalt: user.vault_salt, wrappedKey: user.password_wrapped_key, isDecoy: false });
  } else if (method === "recovery") {
    res.json({ vaultSalt: user.recovery_vault_salt, wrappedKey: user.recovery_wrapped_key, isDecoy: false });
  } else {
    res.json({ vaultSalt: user.duress_vault_salt, wrappedKey: user.duress_wrapped_key, isDecoy: true });
  }
});

router.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({});
});

router.get("/session", async (req, res) => {
  if (!req.session) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  const result = await pool.query<{ username: string }>("SELECT username FROM users WHERE id = $1", [
    req.session.userId,
  ]);
  const username = result.rows[0]?.username;
  if (!username) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.json({ username, isDecoy: req.session.isDecoy });
});

// Only ever called while unlocked into the real (non-decoy) vault - lets the
// client re-derive its own auth/vault Keks locally for the duress-collision
// check and the duress key-wrap step, without the server ever handling a
// plaintext password.
router.get("/me", requireRealSession, async (req, res) => {
  const result = await pool.query<UserRow>("SELECT auth_salt, vault_salt FROM users WHERE id = $1", [
    req.session!.userId,
  ]);
  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.json({ authSalt: user.auth_salt, vaultSalt: user.vault_salt });
});

router.get("/duress-status", requireRealSession, async (req, res) => {
  const result = await pool.query<{ duress_wrapped_key: unknown }>(
    "SELECT duress_wrapped_key FROM users WHERE id = $1",
    [req.session!.userId],
  );
  res.json({ configured: result.rows[0]?.duress_wrapped_key != null });
});

router.post("/duress", requireRealSession, async (req, res) => {
  const { collisionAuthKey, authSalt, authKey, vaultSalt, wrappedKey } = req.body ?? {};
  if (
    typeof collisionAuthKey !== "string" ||
    typeof authSalt !== "string" ||
    typeof authKey !== "string" ||
    typeof vaultSalt !== "string" ||
    !wrappedKey?.nonce ||
    !wrappedKey?.ciphertext
  ) {
    res.status(400).json({ error: "Malformed duress payload" });
    return;
  }

  const result = await pool.query<UserRow>("SELECT auth_hash FROM users WHERE id = $1", [req.session!.userId]);
  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const collides = await bcrypt.compare(collisionAuthKey, user.auth_hash);
  if (collides) {
    res.status(400).json({ error: "Duress password must be different from your master password" });
    return;
  }

  const duressAuthHash = await bcrypt.hash(authKey, BCRYPT_ROUNDS);
  await pool.query(
    `UPDATE users
     SET duress_auth_salt = $1, duress_auth_hash = $2, duress_vault_salt = $3, duress_wrapped_key = $4
     WHERE id = $5`,
    [authSalt, duressAuthHash, vaultSalt, wrappedKey, req.session!.userId],
  );
  res.json({});
});

export default router;
