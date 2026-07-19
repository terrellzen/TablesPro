import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

const repositoryRoot = process.env.INIT_CWD ?? resolve(process.cwd(), "../..");
config({ path: resolve(repositoryRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

const metadata = await pool.query(`
  SELECT
    (SELECT count(*)::int FROM app.workspaces) AS workspace_count,
    (SELECT count(*)::int FROM app.bases) AS base_count,
    (SELECT count(*)::int FROM app.tables) AS table_count,
    (SELECT count(*)::int FROM app.fields) AS field_count
`);

const auditTrigger = await pool.query(`
  SELECT tgname
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname = 'audit_events_append_only'
    AND tgrelid = 'app.audit_events'::regclass
`);

if (auditTrigger.rowCount !== 1) {
  throw new Error("Audit append-only trigger is missing");
}

console.log(JSON.stringify({ metadata: metadata.rows[0], auditAppendOnlyTrigger: true }, null, 2));
await pool.end();
