import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import type { CreateUserInput, UserProfile } from "../../types/domain.js";

export function CreateUserForm(props: {
  onCreateUser: (fields: CreateUserInput) => Promise<UserProfile | undefined>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [canCreateWorkspaces, setCanCreateWorkspaces] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const result = await props.onCreateUser({
      email: email.trim(),
      password,
      handle: handle.trim() || email.trim().split("@")[0] || "",
      displayName: displayName.trim() || email.trim().split("@")[0] || "",
      canCreateWorkspaces,
      canManageUsers
    });
    setSubmitting(false);
    if (result) {
      setEmail("");
      setPassword("");
      setHandle("");
      setDisplayName("");
      setCanCreateWorkspaces(false);
      setCanManageUsers(false);
    }
  }

  return (
    <form className="create-user-form" onSubmit={(event) => void submit(event)}>
      <label className="stacked-field">
        <span>Email</span>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="stacked-field">
        <span>Password</span>
        <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <label className="stacked-field">
        <span>Handle</span>
        <input value={handle} placeholder={email.trim().split("@")[0] || "auto from email"} onChange={(event) => setHandle(event.target.value)} />
      </label>
      <label className="stacked-field">
        <span>Display name</span>
        <input value={displayName} placeholder={email.trim().split("@")[0] || "auto from email"} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <div className="inline-form">
        <label>
          <input type="checkbox" checked={canCreateWorkspaces} onChange={(event) => setCanCreateWorkspaces(event.target.checked)} />
          Create workspaces
        </label>
        <label>
          <input type="checkbox" checked={canManageUsers} onChange={(event) => setCanManageUsers(event.target.checked)} />
          Manage users
        </label>
      </div>
      <button type="submit" className="small-button" disabled={submitting || !email.trim() || !password}>
        <UserPlus size={15} />
        {submitting ? "Creating" : "Create account"}
      </button>
    </form>
  );
}
