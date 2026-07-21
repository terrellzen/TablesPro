const apiServerStorageKey = "tablespro.apiServerUrl";
const defaultApiBaseUrl = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4000`;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init);
}

export async function mutate<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getConfiguredApiBaseUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...(init.headers ?? {}) }
  });
  return readResponse<T>(response);
}

export function getConfiguredApiBaseUrl(): string {
  try {
    return normalizeApiBaseUrl(localStorage.getItem(apiServerStorageKey) || defaultApiBaseUrl);
  } catch {
    localStorage.removeItem(apiServerStorageKey);
    return defaultApiBaseUrl;
  }
}

export function setConfiguredApiBaseUrl(value: string): string {
  const normalized = normalizeApiBaseUrl(value);
  localStorage.setItem(apiServerStorageKey, normalized);
  return normalized;
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return defaultApiBaseUrl;
  const url = new URL(trimmed);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? `Request failed with ${response.status}`);
  return payload as T;
}
