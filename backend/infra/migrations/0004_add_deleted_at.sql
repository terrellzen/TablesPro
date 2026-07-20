ALTER TABLE app.bases ADD COLUMN deleted_at timestamptz;
ALTER TABLE app.workspaces ADD COLUMN deleted_at timestamptz;
