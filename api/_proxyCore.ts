// Shared logic for the OneStock API proxy.
// Used by the Vercel serverless function (api/proxy.ts) and by the Vite dev server middleware.
// Files prefixed with "_" in /api are not exposed as functions by Vercel.

export interface ProxyRequestBody {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ProxyResponseEnvelope {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
  transportMethod: string;
}

const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'authorization', 'auth-user', 'auth-password', 'accept-language'];
const EXPOSED_RESPONSE_HEADERS = ['content-type', 'request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];
const DEFAULT_ALLOWED_HOST_SUFFIXES = ['onestock-retail.com'];
const UPSTREAM_TIMEOUT_MS = 55_000;

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const getAllowedHostSuffixes = (): string[] => {
  const raw = (typeof process !== 'undefined' && process.env?.PROXY_ALLOWED_HOSTS) || '';
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_HOST_SUFFIXES;
};

const isHostAllowed = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return getAllowedHostSuffixes().some(suffix =>
    suffix === '*' || host === suffix || host.endsWith(`.${suffix}`)
  );
};

export const handleProxyRequest = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed. Use POST with a JSON envelope { url, method, body }.' });
  }

  let payload: ProxyRequestBody;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON envelope.' });
  }

  if (!payload || typeof payload.url !== 'string') {
    return json(400, { error: 'Missing "url" in proxy envelope.' });
  }

  let target: URL;
  try {
    target = new URL(payload.url);
  } catch {
    return json(400, { error: `Invalid target URL: ${payload.url}` });
  }

  if (target.protocol !== 'https:') {
    return json(400, { error: 'Only https targets are allowed.' });
  }
  if (!isHostAllowed(target.hostname)) {
    return json(403, { error: `Host "${target.hostname}" is not allowed by the proxy (see PROXY_ALLOWED_HOSTS).` });
  }

  const method = (payload.method || 'GET').toUpperCase();
  const hasBody = payload.body !== undefined && payload.body !== null;

  const headers = new Headers();
  for (const [key, value] of Object.entries(payload.headers || {})) {
    if (FORWARDED_REQUEST_HEADERS.includes(key.toLowerCase()) && typeof value === 'string') {
      headers.set(key, value);
    }
  }
  if (hasBody && !headers.has('content-type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('accept')) headers.set('Accept', 'application/json');

  // OneStock GET routes take a JSON body. fetch() cannot send a body with GET,
  // so we use the documented POST transport with X-HTTP-Method-Override.
  let transportMethod = method;
  if ((method === 'GET' || method === 'XGET') && hasBody) {
    transportMethod = 'POST';
    headers.set('X-HTTP-Method-Override', 'GET');
  } else if (method === 'XGET') {
    transportMethod = 'GET';
  }

  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: transportMethod,
      headers,
      body: hasBody && transportMethod !== 'GET' && transportMethod !== 'HEAD'
        ? (typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body))
        : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (err: any) {
    return json(502, {
      error: `Upstream request failed: ${err?.name === 'TimeoutError' ? 'timeout' : err?.message || String(err)}`,
      durationMs: Date.now() - started,
    });
  }

  const text = await upstream.text();
  let body: unknown = text;
  if (text) {
    try { body = JSON.parse(text); } catch { /* keep raw text */ }
  } else {
    body = null;
  }

  const exposedHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    if (EXPOSED_RESPONSE_HEADERS.includes(key.toLowerCase())) exposedHeaders[key.toLowerCase()] = value;
  });

  const envelope: ProxyResponseEnvelope = {
    status: upstream.status,
    statusText: upstream.statusText,
    ok: upstream.ok,
    headers: exposedHeaders,
    body,
    durationMs: Date.now() - started,
    transportMethod,
  };
  return json(200, envelope);
};
