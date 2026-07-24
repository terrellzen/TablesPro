import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Trash2, Users } from "lucide-react";
import { ASSIGNABLE_GLOBAL_ROLES, GLOBAL_ROLE_LABELS, type GlobalRole } from "../../types/domain.js";
import { CreateUserForm } from "./CreateUserForm.js";
import type { AdminPanelProps } from "./AdminPanel.js";

type UsersTabProps = Pick<
  AdminPanelProps,
  "currentUser" | "profile" | "users" | "onChangeUserRole" |
  "onRemoveUser" | "onCreateUser" | "onChangeUserPassword"
>;

export function AdminUsersTab(props: UsersTabProps) {
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const isOwner = props.profile?.role === "owner";
  const isAdmin = isOwner || props.profile?.role === "admin";

  function closePasswordForm() {
    setPasswordUserId(null);
    setAdminPassword("");
    setNewPassword("");
    setPasswordStatus("");
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordUserId) return;
    setPasswordSubmitting(true);
    setPasswordStatus("");
    const ok = await props.onChangeUserPassword(passwordUserId, adminPassword, newPassword);
    setPasswordSubmitting(false);
    if (ok) closePasswordForm();
    else setPasswordStatus("Failed — check your password");
  }

  function availableRoles(targetRole: GlobalRole): GlobalRole[] {
    if (isOwner) return ASSIGNABLE_GLOBAL_ROLES;
    if (isAdmin) return ["creator", "member"];
    return [];
  }

  function canModifyUser(target: { user_id: string; role: GlobalRole }): boolean {
    if (!isAdmin) return false;
    if (target.user_id === props.currentUser.id) return false;
    if (isOwner) return true;
    if (target.role === "owner" || target.role === "admin") return false;
    return true;
  }

  return (
    <div className="admin-page-content">
      <CreateUserForm onCreateUser={props.onCreateUser} />

      {passwordUserId && (
        <form className="password-change-form admin-password-form" onSubmit={(event) => void submitPassword(event)}>
          <div className="panel-heading inline-heading">
            <ShieldCheck size={15} />
            <span>Change password for @{props.users.find((user) => user.user_id === passwordUserId)?.handle ?? "user"}</span>
          </div>
          <label className="stacked-field">
            <span>Your password (admin verification)</span>
            <input type="password" required value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} />
          </label>
          <label className="stacked-field">
            <span>New password for user</span>
            <input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <div className="inline-form">
            <button type="submit" className="small-button" disabled={passwordSubmitting || !adminPassword || !newPassword}>
              {passwordSubmitting ? "Saving" : "Set password"}
            </button>
            <button type="button" className="small-button" onClick={closePasswordForm}>Cancel</button>
          </div>
          {passwordStatus && <span className="server-status">{passwordStatus}</span>}
        </form>
      )}

      <div className="admin-section">
        <div className="panel-heading inline-heading">
          <Users size={15} />
          <span>User directory</span>
          <span className="badge">{props.users.length}</span>
        </div>
        <div className="user-directory">
          {props.users.map((user) => {
            const modifiable = canModifyUser(user);
            const roles = availableRoles(user.role);
            return (
              <div className="user-row" key={user.user_id}>
                <div className="user-info">
                  <strong>{user.display_name}</strong>
                  <span>@{user.handle}</span>
                  <span className="badge">{GLOBAL_ROLE_LABELS[user.role]}</span>
                  {user.user_id === props.currentUser.id && <span className="badge">You</span>}
                </div>
                <div className="user-actions">
                  {roles.length > 0 ? (
                    <select
                      className="role-select"
                      value={user.role}
                      disabled={!modifiable}
                      onChange={(event) => void props.onChangeUserRole(user, event.target.value as GlobalRole)}
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>{GLOBAL_ROLE_LABELS[role]}</option>
                      ))}
                      {!roles.includes(user.role) && (
                        <option value={user.role} disabled>{GLOBAL_ROLE_LABELS[user.role]}</option>
                      )}
                    </select>
                  ) : (
                    <span className="role-badge">{GLOBAL_ROLE_LABELS[user.role]}</span>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    disabled={!isAdmin}
                    onClick={() => {
                      closePasswordForm();
                      setPasswordUserId(user.user_id);
                    }}
                    aria-label={`Change password for ${user.handle}`}
                  >
                    <KeyRound size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    disabled={!canModifyUser(user)}
                    onClick={() => void props.onRemoveUser(user)}
                    aria-label={`Disable ${user.handle}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
