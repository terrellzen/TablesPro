import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  MemberPermissions, PermissionResources, Workspace, WorkspaceMember
} from "../../types/domain.js";
import { PermissionEditor } from "./PermissionEditor.js";
import {
  accessSummary, isDestructive, permissionsForMember
} from "./permissionModel.js";

export function WorkspaceMembersDialog(props: {
  workspace: Workspace;
  currentUserId: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onSave: (userId: string, permissions: MemberPermissions, existing: boolean, confirmDestructive: boolean) => Promise<boolean>;
  onRemove: (member: WorkspaceMember) => Promise<void>;
}) {
  const [resources, setResources] = useState<PermissionResources>({ bases: [], tables: [] });
  const [resourceError, setResourceError] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [userId, setUserId] = useState("");
  const [permissions, setPermissions] = useState<MemberPermissions>(() => permissionsForMember());

  useEffect(() => {
    void api<{ data: PermissionResources }>(`/api/workspaces/${props.workspace.workspace_id}/permission-resources`)
      .then((response) => setResources(response.data))
      .catch(() => setResourceError("Could not load bases and tables. Close this dialog and try again."));
  }, [props.workspace.workspace_id]);

  const editingMember = editingId && editingId !== "new"
    ? props.members.find((member) => member.user_id === editingId)
    : undefined;

  function beginEdit(member?: WorkspaceMember) {
    setEditingId(member?.user_id ?? "new");
    setUserId(member?.handle ? `@${member.handle}` : member?.user_id ?? "");
    setPermissions(permissionsForMember(member));
    if (member) {
      void api<{ data: WorkspaceMember[] }>(`/api/workspaces/${props.workspace.workspace_id}/members`)
        .then((response) => {
          const fresh = response.data.find((m) => m.user_id === member.user_id);
          if (fresh) setPermissions(permissionsForMember(fresh));
        })
        .catch(() => {});
    }
  }

  async function save() {
    const destructive = isDestructive(permissions);
    if (destructive && !window.confirm("These permissions allow destructive actions such as deleting records, tables, bases, or the workspace. Grant them?")) return;
    const saved = await props.onSave(editingMember?.user_id ?? userId, permissions, Boolean(editingMember), destructive);
    if (saved) setEditingId(null);
  }

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="members-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="members-dialog-header">
          <div><ShieldCheck size={18} /><div><h3>Workspace members</h3><span>{props.workspace.name}</span></div></div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close"><X size={16} /></button>
        </header>
        {editingId ? (
          <div className="member-editor-view">
            <label className="stacked-field">
              <span>User id or handle</span>
              <input value={userId} disabled={Boolean(editingMember)} onChange={(event) => setUserId(event.target.value)} />
            </label>
            {resourceError && <p className="permission-error">{resourceError}</p>}
            <PermissionEditor permissions={permissions} bases={resources.bases} tables={resources.tables} onChange={setPermissions} />
            <div className="access-summary"><strong>Access summary</strong><span>{accessSummary(permissions, resources.bases, resources.tables)}</span></div>
            <footer className="members-dialog-actions">
              <button type="button" className="small-button" onClick={() => setEditingId(null)}>Back</button>
              <button type="button" className="small-button primary" disabled={!userId.trim() || Boolean(resourceError)} onClick={() => void save()}>Save permissions</button>
            </footer>
          </div>
        ) : (
          <div className="member-list-view">
            <button type="button" className="small-button primary add-member-button" onClick={() => beginEdit()}><UserPlus size={15} /> Add member</button>
            <div className="member-list">
              {props.members.map((member) => (
                <div className="member-row" key={member.user_id}>
                  <div><strong>{member.handle ? `@${member.handle}` : member.user_id}</strong><span>{accessSummary(permissionsForMember(member), resources.bases, resources.tables)}</span></div>
                  <button type="button" className="small-button" disabled={member.user_id === props.currentUserId} onClick={() => beginEdit(member)}>Permissions</button>
                  <button type="button" className="icon-button danger" disabled={member.user_id === props.currentUserId} onClick={() => void props.onRemove(member)} aria-label={`Remove ${member.user_id}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
