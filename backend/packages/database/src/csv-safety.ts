const dangerousFormulaPrefixes = ["=", "+", "-", "@", "\t", "\r"];

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (dangerousFormulaPrefixes.some((prefix) => text.startsWith(prefix))) {
    return `'${text}`;
  }
  return text;
}
