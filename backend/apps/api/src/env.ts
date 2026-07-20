import { resolve } from "node:path";
import { config } from "dotenv";

const repositoryRoot = resolve(process.cwd(), ".");
config({ path: resolve(repositoryRoot, ".env") });

type Env = {
  nodeEnv: "development" | "test" | "production";
  apiHost: string;
  apiPort: number;
  webOrigin: string;
  databaseUrl: string;
  betterAuthUrl: string;
  betterAuthSecret: string;
  authSignupEnabled: boolean;
};

export const env: Env = {
  nodeEnv: readNodeEnv("NODE_ENV", "development"),
  apiHost: readString("API_HOST", "0.0.0.0"),
  apiPort: readPort("API_PORT", 4000),
  webOrigin: readString("WEB_ORIGIN", "http://localhost:3000"),
  databaseUrl: readRequired("DATABASE_URL"),
  betterAuthUrl: readString("BETTER_AUTH_URL", "http://localhost:4000"),
  betterAuthSecret: readRequired("BETTER_AUTH_SECRET"),
  authSignupEnabled: readBoolean("AUTH_SIGNUP_ENABLED", true)
};

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readString(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

function readNodeEnv(name: string, fallback: Env["nodeEnv"]): Env["nodeEnv"] {
  const value = process.env[name] ?? fallback;
  if (value !== "development" && value !== "test" && value !== "production") {
    throw new Error(`${name} must be development, test, or production`);
  }
  return value;
}
