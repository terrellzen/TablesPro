import type { ThemePreference } from "../types/domain.js";

const themeStorageKey = "tablespro.theme";

export function readThemePreference(): ThemePreference {
  const stored = localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function persistThemePreference(preference: ThemePreference): void {
  localStorage.setItem(themeStorageKey, preference);
}

export function applyThemePreference(preference: ThemePreference, systemDark: boolean): void {
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
