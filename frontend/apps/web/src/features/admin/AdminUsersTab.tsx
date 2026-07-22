import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Trash2, Users } from "lucide-react";
import { CreateUserForm } from "./CreateUserForm.js";
import type { AdminPanelProps } from "./AdminPanel.js";

type UsersTabProps = Pick<
  AdminPanelProps,
  "currentUser" | "profile" | "users" | "onChangeUserPermissions" |
  "onRemoveUser" | "onCreateUser" | "onChangeUserPassword"
>;

export function AdminUsersTab(props: UsersTabProps) {
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

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
          {props.users.map((user) => (
            <div className="user-row" key={user.user_id}>
              <div className="user-info">
                <strong>{user.display_name}</strong>
                <span>@{user.handle}</span>
                {user.user_id === props.currentUser.id && <span className="badge">You</span>}
              </div>
              <div className="user-actions">
                <label className="user-perm">
                  <input
                    type="checkbox"
                    checked={user.can_create_workspaces}
                    disabled={!props.profile?.can_manage_users || user.user_id === props.currentUser.id}
                    onChange={(event) => void props.onChangeUserPermissions(user, { can_create_workspaces: event.target.checked })}
                  />
                  Create
                </label>
                <label className="user-perm">
                  <input
                    type="checkbox"
                    checked={user.can_manage_users}
                    disabled={!props.profile?.can_manage_users || user.user_id === props.currentUser.id}
                    onChange={(event) => void props.onChangeUserPermissions(user, { can_manage_users: event.target.checked })}
                  />
                  Manage
                </label>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!props.profile?.can_manage_users}
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
                  disabled={!props.profile?.can_manage_users || user.user_id === props.currentUser.id}
                  onClick={() => void props.onRemoveUser(user)}
                  aria-label={`Disable ${user.handle}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
