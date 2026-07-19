import type { FastifyInstance } from "fastify";
import { registerWorkspaceRoutes } from "./workspaces.js";
import { registerBaseRoutes } from "./bases.js";
import { registerTableRoutes } from "./tables.js";
import { registerRecordRoutes } from "./records.js";
import { registerAuditRoutes } from "./audit-routes.js";
import { registerViewRoutes } from "./views.js";
import { registerFieldGroupRoutes } from "./field-groups.js";
import { registerImportExportRoutes } from "./import-export.js";
import { registerMembershipRoutes } from "./memberships.js";
import { registerUserRoutes } from "./users.js";

export function registerApiRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  registerUserRoutes(app);
  registerWorkspaceRoutes(app);
  registerMembershipRoutes(app);
  registerBaseRoutes(app);
  registerTableRoutes(app);
  registerFieldGroupRoutes(app);
  registerViewRoutes(app);
  registerRecordRoutes(app);
  registerImportExportRoutes(app);
  registerAuditRoutes(app);
}
