export type ThemePreference = "light" | "dark" | "system";
export type WorkspaceRole = "admin" | "editor" | "viewer";
export type WorkspaceAccessRole = WorkspaceRole | "restricted";
export type AccessLevel = "read" | "edit" | "admin";

export type Workspace = {
  workspace_id: string;
  name: string;
  role: WorkspaceAccessRole;
};

export type Base = {
  base_id: string;
  workspace_id: string;
  name: string;
};

export type AppTable = {
  table_id: string;
  base_id: string;
  name: string;
};

export type FieldType =
  | "short_text"
  | "long_text"
  | "integer"
  | "decimal"
  | "currency"
  | "percentage"
  | "boolean"
  | "date"
  | "timestamp_tz"
  | "single_select"
  | "multiple_select"
  | "email"
  | "url"
  | "phone"
  | "user_reference";

export type Field = {
  field_id: string;
  name: string;
  physical_column_name: string;
  field_type: FieldType;
  width: number;
  hidden: boolean;
  pinned: boolean;
  options: FieldOptions;
};

export type FieldOptions = {
  choiceColors?: Record<string, string>;
};

export type RecordRow = {
  record_id: string;
  row_version: string;
  [key: string]: unknown;
};

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "is_empty"
  | "is_not_empty"
  | "is_any_of";

export type FilterRule = {
  kind: "rule";
  fieldId: string;
  operator: FilterOperator;
  value: string;
};

export type FilterExpression =
  | {
      kind: "rule";
      fieldId: string;
      operator: FilterOperator;
      value?: unknown;
    }
  | {
      kind: "group";
      conjunction: "and" | "or";
      children: FilterExpression[];
    };

export type RecordSort = {
  fieldId: string;
  direction: "asc" | "desc";
};

export type SavedView = {
  saved_view_id: string;
  name: string;
  is_shared: boolean;
  search: string | null;
  visible_field_ids: string[];
  field_order: string[];
  filters: FilterExpression[];
  sorts: { field_id: string; direction: string }[];
};

export type AuditEvent = {
  event_id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_handle: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  request_id: string | null;
  job_id: string | null;
  outcome: string;
  occurred_at: string;
  diff: Record<string, { before: unknown; after: unknown }>;
  metadata: Record<string, unknown>;
  base_id: string | null;
  base_name: string | null;
  table_id: string | null;
  table_name: string | null;
};

export type AdminWorkspace = {
  workspace_id: string;
  name: string;
  created_at: string;
  member_count: number;
};

export type AdminBase = { base_id: string; name: string };
export type AdminTable = { table_id: string; name: string };
export type MemberPermissions = {
  workspace: AccessLevel | null;
  bases: Record<string, AccessLevel>;
  tables: Record<string, { table?: AccessLevel; record?: AccessLevel }>;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  role: WorkspaceRole;
  permissions: MemberPermissions | null;
  created_at: string;
  updated_at: string;
};

export type PermissionResources = {
  bases: Base[];
  tables: AppTable[];
};

export type PageEnvelope<T> = {
  data: T[];
  page?: { nextCursor: string | null; hasMore: boolean };
};

export type Status = { tone: "idle" | "success" | "danger"; text: string };

export type GlobalRole = "owner" | "admin" | "creator" | "member";

export type AuthUser = { id: string; name?: string | null; email?: string | null };

export type UserProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  role: GlobalRole;
  disabled_at: string | null;
};

export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  owner: "Owner",
  admin: "Admin",
  creator: "Creator",
  member: "Member",
};

export const ASSIGNABLE_GLOBAL_ROLES: GlobalRole[] = ["admin", "creator", "member"];

export type CreateUserInput = {
  email: string;
  password: string;
  handle: string;
  displayName: string;
  role: GlobalRole;
};

export type AuthEnvelope = { user?: AuthUser; profile?: UserProfile | null };
export type AppConfig = { auth: { signUpEnabled: boolean } };
