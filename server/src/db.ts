import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Neon (and most managed Postgres free tiers) require TLS but hand out a
// certificate that isn't in Node's default trust store - relaxing
// verification here is standard for these providers' connection strings.
export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

export async function initSchema(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schema = readFileSync(path.join(here, "schema.sql"), "utf-8");
  await pool.query(schema);
}
