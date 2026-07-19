import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName, toPhysicalTableName } from "./index.js";

const repositoryRoot = process.env.INIT_CWD ?? resolve(process.cwd(), "../..");
config({ path: resolve(repositoryRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const userId = "dev-user";
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const workspace = await client.query<{ workspace_id: string }>(
    `
      INSERT INTO app.workspaces (name, created_by, updated_by)
      VALUES ('Development Workspace', $1, $1)
      RETURNING workspace_id
    `,
    [userId]
  );
  const workspaceId = requireSeedValue(workspace.rows[0]?.workspace_id, "workspace");

  await client.query(
    `
      INSERT INTO app.workspace_members (workspace_id, user_id, role, created_by, updated_by)
      VALUES ($1, $2, 'owner', $2, $2)
    `,
    [workspaceId, userId]
  );

  const base = await client.query<{ base_id: string }>(
    `
      INSERT INTO app.bases (workspace_id, name, created_by, updated_by)
      VALUES ($1, 'Launch Base', $2, $2)
      RETURNING base_id
    `,
    [workspaceId, userId]
  );
  const baseId = requireSeedValue(base.rows[0]?.base_id, "base");

  const tableId = randomUUID();
  const physicalTableName = toPhysicalTableName(tableId);
  await client.query(
    `
      INSERT INTO app.tables (table_id, base_id, name, physical_table_name, created_by, updated_by)
      VALUES ($1, $2, 'Customers', $3, $4, $4)
    `,
    [tableId, baseId, physicalTableName, userId]
  );
  await client.query(
    `
      CREATE TABLE ${quoteAppDataTable(tableId)} (
        record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text NOT NULL,
        row_version bigint NOT NULL DEFAULT 1,
        deleted_at timestamptz
      )
    `
  );

  const nameFieldId = randomUUID();
  const nameColumn = toPhysicalFieldName(nameFieldId);
  await client.query(
    `
      INSERT INTO app.fields (field_id, table_id, name, physical_column_name, field_type, position, created_by, updated_by)
      VALUES ($1, $2, 'Name', $3, 'short_text', 0, $4, $4)
    `,
    [nameFieldId, tableId, nameColumn, userId]
  );
  await client.query(`ALTER TABLE ${quoteAppDataTable(tableId)} ADD COLUMN ${quoteIdentifier(nameColumn)} text`);

  const amountFieldId = randomUUID();
  const amountColumn = toPhysicalFieldName(amountFieldId);
  await client.query(
    `
      INSERT INTO app.fields (field_id, table_id, name, physical_column_name, field_type, position, created_by, updated_by)
      VALUES ($1, $2, 'Amount', $3, 'currency', 1, $4, $4)
    `,
    [amountFieldId, tableId, amountColumn, userId]
  );
  await client.query(`ALTER TABLE ${quoteAppDataTable(tableId)} ADD COLUMN ${quoteIdentifier(amountColumn)} numeric`);

  await client.query(
    `
      INSERT INTO ${quoteAppDataTable(tableId)} (created_by, updated_by, ${quoteIdentifier(nameColumn)}, ${quoteIdentifier(amountColumn)})
      VALUES ($1, $1, 'Acme', 1200), ($1, $1, 'Globex', 800)
    `,
    [userId]
  );

  await client.query("COMMIT");
  console.log(JSON.stringify({ workspaceId, baseId, tableId, fields: { nameFieldId, amountFieldId } }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

function requireSeedValue(value: string | undefined, entity: string): string {
  if (!value) {
    throw new Error(`${entity} seed failed`);
  }
  return value;
}
