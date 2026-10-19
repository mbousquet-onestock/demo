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
  if (!envelope.ok) throw new Error(`${method} ${path}: ${describeCallError(envelope)}`);
  return envelope.body;
};

const listIn = (body: any): any[] => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.metrics)) return body.metrics;
  if (body.metrics && typeof body.metrics === 'object') return Object.entries(body.metrics).map(([id, x]) => ({ id, ...(x as object) }));
  return (Object.values(body).find(v => Array.isArray(v)) as any[]) || [];
};

// Every metric of the site; when the list only carries the ids, each one is read with GET /metrics/{id}.
export const fetchMetrics = async (): Promise<Metric[]> => {
  const list = listIn(await call('GET', '/metrics', {})).filter(m => m && (m.id || typeof m === 'string'))
    .map(m => (typeof m === 'string' ? { id: m } : { ...m, id: String(m.id) }));
  const out: Metric[] = [];
  for (const m of list) {
    if (Object.keys(m).length > 1 || out.length >= 100) { out.push(m); continue; }
    try {
      const body: any = await call('GET', `/metrics/${encodeURIComponent(m.id)}`, {});
      out.push({ ...(body?.metric || body || {}), id: m.id });
    } catch { out.push(m); }
  }
  return out;
};

// POST (create) or PATCH (update) /metrics/{id} {metric: {name, operator}}; version: Delivery Promise version (current if empty).
export const saveMetric = (m: { id: string; name: string; operator: string }, update: boolean, version?: number) =>
  call(update ? 'PATCH' : 'POST', `/metrics/${encodeURIComponent(m.id)}`, { metric: { name: m.name || m.id, operator: m.operator }, ...(version ? { version } : {}) });
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
