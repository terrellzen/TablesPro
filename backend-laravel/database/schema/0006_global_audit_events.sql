ALTER TABLE app.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_workspace_id_fkey;

ALTER TABLE app.audit_events
  ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE app.audit_events
  ADD CONSTRAINT audit_events_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES app.workspaces(workspace_id) ON DELETE SET NULL;
