import { onestockRequest, describeCallError } from './onestockClient';
import { DeliveryRoute } from './deliveryRouteService';

// Delivery Promise metrics (Delivery Time Calculator): the keys of the routes' metric_values (cost_by_parcel,
// carbon_footprint…) and the operator combining the values of a promise's routes.
export const METRIC_OPERATORS = [
  { id: 'sum', label: 'sum — total of the routes (e.g. cost of all parcels)' },
  { id: 'min', label: 'min — lowest value' },
  { id: 'max', label: 'max — highest value' },
] as const;
export type MetricOperator = typeof METRIC_OPERATORS[number]['id'];

export interface Metric {
  id: string;
  name?: string;
  operator?: MetricOperator | string;
  [key: string]: unknown;
}

const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body: Record<string, unknown>) => {
  const { envelope } = await onestockRequest({ method, path, body });
  if (envelope.status === 204) return null;
  if (!envelope.ok) throw Object.assign(new Error(`${method} ${path}: ${describeCallError(envelope)}`), { status: envelope.status });
  return envelope.body;
};

// Creation: POST /{entity} with the id in the body (POST /{entity}/{id} answers 405), PATCH /{entity}/{id} to update.
// POST /{entity}/{id} is tried when the collection refuses the method.
const save = async (path: string, key: string, entity: { id: string } & Record<string, unknown>, update: boolean, version?: number) => {
  // Metrics carry their name only (no id field).
  const { id: _id, ...rest } = entity;
  const body = { [key]: key === 'metric' ? rest : entity, ...(version ? { version } : {}) };
  const one = `${path}/${encodeURIComponent(entity.id)}`;
  if (update) return call('PATCH', one, body);
  try {
    return await call('POST', path, body);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 405) return call('POST', one, body);
    throw err;
  }
};

const listIn = (body: any, key: string): any[] => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body[key])) return body[key];
  if (body[key] && typeof body[key] === 'object') return Object.entries(body[key]).map(([id, x]) => ({ id, ...(x as object) }));
  return (Object.values(body).find(v => Array.isArray(v)) as any[]) || [];
};

// Last raw answers of the list reads (shown when nothing could be read from them).
export const lastListAnswers: Record<string, { request: unknown; status: number | null; body: unknown }[]> = {};

// GET with the fields first (DTC lists may only return the ids without them), then without (fields refused).
export const getWithFields = async (path: string, fields: string[], version?: number) => {
  const attempts: Record<string, unknown>[] = [{ fields }, { filter: { fields } }, {}].map(b => (version ? { ...b, version } : b));
  const trace: { request: unknown; status: number | null; body: unknown }[] = [];
  let lastError: any = null;
  for (const body of attempts) {
    const { envelope } = await onestockRequest({ method: 'GET', path, body });
    trace.push({ request: body, status: envelope.status, body: envelope.body });
    if (envelope.ok) { lastListAnswers[path] = trace; return envelope.status === 204 ? null : envelope.body; }
    lastError = Object.assign(new Error(`GET ${path}: ${describeCallError(envelope)}`), { status: envelope.status });
    // Only a refused request (400 / 422) is worth another form.
    if (envelope.status !== 400 && envelope.status !== 422) break;
  }
  lastListAnswers[path] = trace;
  throw lastError;
};

// Every entity of a DTC list (GET /metrics); when the list only carries the ids, each one is read
// with GET /{entity}/{id}.
const fetchAll = async <T extends { id: string }>(path: string, key: string, one: string, fields: string[], version?: number): Promise<T[]> => {
  // Metrics have no id: their name is the key (GET /metrics → [{name, operator, version}]).
  const list = listIn(await getWithFields(path, fields, version), key).filter(m => m && (m.id || m.name || typeof m === 'string'))
    .map(m => (typeof m === 'string' ? { id: m } : { ...m, id: String(m.id ?? m.name) }));
  const out: T[] = [];
  for (const m of list) {
    if (Object.keys(m).length > 1 || out.length >= 100) { out.push(m); continue; }
    try {
      const body: any = await getWithFields(`${path}/${encodeURIComponent(m.id)}`, fields, version);
      out.push({ ...(body?.[one] || body || {}), id: m.id });
    } catch { out.push(m); }
  }
  return out;
};

export const METRIC_FIELDS = ['name', 'operator'];
export const fetchMetrics = (version?: number) => fetchAll<Metric>('/metrics', 'metrics', 'metric', METRIC_FIELDS, version);

// POST /metrics or PATCH /metrics/{id} {metric: {id, name, operator}}; version: Delivery Promise version (current if empty).
// Documented fields: name, operator; unit sent when filled (checked after reload).
// The name is the metric key (the key of the routes' metric_values): POST /metrics, PATCH / DELETE /metrics/{name}.
export const saveMetric = (m: { id: string; operator: string; unit?: string }, update: boolean, version?: number) =>
  save('/metrics', 'metric', { id: m.id, name: m.id, operator: m.operator, ...(m.unit?.trim() ? { unit: m.unit.trim() } : {}) }, update, version);
export const metricUnit = (m: Metric) => (m.unit ? String(m.unit) : '');
// Raw answer of GET /metrics/{id}.
export const readMetric = (id: string, version?: number) => getWithFields(`/metrics/${encodeURIComponent(id)}`, METRIC_FIELDS, version);
export const METRIC_UNITS = ['EUR', 'USD', 'GBP', 'gCO2', 'kgCO2', 'kg', 'h', '%'];
// 409 when the metric is still referenced.
export const deleteMetric = (id: string, version?: number) => call('DELETE', `/metrics/${encodeURIComponent(id)}`, version ? { version } : {});

// Key of the routes' metric_values for a metric (its id, or its name).
export const metricKey = (m: Metric, usages: Map<string, unknown>) => (usages.has(m.id) ? m.id : m.name && usages.has(m.name) ? m.name : m.id);

export interface MetricUsage {
  key: string;
  routes: DeliveryRoute[];
  nulls: number;
  min?: number;
  max?: number;
}

// Use of each metric key in the routes (metric_values): number of routes, null values, min / max.
export const metricUsages = (routes: DeliveryRoute[]): Map<string, MetricUsage> => {
  const out = new Map<string, MetricUsage>();
  routes.forEach(r => Object.entries(r.metric_values || {}).forEach(([key, v]) => {
    const u = out.get(key) || { key, routes: [], nulls: 0 };
    u.routes.push(r);
    if (v === null || v === undefined) u.nulls++;
    else {
      u.min = u.min === undefined ? v : Math.min(u.min, v);
      u.max = u.max === undefined ? v : Math.max(u.max, v);
    }
    out.set(key, u);
  }));
  return out;
};

