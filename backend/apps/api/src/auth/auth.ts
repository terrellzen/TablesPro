import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { ac, organizationRoles } from "@tablespro/permissions/better-auth";
import { pool } from "../db/pool.js";
import { env } from "../env.js";

export const auth = betterAuth({
  appName: "TablesPro",
  baseURL: env.betterAuthUrl,
  secret: env.betterAuthSecret,
  trustedOrigins: env.webOrigin.split(",").map((origin) => origin.trim()),
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.nodeEnv === "production"
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24
  },
  plugins: [
    organization({
      ac,
      roles: organizationRoles,
      creatorRole: "owner",
      invitationExpiresIn: 60 * 60 * 24 * 7
    })
  ],
  experimental: {
    joins: true
  }
});

export type Auth = typeof auth;
