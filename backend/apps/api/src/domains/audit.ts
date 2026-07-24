import { pool } from "../db/pool.js";

export type AuditInput = {
  workspaceId: string | null;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  outcome: "success" | "failure" | "denied";
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

export async function writeAuditEvent(input: AuditInput): Promise<void> {
  await pool.query(
    `
      INSERT INTO app.audit_events (
        workspace_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        request_id,
        ip_address,
        user_agent,
        outcome,
        diff,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9, $10::jsonb, $11::jsonb)
    `,
    [
      input.workspaceId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.requestId,
      input.ipAddress,
      input.userAgent,
      input.outcome,
      JSON.stringify(input.diff ?? {}),
      JSON.stringify(input.metadata ?? {})
    ]
  );
}
