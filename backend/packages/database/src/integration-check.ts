import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

const repositoryRoot = resolve(process.cwd(), ".");
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

const memberPermissionsColumn = await pool.query(`
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name = 'workspace_members'
    AND column_name = 'permissions'
`);

if (auditTrigger.rowCount !== 1) {
  throw new Error("Audit append-only trigger is missing");
}

if (memberPermissionsColumn.rowCount !== 1) {
  throw new Error("Workspace member permissions column is missing");
}

await pool.query(`
  SELECT b.base_id
  FROM app.bases b
  JOIN app.workspace_members wm ON wm.workspace_id = b.workspace_id
  WHERE b.deleted_at IS NULL
    AND (
      wm.permissions IS NULL
      OR wm.permissions->>'workspace' IS NOT NULL
      OR wm.permissions->'bases' ? b.base_id::text
      OR EXISTS (
        SELECT 1 FROM app.tables t
        WHERE t.base_id = b.base_id AND wm.permissions->'tables' ? t.table_id::text
      )
    )
  LIMIT 1
`);

console.log(JSON.stringify({
  metadata: metadata.rows[0],
  auditAppendOnlyTrigger: true,
  memberPermissionsColumn: true
}, null, 2));
await pool.end();
