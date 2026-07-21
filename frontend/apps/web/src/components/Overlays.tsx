import type { ContextMenuItem, ModalEntity } from "../types/ui.js";

export function EntityModal(props: {
  entity: ModalEntity;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { entity } = props;
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="modal-title">{entity.mode === "rename" ? `Rename ${entity.type}` : `New ${entity.type}`}</h3>
        <input
          className="modal-input"
          autoFocus
          placeholder={entity.mode === "create" ? `Enter ${entity.type} name` : undefined}
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onConfirm();
            if (event.key === "Escape") props.onClose();
          }}
        />
        <div className="modal-actions">
          <button type="button" className="small-button" onClick={props.onClose}>Cancel</button>
          <button
            type="button"
            className="small-button primary"
            onClick={props.onConfirm}
            disabled={!props.value.trim() || (entity.mode === "rename" && props.value === entity.name)}
          >
            {entity.mode === "rename" ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContextMenu(props: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <div className="context-menu-overlay" onClick={props.onClose}>
      <div className="context-menu" style={{ left: props.x, top: props.y }} onClick={(event) => event.stopPropagation()}>
        {props.items.map((item, index) => item.divider ? (
          <div key={index} className="context-menu-divider" />
        ) : (
          <button
            key={index}
            type="button"
            className={`context-menu-item${item.className ? ` ${item.className}` : ""}`}
            onClick={() => { item.onClick(); props.onClose(); }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
