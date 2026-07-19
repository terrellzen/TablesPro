import type { FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

export async function getSession(request: FastifyRequest<any, any, any, any, any, any, any, any>) {
  return auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  });
}

export async function requireSession(request: FastifyRequest<any, any, any, any, any, any, any, any>) {
  const session = await getSession(request);
  if (!session) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return session;
}
