// Debug journal of every OneStock call made through the proxy (request payload + result).
// Kept in this browser only (localStorage), never synced to the database.
import { createPersistedStore } from './persistedStore';

export interface ApiLogEntry {
  id: string;
  at: string;
  method: string;
  // Method actually sent by the proxy (GET with a body travels as POST + X-HTTP-Method-Override).
  transportMethod?: string;
  url: string;
  request: unknown;
  status: number | null;
  ok: boolean;
  durationMs: number;
  response?: unknown;
  // Proxy-level failure (unreachable, host not allowed, timeout…).
  error?: string;
  requestId?: string;
  truncated?: boolean;
}

const MAX_ENTRIES = 100;
// Large results (e.g. thousands of items) are cut so the journal stays usable.
const MAX_BODY_CHARS = 100_000;

export const apiLogStore = createPersistedStore<ApiLogEntry[]>('onestock_api_log', []);
export const apiLogEnabledStore = createPersistedStore<boolean>('onestock_api_log_enabled', true);

const SECRET_KEYS = ['token', 'password', 'auth-password'];

// Hides secrets (token, password) wherever they appear in a payload.
export const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      SECRET_KEYS.includes(k.toLowerCase()) && typeof v === 'string' && v ? [k, '***'] : [k, redactSecrets(v)]
    ));
  }
  return value;
};

const capBody = (value: unknown): { value: unknown; truncated: boolean } => {
  if (value === undefined) return { value, truncated: false };
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text || text.length <= MAX_BODY_CHARS) return { value, truncated: false };
  return { value: `${text.slice(0, MAX_BODY_CHARS)}… [truncated, ${text.length.toLocaleString()} chars in total]`, truncated: true };
};

// The login response holds a fresh token: never keep it in the journal.
const redactResponse = (url: string, body: unknown) =>
  /\/login(\?|$)/.test(url) ? redactSecrets(body) : body;

export const logApiCall = (entry: Omit<ApiLogEntry, 'id' | 'at' | 'truncated'>) => {
  if (!apiLogEnabledStore.get()) return;
  const request = capBody(redactSecrets(entry.request));
  const response = capBody(redactResponse(entry.url, entry.response));
  const full: ApiLogEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    at: new Date().toISOString(),
    request: request.value,
    response: response.value,
    truncated: request.truncated || response.truncated,
  };
  apiLogStore.set(prev => [full, ...prev].slice(0, MAX_ENTRIES));
};

export const clearApiLog = () => apiLogStore.set([]);
