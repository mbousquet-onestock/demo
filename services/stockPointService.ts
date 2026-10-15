import { StockPointDraft, StockPointPushResult, OnestockApiVersion } from '../types';
import { onestockRequest, getApiTarget, describeCallError } from './onestockClient';
import { callAi } from './aiService';

// Sent to OpenAI per request: larger counts are generated in several batches.
const AI_BATCH_SIZE = 25;
export const MAX_STOCK_POINTS = 200;
const BULK_CHUNK = 50;

export { getAiStatus } from './aiService';
export type { AiStatus } from './aiService';

const sanitizeId = (value: unknown, fallback: string) =>
  (String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || fallback);

// Keeps what the AI returned but guarantees a usable, unique id and a name.
const normalize = (raw: any, index: number, used: Set<string>, idPrefix: string): StockPointDraft => {
  const ep = raw && typeof raw === 'object' ? { ...raw } : {};
  let id = sanitizeId(ep.id, `${idPrefix || 'endpoint'}_${index + 1}`);
  if (idPrefix && !id.startsWith(idPrefix)) id = `${idPrefix}${id}`;
  let unique = id;
  for (let n = 2; used.has(unique); n++) unique = `${id}_${n}`;
  used.add(unique);
  const coords = ep.address?.coordinates;
  if (coords) {
    coords.lat = Number(coords.lat);
    coords.lon = Number(coords.lon);
  }
  if (ep.address?.zip_code !== undefined) ep.address.zip_code = String(ep.address.zip_code);
  return { ...ep, id: unique, name: String(ep.name || unique) };
};

export interface GenerateOptions {
  context: string;
  count: number;
  idPrefix?: string;
  onProgress?: (done: number, total: number) => void;
}

export const generateStockPoints = async (opts: GenerateOptions): Promise<StockPointDraft[]> => {
  const total = Math.max(1, Math.min(MAX_STOCK_POINTS, Math.floor(opts.count)));
  const used = new Set<string>();
  const result: StockPointDraft[] = [];

  while (result.length < total) {
    const batch = Math.min(AI_BATCH_SIZE, total - result.length);
    const data = await callAi('stock_points', {
      context: opts.context,
      count: batch,
      idPrefix: opts.idPrefix,
      existingIds: result.map(e => e.id),
    }, 'generate stock points');

    const received: unknown[] = Array.isArray(data?.endpoints) ? data.endpoints : [];
    if (received.length === 0) throw new Error('The AI returned no stock point. Try a more precise context.');
    received.slice(0, batch).forEach(raw => result.push(normalize(raw, result.length, used, opts.idPrefix?.trim() || '')));
    opts.onProgress?.(result.length, total);
  }
  return result;
};

// POST /endpoints only exists in v3 / v4.
const endpointsVersion = (): OnestockApiVersion => {
  const v = getApiTarget().version;
  return v === 'v4' ? 'v4' : 'v3';
};

const toResult = (ok: boolean, status: number | null, message: string, requestId?: string): StockPointPushResult =>
  ({ ok, status, message, requestId, at: new Date().toISOString() });

export const createStockPoints = async (
  endpoints: StockPointDraft[],
  mode: 'one' | 'bulk',
  onProgress?: (results: Record<string, StockPointPushResult>, done: number) => void
): Promise<Record<string, StockPointPushResult>> => {
  const results: Record<string, StockPointPushResult> = {};
  const version = endpointsVersion();

  if (mode === 'one') {
    let done = 0;
    for (const ep of endpoints) {
      try {
        const { envelope } = await onestockRequest({ method: 'POST', path: '/endpoints', body: { endpoint: ep }, version });
        results[ep.id] = toResult(envelope.ok, envelope.status, envelope.ok ? 'Created' : describeCallError(envelope), envelope.headers?.['request-id']);
      } catch (err: any) {
        results[ep.id] = toResult(false, null, err?.message || String(err));
      }
      onProgress?.({ ...results }, ++done);
    }
    return results;
  }

  for (let i = 0; i < endpoints.length; i += BULK_CHUNK) {
    const chunk = endpoints.slice(i, i + BULK_CHUNK);
    let result: StockPointPushResult;
    try {
      const { envelope } = await onestockRequest({ method: 'POST', path: '/endpoints', body: { endpoints: chunk }, version });
      result = toResult(envelope.ok, envelope.status, envelope.ok ? 'Created (bulk)' : describeCallError(envelope), envelope.headers?.['request-id']);
    } catch (err: any) {
      result = toResult(false, null, err?.message || String(err));
    }
    chunk.forEach(ep => { results[ep.id] = result; });
    onProgress?.({ ...results }, Math.min(i + BULK_CHUNK, endpoints.length));
  }
  return results;
};
