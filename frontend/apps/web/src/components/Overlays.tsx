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
        <ContextMenuItems items={props.items} onSelect={props.onClose} />
      </div>
    </div>
  );
}

function ContextMenuItems(props: { items: ContextMenuItem[]; onSelect: () => void }) {
  return props.items.map((item, index) => item.divider ? (
    <div key={index} className="context-menu-divider" />
  ) : (
    <div key={`${item.label}:${index}`} className={`context-menu-entry${item.children ? " has-submenu" : ""}`}>
      <button
        type="button"
        className={`context-menu-item${item.className ? ` ${item.className}` : ""}`}
        aria-haspopup={item.children ? "menu" : undefined}
        onClick={() => {
          if (!item.onClick || item.children) return;
          item.onClick();
          props.onSelect();
        }}
      >
        {item.swatch && <span className="context-menu-swatch" style={{ backgroundColor: item.swatch }} />}
        <span>{item.label}</span>
        {item.children && <span className="context-menu-arrow">›</span>}
      </button>
      {item.children && (
        <div className="context-submenu" role="menu">
          <ContextMenuItems items={item.children} onSelect={props.onSelect} />
        </div>
      )}
    </div>
  ));
}
