import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

const repositoryRoot = resolve(process.cwd(), ".");
config({ path: resolve(repositoryRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const migrationsDir = resolve(
  repositoryRoot,
  existsSync(resolve(repositoryRoot, "backend/infra/migrations")) ? "backend/infra/migrations" : "infra/migrations"
);
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1
});

await pool.query(`
  CREATE SCHEMA IF NOT EXISTS app;
  CREATE TABLE IF NOT EXISTS app.schema_migrations (
    migration_name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

for (const migrationName of readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()) {
  const alreadyApplied = await pool.query("SELECT 1 FROM app.schema_migrations WHERE migration_name = $1", [
    migrationName
  ]);
  if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
    continue;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(resolve(migrationsDir, migrationName), "utf8"));
    await client.query("INSERT INTO app.schema_migrations (migration_name) VALUES ($1)", [migrationName]);
    await client.query("COMMIT");
    console.log(`Applied ${migrationName}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

await pool.end();
