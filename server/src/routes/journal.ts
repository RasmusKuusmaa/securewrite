import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../session.js";

const router = Router();
router.use(requireAuth);

// Journal entries are opaque ciphertext scoped to (user_id, is_decoy), just
// like documents - dates, activities, durations and notes are all inside the
// encrypted blob, so this server can't even tell when you logged something.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", async (req, res) => {
  const result = await pool.query<{ id: string; nonce: string; ciphertext: string }>(
    "SELECT id, nonce, ciphertext FROM journal_entries WHERE user_id = $1 AND is_decoy = $2",
    [req.session!.userId, req.session!.isDecoy],
  );
  res.json(result.rows);
});

// Upsert. The WHERE on the conflict branch means an id that already belongs
// to another user (or the other vault) is never overwritten - it just 404s.
router.put("/:id", async (req, res) => {
  const { nonce, ciphertext } = req.body ?? {};
  if (!UUID_RE.test(req.params.id) || typeof nonce !== "string" || typeof ciphertext !== "string") {
    res.status(400).json({ error: "Malformed journal entry payload" });
    return;
  }
  const updatedAt = Date.now();
  const result = await pool.query(
    `INSERT INTO journal_entries (id, user_id, is_decoy, nonce, ciphertext, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET nonce = EXCLUDED.nonce, ciphertext = EXCLUDED.ciphertext, updated_at = EXCLUDED.updated_at
     WHERE journal_entries.user_id = EXCLUDED.user_id AND journal_entries.is_decoy = EXCLUDED.is_decoy`,
    [req.params.id, req.session!.userId, req.session!.isDecoy, nonce, ciphertext, updatedAt],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }
  res.json({ updatedAt });
});

router.delete("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(400).json({ error: "Malformed journal entry id" });
    return;
  }
  await pool.query("DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 AND is_decoy = $3", [
    req.params.id,
    req.session!.userId,
    req.session!.isDecoy,
  ]);
  res.json({});
});

export default router;
