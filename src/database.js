import { readFile } from "node:fs/promises";

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(192019)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const installed = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version=1",
    );
    if (!installed.rowCount) {
      const sql = await readFile(
        new URL("./migrations/001-initial.sql", import.meta.url),
        "utf8",
      );
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES(1)");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
