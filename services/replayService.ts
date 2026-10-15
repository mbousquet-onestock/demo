import { OnestockApiVersion, SavedPayload, StockPointSet, OrderBatch } from '../types';
import { onestockRequest, describeCallError, getApiTarget, ProxyResponseEnvelope } from './onestockClient';
import { SOURCE_LABELS } from './payloadStore';

// One API call that can be replayed from the Projects tab.
export interface ReplayItem {
  key: string;
  group: string;
  label: string;
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  version?: OnestockApiVersion;
  // Execution order of a mass replay: parent orders before their orders.
  priority: number;
  // Saved document holding the call (moving it to another project moves the whole document).
  owner: { kind: 'payload' | 'set' | 'batch'; id: string; project?: string };
  lastStatus?: number;
  lastResponse?: unknown;
}

export interface ReplayResult {
  ok: boolean;
  status: number | null;
  message: string;
  durationMs?: number;
  requestId?: string;
  response?: unknown;
  url?: string;
  at: string;
}

const versionFromUrl = (url?: string): OnestockApiVersion | undefined => {
  const m = url?.match(/\/(v[1-4])\//);
  return m ? (m[1] as OnestockApiVersion) : undefined;
};

// v3 / v4 only routes (stock points, orders).
const v3OrV4 = (): OnestockApiVersion => (getApiTarget().version === 'v4' ? 'v4' : 'v3');

export const savedPayloadItems = (payloads: SavedPayload[]): ReplayItem[] =>
  payloads.filter(p => p.request !== undefined).map(p => ({
    key: `payload:${p.id}`,
    group: `Saved payloads`,
    label: `${p.name} · ${SOURCE_LABELS[p.source] || p.source}`,
    method: p.method,
    path: p.path,
    body: (p.request && typeof p.request === 'object' ? p.request : null) as Record<string, unknown> | null,
    version: versionFromUrl(p.url),
    priority: 1,
    owner: { kind: 'payload' as const, id: p.id, project: p.project },
    lastStatus: p.status,
    lastResponse: p.response,
  }));

export const stockPointSetItems = (sets: StockPointSet[]): ReplayItem[] =>
  sets.flatMap(s => s.endpoints.map(ep => ({
    key: `endpoint:${s.id}:${ep.id}`,
    group: `Stock points · ${s.name}`,
    label: `${ep.id} — ${ep.name}`,
    method: 'POST',
    path: '/endpoints',
    body: { endpoint: ep },
    priority: 0,
    owner: { kind: 'set' as const, id: s.id, project: s.project },
    lastStatus: s.pushResults?.[ep.id]?.status ?? undefined,
    lastResponse: s.pushResults?.[ep.id]?.message,
  })));

export const orderBatchItems = (batches: OrderBatch[]): ReplayItem[] =>
  batches.flatMap(b => b.packages.flatMap(pkg => {
    const owner = { kind: 'batch' as const, id: b.id, project: b.project };
    const parentId = pkg.parent.parent_order.id;
    const parentResult = b.pushResults?.[`parent:${parentId}`];
    return [
      {
        key: `parent:${b.id}:${parentId}`,
        group: `Orders · ${b.name}`,
        label: `Parent order ${parentId}`,
        method: 'POST',
        path: '/parent_orders',
        body: pkg.parent,
        version: 'v4' as OnestockApiVersion,
        priority: 2,
        owner,
        lastStatus: parentResult?.status ?? undefined,
        lastResponse: parentResult?.message,
      },
      ...pkg.subOrders.map(o => {
        const r = b.pushResults?.[`order:${o.order.id}`];
        return {
          key: `order:${b.id}:${o.order.id}`,
          group: `Orders · ${b.name}`,
          label: `Order ${o.order.id} (${(o.order.types || []).join('+').toUpperCase()}) · parent ${parentId}`,
          method: 'POST',
          path: '/orders',
          body: o,
          priority: 3,
          owner,
          lastStatus: r?.status ?? undefined,
          lastResponse: r?.message,
        };
      }),
    ];
  }));

const needsV3OrV4 = (path: string) => /^\/(endpoints|orders|items)(\/|$|\?)/.test(path);

export const replayItem = async (item: ReplayItem): Promise<ReplayResult> => {
  const at = new Date().toISOString();
  try {
    const version = item.version || (needsV3OrV4(item.path) ? v3OrV4() : undefined);
    const { url, envelope }: { url: string; envelope: ProxyResponseEnvelope } =
      await onestockRequest({ method: item.method, path: item.path, body: item.body, version });
    return {
      ok: envelope.ok,
      status: envelope.status,
      message: envelope.ok ? `HTTP ${envelope.status}` : describeCallError(envelope),
      durationMs: envelope.durationMs,
      requestId: envelope.headers?.['request-id'],
      response: envelope.body,
      url,
      at,
    };
  } catch (err: any) {
    return { ok: false, status: null, message: err?.message || String(err), at };
  }
};
