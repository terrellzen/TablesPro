import { Palette, X } from "lucide-react";
import type { Field } from "../../types/domain.js";
import { dropdownColor, dropdownColorPalette } from "./dropdownColors.js";
import type { DropdownOptionSet } from "./useDropdownOptions.js";

export function DropdownColorDialog(props: {
  field: Field;
  options: DropdownOptionSet | undefined;
  onSetColor: (value: string, color: string) => void;
  onClose: () => void;
}) {
  const values = props.options?.values ?? [];
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="dropdown-color-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="dropdown-color-header">
          <div><Palette size={18} /><div><h3>Dropdown colors</h3><span>{props.field.name}</span></div></div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="dropdown-color-list">
          {values.map((value) => {
            const selectedColor = props.options?.colors[value] ?? dropdownColor(props.field, value);
            return (
              <div className="dropdown-color-row" key={value}>
                <span className="dropdown-value" style={{ backgroundColor: selectedColor }}>{value}</span>
                <div className="dropdown-palette" aria-label={`Color for ${value}`}>
                  {dropdownColorPalette.map((color) => (
                    <button
                      type="button"
                      key={color.value}
                      className={`dropdown-color-swatch${selectedColor === color.value ? " selected" : ""}`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                      aria-label={`${color.name} for ${value}`}
                      aria-pressed={selectedColor === color.value}
                      onClick={() => props.onSetColor(value, color.value)}
                    />
                  ))}
                  <label className="custom-color" title="Custom color">
                    <span>Custom</span>
                    <input type="color" value={toHexColor(selectedColor)} onChange={(event) => props.onSetColor(value, event.target.value)} />
                  </label>
                </div>
              </div>
            );
          })}
          {values.length === 0 && <p className="empty-text">Enter a dropdown value in a record first.</p>}
        </div>
      </div>
    </div>
  );
}

function toHexColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#667085";
}
