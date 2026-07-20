import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../backend/node_modules/dotenv/lib/main.js";
import pg from "../backend/node_modules/pg/lib/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../backend/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in backend/.env");
}

const TOTAL_ROWS = 100_000;
const BATCH_SIZE = 5_000;

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();

function toPhysicalTableName(uuid) {
  return `records_${uuid.replaceAll("-", "").toLowerCase()}`;
}

function toPhysicalFieldName(uuid) {
  return `f_${uuid.replaceAll("-", "").toLowerCase()}`;
}

function quoteIdent(id) {
  return `"${id}"`;
}

function quoteTable(uuid) {
  return `app_data.${quoteIdent(toPhysicalTableName(uuid))}`;
}

const userId = (await client.query('SELECT id FROM auth."user" LIMIT 1')).rows[0]?.id;
if (!userId) {
  throw new Error("No user found — run seed-admin first");
}

const start = performance.now();
console.log(`Seeding ${TOTAL_ROWS.toLocaleString()} rows...`);

await client.query("BEGIN");

try {
  // --- workspace ---
  const { rows: wsRows } = await client.query(
    `INSERT INTO app.workspaces (name, created_by, updated_by)
     VALUES ('100k test', $1, $1) RETURNING workspace_id`,
    [userId]
  );
  const workspaceId = wsRows[0].workspace_id;

  await client.query(
    `INSERT INTO app.workspace_members (workspace_id, user_id, role, created_by, updated_by)
     VALUES ($1, $2, 'admin', $2, $2)`,
    [workspaceId, userId]
  );

  // --- base ---
  const { rows: baseRows } = await client.query(
    `INSERT INTO app.bases (workspace_id, name, created_by, updated_by)
     VALUES ($1, '100k base', $2, $2) RETURNING base_id`,
    [workspaceId, userId]
  );
  const baseId = baseRows[0].base_id;

  // --- table ---
  const tableId = randomUUID();
  const physicalTable = toPhysicalTableName(tableId);
  await client.query(
    `INSERT INTO app.tables (table_id, base_id, name, physical_table_name, created_by, updated_by)
     VALUES ($1, $2, 'Records', $3, $4, $4)`,
    [tableId, baseId, physicalTable, userId]
  );

  await client.query(`
    CREATE TABLE ${quoteTable(tableId)} (
      record_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  text        NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  text        NOT NULL,
      row_version bigint      NOT NULL DEFAULT 1,
      deleted_at  timestamptz
    )
  `);

  // --- fields ---
  const fields = [
    { name: "Name",     type: "short_text",     col: "text"      },
    { name: "Email",    type: "email",           col: "text"      },
    { name: "Amount",   type: "currency",        col: "numeric"   },
    { name: "Active",   type: "boolean",         col: "boolean"   },
    { name: "Category", type: "single_select",   col: "text"      },
  ];

  const fieldIds = [];
  for (let i = 0; i < fields.length; i++) {
    const fid = randomUUID();
    const col = toPhysicalFieldName(fid);
    fieldIds.push({ fieldId: fid, column: col, ...fields[i] });

    await client.query(
      `INSERT INTO app.fields (field_id, table_id, name, physical_column_name, field_type, position, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [fid, tableId, fields[i].name, col, fields[i].type, i, userId]
    );
    await client.query(`ALTER TABLE ${quoteTable(tableId)} ADD COLUMN ${quoteIdent(col)} ${fields[i].col}`);
  }

  const columns = fieldIds.map((f) => quoteIdent(f.column)).join(", ");

  // --- batch insert ---
  const categories = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];

  for (let offset = 0; offset < TOTAL_ROWS; offset += BATCH_SIZE) {
    const batch = Math.min(BATCH_SIZE, TOTAL_ROWS - offset);
    const valueClauses = [];
    const params = [];

    for (let i = 0; i < batch; i++) {
      const row = offset + i;
      const idx = params.length;
      valueClauses.push(
        `($${idx + 1}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`
      );
      params.push(
        userId,
        `User ${row}`,
        `user${row}@example.com`,
        Math.round(Math.random() * 100000) / 100,
        row % 3 !== 0,
        categories[row % categories.length],
      );
    }

    await client.query(
      `INSERT INTO ${quoteTable(tableId)} (created_by, updated_by, ${columns})
       VALUES ${valueClauses.join(", ")}`,
      params
    );

    const pct = Math.round(((offset + batch) / TOTAL_ROWS) * 100);
    process.stdout.write(`\r  ${pct}%  (${(offset + batch).toLocaleString()} rows)`);
  }

  await client.query("COMMIT");
  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`\n\nDone in ${elapsed}s`);
  console.log(`  Workspace: ${workspaceId}`);
  console.log(`  Base:      ${baseId}`);
  console.log(`  Table:     ${tableId}`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
