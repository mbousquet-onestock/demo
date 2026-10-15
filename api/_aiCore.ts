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

export type AiTask = 'stock_points' | 'customers' | 'prices';

export interface GenerateRequest {
  // Defaults to "stock_points".
  task?: AiTask;
  context?: string;
  count?: number;
  idPrefix?: string;
  model?: string;
  // Key typed in the app; the server key (OPENAI_API_KEY) is used when absent.
  apiKey?: string;
  // Ids already generated in previous batches, to avoid duplicates (stock points).
  existingIds?: string[];
  // customers: target country (ISO code) and name.
  countryCode?: string;
  countryName?: string;
  // prices: articles to price.
  items?: { sku: string; name?: string; category?: string; description?: string }[];
  currency?: string;
}

const STOCK_POINTS_PROMPT = `You generate realistic test data for the OneStock order management system.
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

const CUSTOMERS_PROMPT = `You generate realistic, diverse fictitious customers for e-commerce test orders.
Return ONLY a JSON object: {"customers": [ ... ]} where each element is:
{
  "title": "courtesy title in the country language (e.g. M., Mme, Mr, Mrs)",
  "first_name": "...",
  "last_name": "...",
  "phone_number": "international format with the country prefix, e.g. +33612345678",
  "address": {"lines": ["street and number"], "city": "city", "zip_code": "postal code as a string"}
}
Rules: names, phone formats, streets, cities and postal codes must be plausible and consistent for the requested country;
vary the cities across the country; addresses must be fictitious but realistic. Do not add any other text.`;

const PRICES_PROMPT = `You set realistic retail prices for products of a store.
Return ONLY a JSON object: {"prices": [{"sku": "...", "price": number}]} with one entry per product given, same sku,
price as a number with 2 decimals in the requested currency, consistent with the product name, category and a typical
mid-market retailer. Do not add any other text.`;

interface TaskDefinition {
  system: string;
  resultKey: string;
  maxBatch: number;
  validate: (body: GenerateRequest) => string | null;
  userPrompt: (body: GenerateRequest, count: number) => string;
}

const TASKS: Record<AiTask, TaskDefinition> = {
  stock_points: {
    system: STOCK_POINTS_PROMPT,
    resultKey: 'endpoints',
    maxBatch: MAX_BATCH,
    validate: b => (b.context?.trim() ? null : 'Missing "context".'),
    userPrompt: (b, count) => {
      const existing = (b.existingIds || []).slice(0, 500);
      return [
        `Context: ${b.context!.trim()}`,
        `Generate exactly ${count} stock locations.`,
        b.idPrefix?.trim() ? `Every id must start with "${b.idPrefix.trim()}".` : '',
        existing.length ? `These ids already exist, do not reuse them nor duplicate their locations: ${existing.join(', ')}` : '',
      ].filter(Boolean).join('\n');
    },
  },
  customers: {
    system: CUSTOMERS_PROMPT,
    resultKey: 'customers',
    maxBatch: MAX_BATCH,
    validate: b => (b.countryCode?.trim() ? null : 'Missing "countryCode".'),
    userPrompt: (b, count) => [
      `Country: ${b.countryName?.trim() ? `${b.countryName.trim()} (${b.countryCode})` : b.countryCode}.`,
      `Generate exactly ${count} customers.`,
      b.context?.trim() ? `Context: ${b.context.trim()}` : '',
    ].filter(Boolean).join('\n'),
  },
  prices: {
    system: PRICES_PROMPT,
    resultKey: 'prices',
    maxBatch: 60,
    validate: b => (Array.isArray(b.items) && b.items.length > 0 ? null : 'Missing "items".'),
    userPrompt: b => [
      `Currency: ${b.currency || 'EUR'}.`,
      b.context?.trim() ? `Context: ${b.context.trim()}` : '',
      `Products: ${JSON.stringify((b.items || []).slice(0, 60).map(i => ({
        sku: i.sku, name: i.name, category: i.category, description: (i.description || '').slice(0, 160),
      })))}`,
    ].filter(Boolean).join('\n'),
  },
};

export const handleAiRequest = async (request: Request): Promise<Response> => {
  if (request.method === 'GET') {
    // Lets the app know whether a server-side OpenAI key is configured.
    return json(200, { serverKey: !!process.env.OPENAI_API_KEY, defaultModel: DEFAULT_MODEL });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const body = await request.json().catch(() => null) as GenerateRequest | null;
  if (!body) return json(400, { error: 'Invalid JSON body.' });
  const task = TASKS[body.task || 'stock_points'];
  if (!task) return json(400, { error: `Unknown task "${body.task}".` });
  const invalid = task.validate(body);
  if (invalid) return json(400, { error: invalid });
  const count = Math.max(1, Math.min(task.maxBatch, Math.floor(Number(body.count) || (body.items?.length ?? 0) || 1)));

  let apiKey = (body.apiKey || '').trim();
  if (!apiKey) {
    // The server key spends the project's credits: only callers holding the app access key may use it.
    if (!process.env.OPENAI_API_KEY) {
      return json(400, { error: 'No OpenAI key: type one in API Settings, or set OPENAI_API_KEY on the server.' });
    }
    if (!hasValidAppKey(request)) {
      return json(401, { error: 'The server OpenAI key requires the database access key (API Settings → Database).' });
    }
    apiKey = process.env.OPENAI_API_KEY;
  }

  const userPrompt = task.userPrompt(body, count);

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
          { role: 'system', content: task.system },
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

  let results: unknown[] = [];
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    results = Array.isArray(parsed[task.resultKey]) ? parsed[task.resultKey] : [];
  } catch {
    return json(502, { error: 'OpenAI did not return valid JSON.' });
  }

  return json(200, {
    [task.resultKey]: results,
    model: data?.model,
    usage: data?.usage,
    durationMs: Date.now() - started,
    prompt: userPrompt,
  });
};
