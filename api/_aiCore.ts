// Generation of OneStock stock locations (endpoints) with the OpenAI API.
// Used by the Vercel function (api/ai.ts) and by the Vite dev / preview middleware.
import { timingSafeEqual } from 'node:crypto';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const MAX_BATCH = 30;
const UPSTREAM_TIMEOUT_MS = 55_000;

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const hasValidAppKey = (request: Request): boolean => {
  const expected = process.env.APP_ACCESS_KEY || '';
  const given = request.headers.get('x-app-key') || '';
  return !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

export interface GenerateRequest {
  context: string;
  count: number;
  idPrefix?: string;
  model?: string;
  // Key typed in the app; the server key (OPENAI_API_KEY) is used when absent.
  apiKey?: string;
  // Ids already generated in previous batches, to avoid duplicates.
  existingIds?: string[];
}

const SYSTEM_PROMPT = `You generate realistic test data for the OneStock order management system.
Return ONLY a JSON object: {"endpoints": [ ... ]} where each element is a OneStock stock location ("endpoint") ready for POST /endpoints:
{
  "id": "unique id, lowercase snake_case, ascii only, e.g. store_paris_rivoli",
  "name": "human readable name",
  "address": {
    "lines": ["street address"],
    "city": "city",
    "zip_code": "postal code as a string",
    "regions": {"country": {"code": "ISO 3166-1 alpha-2"}},
    "coordinates": {"lat": number, "lon": number},
    "contact": {"email": "...", "phone_number": "+33..."}
  },
  "timezone": "IANA timezone, e.g. Europe/Paris",
  "classification": {"endpoint_type": ["store" | "warehouse" | "dark_store" | "drive" | "locker" | "supplier"]},
  "modules": {"ffs": boolean, "ckc": boolean, "cfs": boolean, "ropis": boolean}
}
Rules: addresses and GPS coordinates must be plausible and consistent with the city; ids must be unique;
warehouses usually have ffs=true and ckc=false; stores usually have ckc, cfs and ropis enabled.
Follow the user's context (brand, countries, store types, proportions). Do not add any other text.`;

export const handleAiRequest = async (request: Request): Promise<Response> => {
  if (request.method === 'GET') {
    // Lets the app know whether a server-side OpenAI key is configured.
    return json(200, { serverKey: !!process.env.OPENAI_API_KEY, defaultModel: DEFAULT_MODEL });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const body = await request.json().catch(() => null) as GenerateRequest | null;
  if (!body || typeof body.context !== 'string' || !body.context.trim()) {
    return json(400, { error: 'Missing "context".' });
  }
  const count = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(body.count) || 0)));

  let apiKey = (body.apiKey || '').trim();
  if (!apiKey) {
    // The server key spends the project's credits: only callers holding the app access key may use it.
    if (!process.env.OPENAI_API_KEY) {
      return json(400, { error: 'No OpenAI key: type one in the Stock Points tab, or set OPENAI_API_KEY on the server.' });
    }
    if (!hasValidAppKey(request)) {
      return json(401, { error: 'The server OpenAI key requires the database access key (API Settings → Database).' });
    }
    apiKey = process.env.OPENAI_API_KEY;
  }

  const existing = (body.existingIds || []).slice(0, 500);
  const userPrompt = [
    `Context: ${body.context.trim()}`,
    `Generate exactly ${count} stock locations.`,
    body.idPrefix?.trim() ? `Every id must start with "${body.idPrefix.trim()}".` : '',
    existing.length ? `These ids already exist, do not reuse them nor duplicate their locations: ${existing.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: (body.model || '').trim() || DEFAULT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err: any) {
    return json(502, { error: `OpenAI unreachable: ${err?.name === 'TimeoutError' ? 'timeout' : err?.message || err}` });
  }

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return json(upstream.status === 401 ? 400 : 502, {
      error: `OpenAI error ${upstream.status}: ${data?.error?.message || upstream.statusText}`,
    });
  }

  let endpoints: unknown[] = [];
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    endpoints = Array.isArray(parsed.endpoints) ? parsed.endpoints : [];
  } catch {
    return json(502, { error: 'OpenAI did not return valid JSON.' });
  }

  return json(200, {
    endpoints,
    model: data?.model,
    usage: data?.usage,
    durationMs: Date.now() - started,
    prompt: userPrompt,
  });
};
