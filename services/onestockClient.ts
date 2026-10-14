import { AppSettings, ConnectionInstance, OnestockApiVersion } from '../types';
import { createPersistedStore } from './persistedStore';
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
  let res: Response;
  try {
    res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, body, headers }),
    });
  } catch (err: any) {
    throw new Error(`Proxy unreachable (${PROXY_ENDPOINT}): ${err?.message || err}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Proxy error ${res.status}`);
  }
  return data as ProxyResponseEnvelope;
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

export interface OnestockRequestOptions {
  method: string;
  path: string;
  body?: Record<string, unknown> | null;
  connection?: ConnectionInstance | null;
  version?: OnestockApiVersion;
  // Adds site_id / token to the body (OneStock token authentication).
  injectAuth?: boolean;
  // Re-login once with the instance credentials when the API answers 401.
  retryOn401?: boolean;
}

export interface OnestockRequestResult {
  url: string;
  method: string;
  requestBody: Record<string, unknown> | null;
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
  const buildBody = (t?: string) =>
    injectAuth ? { ...(body || {}), site_id: conn.siteId, token: t } : body || null;

  let requestBody = buildBody(token);
  let envelope = await proxyFetch(url, method, requestBody);

  if (envelope.status === 401 && retryOn401 && conn.userId && conn.password) {
    token = await loginConnection(conn);
    requestBody = buildBody(token);
    envelope = await proxyFetch(url, method, requestBody);
  }

  return { url, method, requestBody, envelope };
};

// Strips the token before a request payload is shown or saved.
export const redactToken = <T,>(payload: T): T => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'token' in (payload as any)) {
    return { ...(payload as any), token: '***' };
  }
  return payload;
};
