import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";
import type { QueryResult } from "pg";
import { calculateRetry, quoteAppDataTable, quoteIdentifier, sanitizeCsvCell } from "@tablespro/database";

const repositoryRoot = resolve(process.cwd(), ".");
config({ path: resolve(repositoryRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const workerId = process.env.WORKER_ID ?? `worker-${crypto.randomUUID()}`;
const runOnce = process.env.WORKER_RUN_ONCE === "true";
const exportDirectory = process.env.EXPORT_DIRECTORY ?? resolve(repositoryRoot, ".local/exports");
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

while (!stopping) {
  const job = await claimJob();
  if (!job) {
    if (runOnce) {
      break;
    }
    await sleep(1_000);
    continue;
  }

  try {
    await processJob(job);
    await markSucceeded(job.job_id);
  } catch (error) {
    await markFailed(job.job_id, job.attempt, job.max_attempts, error);
  }

  if (runOnce) {
    break;
  }
}

await pool.end();

async function claimJob() {
  const result = await pool.query<{
    job_id: string;
    job_type: string;
    payload: Record<string, unknown>;
    attempt: number;
    max_attempts: number;
  }>(
    `
      UPDATE app.background_jobs
      SET status = 'running',
          locked_at = now(),
          locked_by = $1,
          visibility_timeout_at = now() + interval '5 minutes',
          updated_at = now()
      WHERE job_id = (
        SELECT job_id
        FROM app.background_jobs
        WHERE status = 'queued'
          AND run_at <= now()
        ORDER BY run_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING job_id, job_type, payload, attempt, max_attempts
    `,
    [workerId]
  );

  return result.rows[0] ?? null;
}

async function processJob(job: { job_id: string; job_type: string; payload: Record<string, unknown> }): Promise<void> {
  switch (job.job_type) {
    case "csv_export":
      await processCsvExport(job);
      return;
    case "csv_import":
      throw new Error("CSV import worker is not implemented yet");
    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

async function processCsvExport(job: { job_id: string; payload: Record<string, unknown> }): Promise<void> {
  const tableId = readPayloadString(job.payload, "tableId");
  await mkdir(exportDirectory, { recursive: true });
  const outputPath = resolve(exportDirectory, `${job.job_id}.csv`);

  const fields = await pool.query<{
    field_id: string;
    name: string;
    physical_column_name: string;
  }>(
    `
      SELECT field_id, name, physical_column_name
      FROM app.fields
      WHERE table_id = $1 AND tombstoned_at IS NULL AND hidden = false
      ORDER BY position ASC, field_id ASC
    `,
    [tableId]
  );

  const columns = fields.rows.map((field) => quoteIdentifier(field.physical_column_name));
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  output.write(toCsvLine(["record_id", ...fields.rows.map((field) => field.name)]));

  let exportedRows = 0;
  let lastRecordId: string | null = null;
  for (;;) {
    const params: unknown[] = [];
    const keyset: string = lastRecordId ? "AND record_id > $1" : "";
    if (lastRecordId) {
      params.push(lastRecordId);
    }

    const records: QueryResult<Record<string, unknown>> = await pool.query(
      `
        SELECT record_id${columns.length > 0 ? `, ${columns.join(", ")}` : ""}
        FROM ${quoteAppDataTable(tableId)}
        WHERE deleted_at IS NULL
          ${keyset}
        ORDER BY record_id ASC
        LIMIT 1000
      `,
      params
    );

    if (records.rows.length === 0) {
      break;
    }

    for (const row of records.rows) {
      const recordId = readRowString(row, "record_id");
      output.write(
        toCsvLine([
          recordId,
          ...fields.rows.map((field) => row[field.physical_column_name])
        ])
      );
      exportedRows += 1;
      lastRecordId = recordId;
    }

    await pool.query("UPDATE app.export_jobs SET exported_rows = $2 WHERE job_id = $1", [job.job_id, exportedRows]);
  }

  await new Promise<void>((resolvePromise, reject) => {
    output.end((error: Error | null | undefined) => {
      if (error) {
        reject(error);
      } else {
        resolvePromise();
      }
    });
  });

  await pool.query(
    "UPDATE app.export_jobs SET status = 'succeeded', exported_rows = $2, output_path = $3 WHERE job_id = $1",
    [job.job_id, exportedRows, outputPath]
  );
}

async function markSucceeded(jobId: string): Promise<void> {
  await pool.query(
    `
      UPDATE app.background_jobs
      SET status = 'succeeded',
          locked_at = null,
          locked_by = null,
          visibility_timeout_at = null,
          updated_at = now()
      WHERE job_id = $1
    `,
    [jobId]
  );
}

async function markFailed(jobId: string, attempt: number, maxAttempts: number, error: unknown): Promise<void> {
  const retry = calculateRetry(attempt, maxAttempts);
  await pool.query(
    `
      UPDATE app.background_jobs
      SET status = $2,
          attempt = $3,
          run_at = COALESCE($4, run_at),
          locked_at = null,
          locked_by = null,
          visibility_timeout_at = null,
          last_error = $5,
          updated_at = now()
      WHERE job_id = $1
    `,
    [
      jobId,
      retry.shouldRetry ? "queued" : "dead_lettered",
      retry.nextAttempt,
      retry.nextRunAt,
      error instanceof Error ? error.message : "Unknown job failure"
    ]
  );
  await pool.query("UPDATE app.export_jobs SET status = $2 WHERE job_id = $1", [
    jobId,
    retry.shouldRetry ? "queued" : "failed"
  ]);
  await pool.query("UPDATE app.import_jobs SET status = $2 WHERE job_id = $1", [
    jobId,
    retry.shouldRetry ? "queued" : "failed"
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPayloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Job payload is missing ${key}`);
  }
  return value;
}

function readRowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Database row is missing ${key}`);
  }
  return value;
}

function toCsvLine(values: unknown[]): string {
  return `${values.map(formatCsvCell).join(",")}\n`;
}

function formatCsvCell(value: unknown): string {
  const text = sanitizeCsvCell(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}
