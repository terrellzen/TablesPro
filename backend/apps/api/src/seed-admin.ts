import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { auth } from "./auth/auth.js";

const repositoryRoot = resolve(process.cwd(), ".");
config({ path: resolve(repositoryRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.ADMIN_PASSWORD ?? "admin1234";
const handle = process.env.ADMIN_HANDLE ?? "admin";
const displayName = process.env.ADMIN_DISPLAY_NAME ?? "Admin";

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  const existing = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM app.user_profiles");
  if (Number(existing.rows[0]?.count ?? "0") > 0) {
    console.log("Users already exist — skipping seed. Use the admin panel to create new users.");
    process.exit(0);
  }

  const result = await auth.api.signUpEmail({
    body: { name: displayName, email, password }
  });

  await client.query(
    `
      INSERT INTO app.user_profiles (user_id, handle, display_name, can_create_workspaces, can_manage_users)
      VALUES ($1, $2, $3, true, true)
    `,
    [result.user.id, handle, displayName]
  );

  const workspace = await client.query<{ workspace_id: string }>(
    `
      INSERT INTO app.workspaces (name, created_by, updated_by)
      VALUES ('My Workspace', $1, $1)
      RETURNING workspace_id
    `,
    [result.user.id]
  );
  const workspaceId = workspace.rows[0]?.workspace_id;

  if (workspaceId) {
    await client.query(
      `
        INSERT INTO app.workspace_members (workspace_id, user_id, role, created_by, updated_by)
        VALUES ($1, $2, 'admin', $2, $2)
      `,
      [workspaceId, result.user.id]
    );
  }

  console.log("");
  console.log("Admin user created successfully.");
  console.log("");
  console.log("  Email:    " + email);
  console.log("  Password: " + password);
  console.log("  Handle:   @" + handle);
  console.log("");
  console.log("You can now sign in at the application.");
  console.log("Change the default password after your first login.");
  console.log("");
} catch (error) {
  if (isDuplicateAccountError(error)) {
    console.log("A user with this email already exists — skipping seed.");
    process.exit(0);
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}

function isDuplicateAccountError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; body?: unknown };
  if (typeof candidate.message === "string" && candidate.message.includes("already exists")) return true;
  if (!candidate.body || typeof candidate.body !== "object") return false;
  const body = candidate.body as { message?: unknown };
  return typeof body.message === "string" && body.message.includes("already exists");
}
