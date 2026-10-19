import { onestockRequest, describeCallError } from './onestockClient';
import { DeliveryRoute } from './deliveryRouteService';

// Delivery Promise metrics (GET /metrics): the keys of the routes' metric_values (cost, CO2…).
export interface Metric {
  id: string;
  name?: string;
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

export const createMetric = (body: Record<string, unknown>) => call('POST', '/metrics', body);
export const deleteMetric = (id: string) => call('DELETE', `/metrics/${encodeURIComponent(id)}`, {});

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
