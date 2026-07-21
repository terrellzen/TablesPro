import type { ReactNode } from "react";

type SelectorProps = {
  icon: ReactNode;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

export function Selector({ icon, label, value, options, onChange }: SelectorProps) {
  return (
    <label className="selector">
      {icon}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
