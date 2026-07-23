import { useState, type ReactNode } from "react";
import { Database, History, ShieldCheck, Users, X } from "lucide-react";
import type {
  AdminWorkspace, AuditEvent, AuthUser, CreateUserInput, UserProfile, Workspace
} from "../../types/domain.js";
import { AdminAuditTab } from "./AdminAuditTab.js";
import { AdminDatabaseTab } from "./AdminDatabaseTab.js";
import { AdminUsersTab } from "./AdminUsersTab.js";

export type AdminPanelProps = {
  onClose: () => void;
  currentUser: AuthUser;
  profile: UserProfile | null;
  users: UserProfile[];
  auditEvents: AuditEvent[];
  adminWorkspaces: AdminWorkspace[];
  workspaces: Workspace[];
  onLoadAdminAuditEvents: (
    workspaceId: string | null,
    baseId: string | null,
    tableId: string | null
  ) => Promise<void>;
  onChangeUserPermissions: (
    user: UserProfile,
    patch: Partial<Pick<UserProfile, "can_create_workspaces" | "can_manage_users">>
  ) => Promise<void>;
  onRemoveUser: (user: UserProfile) => Promise<void>;
  onCreateUser: (fields: CreateUserInput) => Promise<UserProfile | undefined>;
  onChangeUserPassword: (
    userId: string,
    adminPassword: string,
    newPassword: string
  ) => Promise<boolean>;
};

type AdminTab = "users" | "audit" | "database";

export function AdminPanel(props: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>("users");

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <ShieldCheck size={20} />
        <h2>Administration</h2>
        <button
          type="button"
          className="icon-button admin-close-button"
          onClick={props.onClose}
          aria-label="Close administration"
          title="Close administration"
        >
          <X size={18} />
        </button>
      </div>
      <div className="admin-tabs" role="tablist">
        <AdminTabButton tab="users" activeTab={tab} onSelect={setTab} icon={<Users size={15} />}>
          Users
        </AdminTabButton>
        <AdminTabButton tab="audit" activeTab={tab} onSelect={setTab} icon={<History size={15} />}>
          Audit log
        </AdminTabButton>
        <AdminTabButton tab="database" activeTab={tab} onSelect={setTab} icon={<Database size={15} />}>
          Database
        </AdminTabButton>
      </div>

      {tab === "users" && <AdminUsersTab {...props} />}
      {tab === "audit" && <AdminAuditTab {...props} />}
      {tab === "database" && <AdminDatabaseTab />}
    </section>
  );
}

function AdminTabButton(props: {
  tab: AdminTab;
  activeTab: AdminTab;
  onSelect: (tab: AdminTab) => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.activeTab === props.tab}
      className={props.activeTab === props.tab ? "active" : ""}
      onClick={() => props.onSelect(props.tab)}
    >
      {props.icon}
      {props.children}
    </button>
  );
}
