import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../session.js";

const router = Router();
router.use(requireAuth);

// Every row here is opaque ciphertext scoped to (user_id, is_decoy) from the
// session - this server never sees a document's plaintext title or content,
// only the encrypted blob crypto.ts produced client-side.

router.get("/", async (req, res) => {
  const result = await pool.query<{ id: string; nonce: string; ciphertext: string }>(
    "SELECT id, nonce, ciphertext FROM documents WHERE user_id = $1 AND is_decoy = $2",
    [req.session!.userId, req.session!.isDecoy],
  );
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const { nonce, ciphertext } = req.body ?? {};
  if (typeof nonce !== "string" || typeof ciphertext !== "string") {
    res.status(400).json({ error: "Malformed document payload" });
    return;
  }
  const id = randomUUID();
  await pool.query(
    "INSERT INTO documents (id, user_id, is_decoy, nonce, ciphertext, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, req.session!.userId, req.session!.isDecoy, nonce, ciphertext, Date.now()],
  );
  res.status(201).json({ id, nonce, ciphertext });
});

router.get("/:id", async (req, res) => {
  const result = await pool.query<{ id: string; nonce: string; ciphertext: string }>(
    "SELECT id, nonce, ciphertext FROM documents WHERE id = $1 AND user_id = $2 AND is_decoy = $3",
    [req.params.id, req.session!.userId, req.session!.isDecoy],
  );
  const doc = result.rows[0];
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(doc);
});

router.put("/:id", async (req, res) => {
  const { nonce, ciphertext } = req.body ?? {};
  if (typeof nonce !== "string" || typeof ciphertext !== "string") {
    res.status(400).json({ error: "Malformed document payload" });
    return;
  }
  const updatedAt = Date.now();
  const result = await pool.query(
    "UPDATE documents SET nonce = $1, ciphertext = $2, updated_at = $3 WHERE id = $4 AND user_id = $5 AND is_decoy = $6",
    [nonce, ciphertext, updatedAt, req.params.id, req.session!.userId, req.session!.isDecoy],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ updatedAt });
});

router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM documents WHERE id = $1 AND user_id = $2 AND is_decoy = $3", [
    req.params.id,
    req.session!.userId,
    req.session!.isDecoy,
  ]);
  res.json({});
});

export default router;
