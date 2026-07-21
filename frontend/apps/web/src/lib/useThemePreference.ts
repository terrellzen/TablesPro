import { useEffect, useState } from "react";
import { applyThemePreference, persistThemePreference, readThemePreference } from "./theme.js";
import type { ThemePreference } from "../types/domain.js";

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());

  useEffect(() => {
    persistThemePreference(preference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyThemePreference(preference, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return [preference, setPreference] as const;
}
