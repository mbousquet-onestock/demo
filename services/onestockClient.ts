import { AppSettings, ConnectionInstance, OnestockApiVersion } from '../types';
import { createPersistedStore } from './persistedStore';
import { logApiCall } from './apiLog';
import type { ProxyResponseEnvelope } from '../api/_proxyCore';

export type { ProxyResponseEnvelope };

// All OneStock calls go through the Vercel function (see api/proxy.ts).
export const PROXY_ENDPOINT = '/api/proxy';

export const connectionsStore = createPersistedStore<ConnectionInstance[]>('onestock_connections', []);
export const activeConnectionIdStore = createPersistedStore<string | null>('onestock_active_connection', null);

export const getActiveConnection = (): ConnectionInstance | null => {
  const id = activeConnectionIdStore.get();
  return connectionsStore.get().find(c => c.id === id) || null;
};

export const useActiveConnection = (): ConnectionInstance | null => {
  const connections = connectionsStore.use();
  const activeId = activeConnectionIdStore.use();
  return connections.find(c => c.id === activeId) || null;
};

export const updateConnection = (id: string, patch: Partial<ConnectionInstance>) => {
  connectionsStore.set(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
};

// URL deduced from the environment and the site ID (used when no API URL is typed).
export const getDefaultBaseUrl = (conn: Pick<ConnectionInstance, 'environment' | 'siteId'>): string => {
  if (conn.environment === 'custom') return '';
  const env = conn.environment === 'qualif' ? '.qualif' : '';
  return `https://${conn.siteId || '{site_id}'}.api${env}.onestock-retail.com`;
};

// A typed API URL always wins over the environment default.
export const getBaseUrl = (conn: Pick<ConnectionInstance, 'environment' | 'customBaseUrl' | 'siteId'>): string => {
  const typed = (conn.customBaseUrl || '').trim().replace(/\/+$/, '');
  return typed || getDefaultBaseUrl(conn);
};

export const buildUrl = (
  conn: Pick<ConnectionInstance, 'environment' | 'customBaseUrl' | 'siteId' | 'version'>,
  path: string,
  version?: OnestockApiVersion
): string => {
  const base = getBaseUrl(conn);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // A custom base URL may already carry the version segment.
  if (/\/v\d+$/.test(base)) return `${base}${cleanPath}`;
  return `${base}/${version || conn.version}${cleanPath}`;
};

// Legacy fallback: the URL / site / token typed by hand in API Settings.
export const connectionFromSettings = (settings: AppSettings): ConnectionInstance => ({
  id: '__settings__',
  name: settings.apiName || 'API Settings',
  environment: 'custom',
  customBaseUrl: settings.apiUrl,
  version: 'v1',
  siteId: settings.siteId,
  userId: '',
  password: '',
  token: settings.token,
});

export const proxyFetch = async (
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<ProxyResponseEnvelope> => {
  const started = Date.now();
  const logFailure = (error: string, status: number | null = null) =>
    logApiCall({ method, url, request: body, status, ok: false, durationMs: Date.now() - started, error });

  let res: Response;
  try {
    res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, body, headers }),
    });
  } catch (err: any) {
    const message = `Proxy unreachable (${PROXY_ENDPOINT}): ${err?.message || err}`;
    logFailure(message);
    throw new Error(message);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error || `Proxy error ${res.status}`;
    logFailure(message, res.status);
    throw new Error(message);
  }
  const envelope = data as ProxyResponseEnvelope;
  logApiCall({
    method,
    transportMethod: envelope.transportMethod,
    url,
    request: body,
    status: envelope.status,
    ok: envelope.ok,
    durationMs: envelope.durationMs,
    response: envelope.body,
    requestId: envelope.headers?.['request-id'],
  });
  return envelope;
};

export const describeError = (envelope: ProxyResponseEnvelope): string => {
  const b: any = envelope.body;
  const detail = typeof b === 'string' ? b : b?.message || b?.error || (b ? JSON.stringify(b) : '');
  return `HTTP ${envelope.status} ${envelope.statusText || ''}${detail ? ` – ${detail}` : ''}`.trim();
};

// POST /login → stores the token on the connection instance.
export const loginConnection = async (conn: ConnectionInstance): Promise<string> => {
  const url = buildUrl(conn, '/login');
  try {
    const envelope = await proxyFetch(url, 'POST', {
      site_id: conn.siteId,
      user_id: conn.userId,
      password: conn.password,
    });
    const token = (envelope.body as any)?.token;
    if (!envelope.ok || !token) throw new Error(describeError(envelope));
    updateConnection(conn.id, { token, tokenObtainedAt: new Date().toISOString(), lastError: undefined });
    return token;
  } catch (err: any) {
    updateConnection(conn.id, { lastError: err?.message || String(err) });
    throw err;
  }
};

// Payloads carry these variables (Postman style); the real values of the connection
// are only substituted at call time, so shown, saved or downloaded payloads never hold a token.
export const SITE_ID_VAR = '{{site_id}}';
export const TOKEN_VAR = '{{token}}';

const isPlaceholder = (value: string) => /^\{\{\s*[\w.-]+\s*\}\}$/.test(value.trim());

// Replaces every "{{name}}" occurrence in string values (and keys) of a payload.
export const resolveVariables = <T,>(value: T, variables: Record<string, string | undefined>): T => {
  const replace = (text: string) =>
    text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) => variables[name] ?? match);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return replace(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [replace(k), walk(val)]));
    }
    return v;
  };
  return walk(value) as T;
};

// True when a real value (not a {{variable}} placeholder) is set.
export const hasRealValue = (value?: string) => !!value && !isPlaceholder(value);

export interface OnestockRequestOptions {
  method: string;
  path: string;
  // May contain {{site_id}} / {{token}}: they are resolved with the connection values.
  body?: Record<string, unknown> | null;
  connection?: ConnectionInstance | null;
  version?: OnestockApiVersion;
  // Adds "site_id": "{{site_id}}" and "token": "{{token}}" to the body when they are missing.
  injectAuth?: boolean;
  // Re-login once with the instance credentials when the API answers 401.
  retryOn401?: boolean;
}

export interface OnestockRequestResult {
  url: string;
  method: string;
  // Payload with the variables, as shown / saved by the app.
  requestTemplate: Record<string, unknown> | null;
  envelope: ProxyResponseEnvelope;
}

export const onestockRequest = async ({
  method,
  path,
  body,
  connection,
  version,
  injectAuth = true,
  retryOn401 = true,
}: OnestockRequestOptions): Promise<OnestockRequestResult> => {
  const conn = connection || getActiveConnection();
  if (!conn) throw new Error('No active OneStock connection. Create and activate one in "Connections".');

  let token = conn.token;
  if (!token && conn.userId && conn.password) token = await loginConnection(conn);

  const url = buildUrl(conn, path, version);
  const requestTemplate = injectAuth
    ? { site_id: SITE_ID_VAR, token: TOKEN_VAR, ...(body || {}) }
    : body || null;
  const resolve = (t?: string) => resolveVariables(requestTemplate, { site_id: conn.siteId, token: t });

  let envelope = await proxyFetch(url, method, resolve(token));

  if (envelope.status === 401 && retryOn401 && conn.userId && conn.password) {
    token = await loginConnection(conn);
    envelope = await proxyFetch(url, method, resolve(token));
  }

  return { url, method, requestTemplate, envelope };
};
