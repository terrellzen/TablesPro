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
const table = await pool.query<{ table_id: string }>("SELECT table_id FROM app.tables ORDER BY created_at DESC LIMIT 1");
const tableId = table.rows[0]?.table_id;
if (!tableId) {
  throw new Error("No table is available for export");
}

const job = await pool.query<{ job_id: string }>(
  `
    INSERT INTO app.background_jobs (queue, job_type, payload, idempotency_key)
    VALUES ('exports', 'csv_export', $1::jsonb, $2)
    RETURNING job_id
  `,
  [JSON.stringify({ tableId }), `manual-export-test-${Date.now()}`]
);
const jobId = job.rows[0]?.job_id;
if (!jobId) {
  throw new Error("Export job insert failed");
}

await pool.query("INSERT INTO app.export_jobs (job_id, table_id) VALUES ($1, $2)", [jobId, tableId]);
console.log(JSON.stringify({ jobId, tableId }, null, 2));
await pool.end();
