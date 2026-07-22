ALTER TABLE app.workspace_members
  ADD COLUMN IF NOT EXISTS permissions jsonb;

ALTER TABLE app.workspace_members
  ADD CONSTRAINT workspace_members_permissions_object_check
  CHECK (permissions IS NULL OR jsonb_typeof(permissions) = 'object');
