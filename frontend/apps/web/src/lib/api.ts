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

export async function validateApiBaseUrl(value: string): Promise<string> {
  const normalized = normalizeApiBaseUrl(value);
  let healthResponse: Response;

  try {
    healthResponse = await fetch(`${normalized}/health`, {
      credentials: "include",
      headers: { accept: "application/json" }
    });
  } catch {
    throw new Error(`Could not reach the API server at ${normalized}`);
  }

  const health = await healthResponse.json().catch(() => null);
  if (!healthResponse.ok || health?.ok !== true) {
    throw new Error(`The API health check failed with status ${healthResponse.status}`);
  }

  const readyResponse = await fetch(`${normalized}/ready`, {
    credentials: "include",
    headers: { accept: "application/json" }
  }).catch(() => null);
  if (!readyResponse) {
    throw new Error("The API server is online, but its database readiness check could not be reached");
  }

  const readiness = await readyResponse.json().catch(() => null);
  if (!readyResponse.ok || readiness?.database?.connected !== true) {
    throw new Error(`The API server is online, but its database is not ready (status ${readyResponse.status})`);
  }
  if (
    typeof readiness.database.migrationsApplied !== "number" ||
    readiness.database.migrationsApplied < 1
  ) {
    throw new Error("The database is connected, but the TablesPro migrations have not been applied");
  }

  const configResponse = await fetch(`${normalized}/api/config`, {
    credentials: "include",
    headers: { accept: "application/json" }
  }).catch(() => null);
  if (!configResponse) {
    throw new Error("The API server became unavailable while checking its configuration");
  }

  const config = await configResponse.json().catch(() => null);
  if (!configResponse.ok) {
    throw new Error(config?.message ?? `API server returned ${configResponse.status}`);
  }
  if (typeof config?.auth?.signUpEnabled !== "boolean") {
    throw new Error("This URL is not a compatible TablesPro API server");
  }

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
