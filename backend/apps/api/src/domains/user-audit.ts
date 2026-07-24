import { writeAuditEvent } from "./audit.js";

export type AuditedUser = {
  user_id: string;
  handle: string;
  display_name: string;
};

export async function writeUserAudit(input: {
  actorUserId: string;
  requestId: string;
  action: "user.create" | "user.update" | "user.disable" | "user.password_reset" | "user.password_change";
  target: AuditedUser;
  diff?: Record<string, { before: unknown; after: unknown }>;
}): Promise<void> {
  await writeAuditEvent({
    workspaceId: null,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "user",
    entityId: input.target.user_id,
    requestId: input.requestId,
    outcome: "success",
    metadata: {
      name: input.target.display_name,
      handle: input.target.handle,
      targetUserId: input.target.user_id
    },
    diff: input.diff
  });
}
