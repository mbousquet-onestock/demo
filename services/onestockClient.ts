import { AppSettings, OnestockApiVersion } from '../types';
import { settingsStore } from './appStores';
import { logApiCall } from './apiLog';
import type { ProxyResponseEnvelope } from '../api/_proxyCore';

export type { ProxyResponseEnvelope };

// All OneStock calls go through the Vercel function (see api/proxy.ts).
export const PROXY_ENDPOINT = '/api/proxy';

// Payloads carry these variables (Postman style); the real site / token typed in API Settings
// are only substituted at call time, so shown, saved or downloaded payloads never hold a token.
export const SITE_ID_VAR = '{{site_id}}';
export const TOKEN_VAR = '{{token}}';

const isPlaceholder = (value: string) => /^\{\{\s*[\w.-]+\s*\}\}$/.test(value.trim());

// True when a real value (not empty, not a {{variable}} placeholder) is set.
export const hasRealValue = (value?: string) => !!value && !!value.trim() && !isPlaceholder(value);

export const QUALIF_URL_TEMPLATE = 'https://{site_id}.api.qualif.onestock-retail.com';
export const PROD_URL_TEMPLATE = 'https://{site_id}.api.onestock-retail.com';

// Where and how the app calls OneStock: everything comes from API Settings.
export interface ApiTarget {
  baseUrl: string;
  siteId: string;
  token: string;
  version: OnestockApiVersion;
}

export const getApiTarget = (settings: AppSettings = settingsStore.get()): ApiTarget => ({
  baseUrl: (settings.apiUrl || '').trim().replace(/\/+$/, ''),
  siteId: (settings.siteId || '').trim(),
  token: (settings.token || '').trim(),
  version: settings.apiVersion || 'v3',
});

export const useApiTarget = (): ApiTarget => getApiTarget(settingsStore.use());

// Returns what is missing before a call can be made, or null when everything is set.
export const missingTargetFields = (target: ApiTarget): string | null => {
  const missing = [
    !/^https:\/\/[^/\s]+/i.test(target.baseUrl) && 'API URL (https://…)',
    !hasRealValue(target.siteId) && 'site ID',
    !hasRealValue(target.token) && 'token',
  ].filter(Boolean);
  return missing.length ? missing.join(', ') : null;
};

export const isProductionTarget = (target: ApiTarget) => !/\.qualif\./i.test(target.baseUrl);

export const buildUrl = (target: Pick<ApiTarget, 'baseUrl' | 'version'>, path: string, version?: OnestockApiVersion): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // The API URL may already carry the version segment.
  if (/\/v\d+$/.test(target.baseUrl)) return `${target.baseUrl}${cleanPath}`;
  return `${target.baseUrl}/${version || target.version}${cleanPath}`;
};

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

export interface OnestockRequestOptions {
  method: string;
  path: string;
  // May contain {{site_id}} / {{token}}: they are resolved with the API Settings values.
  body?: Record<string, unknown> | null;
  version?: OnestockApiVersion;
  // Adds "site_id": "{{site_id}}" and "token": "{{token}}" to the body when they are missing.
  injectAuth?: boolean;
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
  version,
  injectAuth = true,
}: OnestockRequestOptions): Promise<OnestockRequestResult> => {
  const target = getApiTarget();
  const missing = missingTargetFields(target);
  if (missing) throw new Error(`Missing in API Settings: ${missing}.`);

  const url = buildUrl(target, path, version);
  const requestTemplate = injectAuth
    ? { site_id: SITE_ID_VAR, token: TOKEN_VAR, ...(body || {}) }
    : body || null;
  const envelope = await proxyFetch(url, method, resolveVariables(requestTemplate, { site_id: target.siteId, token: target.token }));
  return { url, method, requestTemplate, envelope };
};

// Error text for a failed call, with a hint when the token is rejected.
export const describeCallError = (envelope: ProxyResponseEnvelope): string => {
  // OneStock answers 401, or 400 with "auth_error", when the token is rejected.
  const authError = envelope.status === 401 || (envelope.body as any)?.error === 'auth_error';
  return authError
    ? `${describeError(envelope)} — the token is expired or invalid: paste a new one in API Settings.`
    : describeError(envelope);
};
