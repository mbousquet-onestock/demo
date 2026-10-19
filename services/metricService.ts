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
  const body = { [key]: entity, ...(version ? { version } : {}) };
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

// Every entity of a DTC list (GET /metrics, /sort_orders); when the list only carries the ids, each one is read
// with GET /{entity}/{id}.
const fetchAll = async <T extends { id: string }>(path: string, key: string, one: string): Promise<T[]> => {
  const list = listIn(await call('GET', path, {}), key).filter(m => m && (m.id || typeof m === 'string'))
    .map(m => (typeof m === 'string' ? { id: m } : { ...m, id: String(m.id) }));
  const out: T[] = [];
  for (const m of list) {
    if (Object.keys(m).length > 1 || out.length >= 100) { out.push(m); continue; }
    try {
      const body: any = await call('GET', `${path}/${encodeURIComponent(m.id)}`, {});
      out.push({ ...(body?.[one] || body || {}), id: m.id });
    } catch { out.push(m); }
  }
  return out;
};

export const fetchMetrics = () => fetchAll<Metric>('/metrics', 'metrics', 'metric');

// POST /metrics or PATCH /metrics/{id} {metric: {id, name, operator}}; version: Delivery Promise version (current if empty).
export const saveMetric = (m: { id: string; name: string; operator: string }, update: boolean, version?: number) =>
  save('/metrics', 'metric', { id: m.id, name: m.name || m.id, operator: m.operator }, update, version);
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

// ---- Sort orders: how the delivery options of a delivery method / sales channel are sorted.
export interface SortCriteria { field: string; desc?: boolean }
export interface SortOrder {
  id: string;
  sales_channel?: string;
  delivery_method?: string;
  // Presets (fastest / cheapest / greenest), or detailed criteria.
  sort_orders?: string[];
  sort_criterias?: SortCriteria[];
  [key: string]: unknown;
}
export const SORT_PRESETS = ['fastest', 'cheapest', 'greenest'];
export const METRIC_FIELD_PREFIX = 'delivery_route.metric_value.';
export const sortFields = (metrics: Metric[]) => ['eta_start', 'eta_end', ...metrics.map(m => `${METRIC_FIELD_PREFIX}${m.id}`)];

export const fetchSortOrders = () => fetchAll<SortOrder>('/sort_orders', 'sort_orders', 'sort_order');
export const saveSortOrder = (so: SortOrder, update: boolean, version?: number) => save('/sort_orders', 'sort_order', so, update, version);
export const deleteSortOrder = (id: string, version?: number) => call('DELETE', `/sort_orders/${encodeURIComponent(id)}`, version ? { version } : {});

// Criteria on a metric that is not defined in /metrics.
export const unknownMetricFields = (so: SortOrder, metrics: Metric[]) =>
  (so.sort_criterias || []).map(c => c.field).filter(f => f?.startsWith(METRIC_FIELD_PREFIX) && !metrics.some(m => f === METRIC_FIELD_PREFIX + m.id || f === METRIC_FIELD_PREFIX + m.name));
export const sortOrderLabel = (so: SortOrder) => [
  ...(so.sort_orders || []),
  ...(so.sort_criterias || []).map(c => `${c.field.replace(METRIC_FIELD_PREFIX, 'metric ')} ${c.desc ? '↓' : '↑'}`),
].join(' → ') || 'no criteria';
