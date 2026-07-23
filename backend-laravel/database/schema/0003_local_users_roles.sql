CREATE TABLE app.user_profiles (
  user_id text PRIMARY KEY,
  handle citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  can_create_workspaces boolean NOT NULL DEFAULT false,
  can_manage_users boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.user_profiles (user_id, handle, display_name, can_create_workspaces, can_manage_users)
SELECT DISTINCT user_id, user_id::citext, user_id, true, true
FROM app.workspace_members
ON CONFLICT (user_id) DO NOTHING;

UPDATE app.workspace_members
SET role = 'admin'::app.workspace_role
WHERE role IN ('owner'::app.workspace_role, 'commenter'::app.workspace_role);

ALTER TABLE app.workspace_members
  ADD CONSTRAINT workspace_members_supported_role_check
  CHECK (role IN ('admin'::app.workspace_role, 'editor'::app.workspace_role, 'viewer'::app.workspace_role));

ALTER TABLE app.invitations
  ADD CONSTRAINT invitations_supported_role_check
  CHECK (role IN ('admin'::app.workspace_role, 'editor'::app.workspace_role, 'viewer'::app.workspace_role));
