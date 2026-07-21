import { ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { RoleSelect } from "../../components/RoleSelect.js";
import type { AuthUser, UserProfile, WorkspaceMember, WorkspaceRole } from "../../types/domain.js";

export function RightRail(props: {
  currentUser: AuthUser;
  profile: UserProfile | null;
  members: WorkspaceMember[];
  directUserId: string;
  directRole: WorkspaceRole;
  onDirectUserIdChange: (value: string) => void;
  onDirectRoleChange: (value: WorkspaceRole) => void;
  onAddDirectMember: () => Promise<void>;
  onChangeRole: (member: WorkspaceMember, role: WorkspaceRole) => Promise<void>;
  onRemoveMember: (member: WorkspaceMember) => Promise<void>;
}) {
  return (
    <aside className="right-rail" aria-label="Workspace members">
      <section className="admin-panel">
        <div className="panel-heading">
          <ShieldCheck size={16} />
          <span>Workspace members</span>
        </div>

        <div className="admin-section">
          <label className="stacked-field">
            <span>User id or handle</span>
            <input value={props.directUserId} onChange={(event) => props.onDirectUserIdChange(event.target.value)} />
          </label>
          <div className="inline-form">
            <RoleSelect value={props.directRole} onChange={props.onDirectRoleChange} />
            <button type="button" className="small-button" onClick={() => props.onDirectUserIdChange(props.profile?.handle ?? props.currentUser.id)}>
              <UserRound size={15} />
              Me
            </button>
            <button type="button" className="small-button" onClick={() => void props.onAddDirectMember()}>
              <Users size={15} />
              Add
            </button>
          </div>
        </div>

        <div className="member-list">
          {props.members.map((member) => (
            <div className="member-row" key={member.user_id}>
              <div>
                <strong>{member.handle ? `@${member.handle}` : member.user_id}</strong>
                <span>{new Date(member.updated_at).toLocaleDateString()}</span>
              </div>
              <RoleSelect value={member.role} onChange={(role) => void props.onChangeRole(member, role)} />
              <button
                type="button"
                className="icon-button danger"
                onClick={() => void props.onRemoveMember(member)}
                aria-label={`Remove ${member.user_id}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

      </section>
    </aside>
  );
}

