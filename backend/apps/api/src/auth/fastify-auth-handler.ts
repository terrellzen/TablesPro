import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { env } from "../env.js";

export function registerAuthRoutes(app: FastifyInstance): void {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
        if (!env.authSignupEnabled && url.pathname.startsWith("/api/auth/sign-up/")) {
          return reply.status(403).send({
            code: "SIGNUP_DISABLED",
            message: "Account signup is disabled on this server"
          });
        }

        const body = request.body === undefined ? undefined : JSON.stringify(request.body);
        const requestInit: RequestInit = {
          method: request.method,
          headers: fromNodeHeaders(request.headers)
        };

        if (body !== undefined) {
          requestInit.body = body;
        }

        const authRequest = new Request(url.toString(), requestInit);

        const response = await auth.handler(authRequest);
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));

        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        request.log.error({ error }, "Better Auth request failed");
        return reply.status(500).send({
          code: "AUTH_FAILURE",
          message: "Authentication request failed"
        });
      }
    }
  });
}
