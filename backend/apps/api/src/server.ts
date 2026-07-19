import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { registerAuthRoutes } from "./auth/fastify-auth-handler.js";
import { getSession } from "./auth/session.js";
import { registerApiRoutes } from "./domains/register-routes.js";
import { env } from "./env.js";
import { pool } from "./db/pool.js";

const app = Fastify({
  bodyLimit: 2 * 1024 * 1024,
  trustProxy: process.env.TRUST_PROXY === "true",
  logger: {
    level: env.nodeEnv === "production" ? "info" : "debug"
  },
  genReqId: (request) => {
    const header = request.headers["x-request-id"];
    const requestId = Array.isArray(header) ? header[0] : header;
    return requestId ?? crypto.randomUUID();
  }
});

app.addHook("onRequest", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'");
});

await app.register(fastifyCors, {
  origin: env.webOrigin.split(",").map((origin) => origin.trim()),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id"],
  maxAge: 86_400
});

registerAuthRoutes(app);
registerApiRoutes(app);

app.get("/health", async () => ({
  ok: true
}));

app.get("/ready", async () => ({
  ok: true,
  database: await checkDatabase()
}));

app.get("/api/config", async () => ({
  auth: {
    signUpEnabled: env.authSignupEnabled
  }
}));

app.get("/api/me", async (request) => {
  const session = await getSession(request);
  return {
    authenticated: Boolean(session),
    ...(session ? session : {})
  };
});

await app.listen({
  host: env.apiHost,
  port: env.apiPort
});

async function checkDatabase() {
  const result = await pool.query<{ migration_count: number }>(
    "SELECT count(*)::int AS migration_count FROM app.schema_migrations"
  );
  return {
    connected: true,
    migrationsApplied: result.rows[0]?.migration_count ?? 0
  };
}
