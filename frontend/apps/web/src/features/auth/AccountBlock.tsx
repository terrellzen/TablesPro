import { useEffect, useState, type FormEvent } from "react";
import { Database, LogOut, UserRound } from "lucide-react";
import { mutate } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type { AuthUser, UserProfile } from "../../types/domain.js";

export function AccountBlock(props: {
  user: AuthUser;
  profile: UserProfile | null;
  apiServerUrl: string;
  onApiServerChange: (url: string) => Promise<void>;
  onProfileChange: (profile: UserProfile) => void;
  onLogout: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}) {
  const [serverDraft, setServerDraft] = useState(props.apiServerUrl);
  const [handleDraft, setHandleDraft] = useState(props.profile?.handle ?? "");
  const [serverStatus, setServerStatus] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    setServerDraft(props.apiServerUrl);
  }, [props.apiServerUrl]);

  useEffect(() => {
    setHandleDraft(props.profile?.handle ?? "");
  }, [props.profile?.handle]);

  async function saveServer() {
    try {
      await props.onApiServerChange(serverDraft);
      setServerStatus("Server updated");
    } catch (error) {
      setServerStatus(errorMessage(error));
    }
  }

  async function saveProfile() {
    try {
      const response = await mutate<{ data: UserProfile }>("/api/me/profile", {
        handle: handleDraft,
        displayName: props.user.name || props.user.email || handleDraft
      }, "PUT");
      props.onProfileChange(response.data);
      setServerStatus("User id updated");
    } catch (error) {
      setServerStatus(errorMessage(error));
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords do not match");
      return;
    }
    setPasswordSubmitting(true);
    setPasswordStatus("");
    const ok = await props.onChangePassword(currentPassword, newPassword);
    setPasswordSubmitting(false);
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      setPasswordStatus("");
    } else {
      setPasswordStatus("Failed to change password");
    }
  }

  return (
    <div className="account-stack">
      <div className="account-block">
        <UserRound size={16} />
        <div>
          <strong>{props.profile?.handle ? `@${props.profile.handle}` : props.user.name || props.user.email || "Signed in"}</strong>
          <span>{props.profile?.can_create_workspaces ? "Can create" : "Shared access only"}</span>
        </div>
        <button type="button" className="icon-button" onClick={() => void props.onLogout()} aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>

      <label className="stacked-field server-field">
        <span>User id</span>
        <input value={handleDraft} spellCheck={false} onChange={(event) => setHandleDraft(event.target.value)} />
      </label>
      <button type="button" className="small-button" onClick={() => void saveProfile()}>
        <UserRound size={15} />
        Save id
      </button>

      {!showPasswordForm ? (
        <button type="button" className="small-button" onClick={() => setShowPasswordForm(true)}>
          Change password
        </button>
      ) : (
        <form className="password-change-form" onSubmit={(event) => void submitPassword(event)}>
          <label className="stacked-field server-field">
            <span>Current password</span>
            <input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="stacked-field server-field">
            <span>New password</span>
            <input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <label className="stacked-field server-field">
            <span>Confirm new password</span>
            <input type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          <div className="inline-form">
            <button type="submit" className="small-button" disabled={passwordSubmitting || !currentPassword || !newPassword}>
              {passwordSubmitting ? "Saving" : "Save password"}
            </button>
            <button type="button" className="small-button" onClick={() => { setShowPasswordForm(false); setPasswordStatus(""); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>
              Cancel
            </button>
          </div>
          {passwordStatus && <span className="server-status">{passwordStatus}</span>}
        </form>
      )}

      <label className="stacked-field server-field">
        <span>API server</span>
        <input value={serverDraft} spellCheck={false} onChange={(event) => setServerDraft(event.target.value)} />
      </label>
      <button type="button" className="small-button" onClick={() => void saveServer()}>
        <Database size={15} />
        Switch
      </button>
      {serverStatus ? <span className="server-status">{serverStatus}</span> : null}
    </div>
  );
}
