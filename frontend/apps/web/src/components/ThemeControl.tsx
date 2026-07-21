import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "../types/domain.js";

type ThemeControlProps = {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  compact?: boolean;
};

export function ThemeControl({ value, onChange, compact }: ThemeControlProps) {
  const options = [
    { value: "light" as const, label: "Light", icon: <Sun size={14} /> },
    { value: "system" as const, label: "System", icon: <Monitor size={14} /> },
    { value: "dark" as const, label: "Dark", icon: <Moon size={14} /> }
  ];
  return (
    <div className={`theme-control${compact ? " compact" : ""}`} role="group" aria-label="Appearance">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
          aria-label={`${option.label} appearance`}
          aria-pressed={value === option.value}
          title={option.label}
        >
          {option.icon}
          {!compact && <span>{option.label}</span>}
        </button>
      ))}
    </div>
  );
}
