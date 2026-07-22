import type { AccessLevel } from "../../types/domain.js";
import { accessLevels, rank } from "./permissionModel.js";

export function PermissionControl(props: {
  label: string;
  description: string;
  inherited: AccessLevel | null;
  direct: AccessLevel | null;
  onChange: (level: AccessLevel | null) => void;
}) {
  const inheritedRank = rank(props.inherited);
  const direct = rank(props.direct) > inheritedRank ? props.direct : null;
  return (
    <label className="permission-control">
      <span className="permission-copy">
        <strong>{props.label}</strong>
        <small>{props.description}</small>
        <em className={props.direct ? "direct-access" : "inherited-access"}>
          {direct ? `Assigned directly: ${capitalize(direct)}`
            : props.inherited ? `Inherited: ${capitalize(props.inherited)}` : "Not assigned"}
        </em>
      </span>
      <select
        value={direct ?? ""}
        onChange={(event) => props.onChange((event.target.value || null) as AccessLevel | null)}
      >
        <option value="">{props.inherited ? `Inherited ${capitalize(props.inherited)}` : "No access"}</option>
        {accessLevels.map((level) => (
          <option key={level} value={level} disabled={rank(level) <= inheritedRank}>
            {capitalize(level)}{rank(level) <= inheritedRank ? " (inherited)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
