import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import { newSessionId } from "./util.js";

const COOKIE_NAME = "pw_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h safety-net expiry

export interface SessionInfo {
  userId: string;
  isDecoy: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionInfo;
    }
  }
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function createSession(res: Response, userId: string, isDecoy: boolean): Promise<void> {
  const id = newSessionId();
  const now = Date.now();
  await pool.query(
    "INSERT INTO sessions (id, user_id, is_decoy, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [id, userId, isDecoy, now, now + SESSION_TTL_MS],
  );
  // No Max-Age/Expires - a session cookie, cleared when the browser closes,
  // plus the server-side expiry above as a backstop. Matches "locking" being
  // a meaningful security boundary rather than a purely cosmetic UI state.
  res.cookie(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
  });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const id = req.cookies?.[COOKIE_NAME];
  if (id) {
    await pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

// Populates req.session when a valid, unexpired cookie is present. Does not
// itself reject the request - routes that need auth use requireAuth below,
// while /auth/session uses this alone to answer "am I logged in".
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const id = req.cookies?.[COOKIE_NAME];
  if (!id) return next();
  const result = await pool.query<{ user_id: string; is_decoy: boolean; expires_at: string }>(
    "SELECT user_id, is_decoy, expires_at FROM sessions WHERE id = $1",
    [id],
  );
  const row = result.rows[0];
  if (row && Number(row.expires_at) > Date.now()) {
    req.session = { userId: row.user_id, isDecoy: row.is_decoy };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  next();
}

// For endpoints (duress setup, /auth/me) that only make sense against the
// real vault - mirrors the desktop/local-web guard hiding duress setup
// entirely while inside the decoy.
export function requireRealSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  if (req.session.isDecoy) {
    res.status(404).json({ error: "Not available" });
    return;
  }
  next();
}
