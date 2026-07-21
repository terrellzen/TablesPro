import type { WorkspaceRole } from "../types/domain.js";

export function RoleSelect(props: { value: WorkspaceRole; onChange: (value: WorkspaceRole) => void }) {
  return (
    <select className="role-select" value={props.value} onChange={(event) => props.onChange(event.target.value as WorkspaceRole)}>
      <option value="viewer">Viewer</option>
      <option value="editor">Editor</option>
      <option value="admin">Admin</option>
    </select>
  );
}
