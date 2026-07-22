import type { Field } from "../../types/domain.js";

export const dropdownColorPalette = [
  { name: "Red", value: "#d84a4a" },
  { name: "Orange", value: "#d97706" },
  { name: "Gold", value: "#b88900" },
  { name: "Green", value: "#2e8b57" },
  { name: "Teal", value: "#168a8a" },
  { name: "Blue", value: "#3478c9" },
  { name: "Indigo", value: "#5965c9" },
  { name: "Purple", value: "#8656b5" },
  { name: "Pink", value: "#c84d86" },
  { name: "Gray", value: "#667085" }
] as const;

export function dropdownColor(field: Field, value: string): string {
  return field.options?.choiceColors?.[value] ?? generatedColor(value);
}

export function buildDropdownColors(
  values: string[],
  overrides: Record<string, string>
): Record<string, string> {
  const colors = { ...overrides };
  const used = new Set(Object.values(overrides));
  for (const value of [...values].sort((left, right) => left.localeCompare(right))) {
    if (colors[value]) continue;
    let attempt = 0;
    let color = generatedColor(value, attempt);
    while (used.has(color)) color = generatedColor(value, ++attempt);
    colors[value] = color;
    used.add(color);
  }
  return colors;
}

export function generatedColor(value: string, attempt = 0): string {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `hsl(${(Math.abs(hash) + attempt * 137) % 360} 52% 42%)`;
}
