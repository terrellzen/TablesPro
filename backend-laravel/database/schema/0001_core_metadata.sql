CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TYPE app.workspace_role AS ENUM ('owner', 'admin', 'editor', 'commenter', 'viewer');
CREATE TYPE app.field_type AS ENUM (
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'currency',
  'percentage',
  'boolean',
  'date',
  'timestamp_tz',
  'single_select',
  'multiple_select',
  'email',
  'url',
  'phone',
  'user_reference'
);
CREATE TYPE app.job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'dead_lettered', 'cancelled');
CREATE TYPE app.audit_outcome AS ENUM ('success', 'failure', 'denied');

CREATE TABLE app.workspaces (
  workspace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_organization_id text UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1
);

CREATE TABLE app.workspace_members (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(workspace_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role app.workspace_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE app.invitations (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES app.workspaces(workspace_id) ON DELETE CASCADE,
  email citext NOT NULL,
  role app.workspace_role NOT NULL,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE TABLE app.bases (
  base_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES app.workspaces(workspace_id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1
);

CREATE TABLE app.tables (
  table_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL REFERENCES app.bases(base_id) ON DELETE CASCADE,
  name text NOT NULL,
  physical_table_name name NOT NULL UNIQUE,
  primary_display_field_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  deleted_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1
);

CREATE TABLE app.field_groups (
  field_group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  parent_field_group_id uuid REFERENCES app.field_groups(field_group_id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL,
  collapsed boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.fields (
  field_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  field_group_id uuid REFERENCES app.field_groups(field_group_id) ON DELETE SET NULL,
  name text NOT NULL,
  physical_column_name name NOT NULL,
  field_type app.field_type NOT NULL,
  position integer NOT NULL,
  width integer NOT NULL DEFAULT 180,
  pinned boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  indexed boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  tombstoned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1,
  UNIQUE (table_id, physical_column_name)
);

ALTER TABLE app.tables
  ADD CONSTRAINT tables_primary_display_field_fk
  FOREIGN KEY (primary_display_field_id) REFERENCES app.fields(field_id) ON DELETE SET NULL;

CREATE TABLE app.saved_views (
  saved_view_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  name text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  search text,
  visible_field_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  field_order uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  field_widths jsonb NOT NULL DEFAULT '{}'::jsonb,
  frozen_field_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  collapsed_field_group_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  density text NOT NULL DEFAULT 'comfortable',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.saved_view_filters (
  saved_view_filter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_view_id uuid NOT NULL REFERENCES app.saved_views(saved_view_id) ON DELETE CASCADE,
  filter_ast jsonb NOT NULL
);

CREATE TABLE app.saved_view_sorts (
  saved_view_sort_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_view_id uuid NOT NULL REFERENCES app.saved_views(saved_view_id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES app.fields(field_id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('asc', 'desc')),
  position integer NOT NULL
);

CREATE TABLE app.base_permission_overrides (
  base_permission_override_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL REFERENCES app.bases(base_id) ON DELETE CASCADE,
  subject_user_id text,
  subject_role app.workspace_role,
  role_override app.workspace_role,
  allow_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  deny_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  CHECK (subject_user_id IS NOT NULL OR subject_role IS NOT NULL)
);

CREATE TABLE app.table_permission_overrides (
  table_permission_override_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  subject_user_id text,
  subject_role app.workspace_role,
  role_override app.workspace_role,
  allow_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  deny_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  CHECK (subject_user_id IS NOT NULL OR subject_role IS NOT NULL)
);

CREATE TABLE app.audit_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES app.workspaces(workspace_id) ON DELETE CASCADE,
  actor_user_id text,
  impersonator_user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  job_id uuid,
  ip_address inet,
  user_agent text,
  outcome app.audit_outcome NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION app.prevent_audit_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON app.audit_events
FOR EACH ROW EXECUTE FUNCTION app.prevent_audit_event_mutation();

CREATE TABLE app.background_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  job_type text NOT NULL,
  status app.job_status NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL,
  idempotency_key text,
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  visibility_timeout_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue, idempotency_key)
);

CREATE TABLE app.schema_change_jobs (
  schema_change_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES app.background_jobs(job_id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  operation text NOT NULL,
  resumable_state jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE app.import_jobs (
  import_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES app.background_jobs(job_id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  status app.job_status NOT NULL DEFAULT 'queued',
  total_rows bigint,
  processed_rows bigint NOT NULL DEFAULT 0,
  error_report_path text
);

CREATE TABLE app.export_jobs (
  export_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES app.background_jobs(job_id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES app.tables(table_id) ON DELETE CASCADE,
  status app.job_status NOT NULL DEFAULT 'queued',
  exported_rows bigint NOT NULL DEFAULT 0,
  output_path text
);

CREATE INDEX workspace_members_user_id_idx ON app.workspace_members(user_id);
CREATE INDEX bases_workspace_id_idx ON app.bases(workspace_id);
CREATE INDEX tables_base_id_idx ON app.tables(base_id);
CREATE INDEX fields_table_id_position_idx ON app.fields(table_id, position);
CREATE INDEX saved_views_table_id_idx ON app.saved_views(table_id);
CREATE INDEX audit_events_workspace_time_idx ON app.audit_events(workspace_id, occurred_at DESC);
CREATE INDEX background_jobs_claim_idx ON app.background_jobs(queue, status, run_at, visibility_timeout_at);
