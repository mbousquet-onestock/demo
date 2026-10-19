import { OnestockApiVersion, SavedPayload, StockPointSet, OrderBatch, DeliveryScript } from '../types';
import { onestockRequest, describeCallError, getApiTarget, ProxyResponseEnvelope } from './onestockClient';
import { SOURCE_LABELS, savedPayloadsStore } from './payloadStore';
import { stockPointSetsStore, orderBatchesStore, deliveryScriptsStore } from './appStores';
import { OPERATION_KINDS } from './deliveryScriptService';
import { withOpeningHours247 } from './stockPointService';

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
  owner: { kind: 'payload' | 'set' | 'batch' | 'script'; id: string; project?: string; part?: string };
  // part: endpoint id (stock point set), "parent:<id>" / "order:<id>" (order batch).
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
    body: { endpoint: withOpeningHours247(ep) },
    priority: 0,
    owner: { kind: 'set' as const, id: s.id, project: s.project, part: ep.id },
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
        owner: { ...owner, part: `parent:${parentId}` },
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
          owner: { ...owner, part: `order:${o.order.id}` },
          lastStatus: r?.status ?? undefined,
          lastResponse: r?.message,
        };
      }),
    ];
  }));

// Delivery Promise configuration scripts: timetables, then zones, then routes (before every other call).
export const deliveryScriptItems = (scripts: DeliveryScript[]): ReplayItem[] =>
  scripts.flatMap(sc => sc.operations.map(op => {
    const meta = OPERATION_KINDS[op.kind];
    return {
      key: `script:${sc.id}:${op.id}`,
      group: `Delivery config · ${sc.name}`,
      label: `${meta.label} ${op.body?.id || ''} — ${op.label}`,
      method: 'POST',
      path: meta.path,
      body: { [meta.key]: op.body },
      priority: meta.order - 3,
      owner: { kind: 'script' as const, id: sc.id, project: sc.project, part: op.id },
      lastStatus: op.result?.status ?? undefined,
      lastResponse: op.result?.message,
    };
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

// Deletes the saved calls: a saved payload, a stock point of its set, an order (a parent order removes its
// sub-orders). A set / batch left empty is deleted.
export const deleteReplayItems = (items: ReplayItem[]) => {
  const now = new Date().toISOString();
  const payloadIds = new Set(items.filter(i => i.owner.kind === 'payload').map(i => i.owner.id));
  const parts = (kind: string) => {
    const map = new Map<string, Set<string>>();
    items.filter(i => i.owner.kind === kind && i.owner.part).forEach(i => map.set(i.owner.id, (map.get(i.owner.id) || new Set()).add(i.owner.part!)));
    return map;
  };
  const setParts = parts('set');
  const scriptParts = parts('script');
  if (scriptParts.size) deliveryScriptsStore.set(prev => prev.flatMap(sc => {
    const gone = scriptParts.get(sc.id);
    if (!gone) return [sc];
    const operations = sc.operations.filter(o => !gone.has(o.id));
    return operations.length ? [{ ...sc, operations, updatedAt: now }] : [];
  }));
  const batchParts = parts('batch');

  if (payloadIds.size) savedPayloadsStore.set(prev => prev.filter(p => !payloadIds.has(p.id)));
  if (setParts.size) stockPointSetsStore.set(prev => prev.flatMap(s => {
    const gone = setParts.get(s.id);
    if (!gone) return [s];
    const endpoints = s.endpoints.filter(ep => !gone.has(ep.id));
    if (endpoints.length === 0) return [];
    const pushResults = s.pushResults && Object.fromEntries(Object.entries(s.pushResults).filter(([id]) => !gone.has(id)));
    return [{ ...s, endpoints, pushResults, count: endpoints.length, updatedAt: now }];
  }));
  if (batchParts.size) orderBatchesStore.set(prev => prev.flatMap(b => {
    const gone = batchParts.get(b.id);
    if (!gone) return [b];
    const packages = b.packages
      .filter(pkg => !gone.has(`parent:${pkg.parent.parent_order.id}`))
      .map(pkg => ({ ...pkg, subOrders: pkg.subOrders.filter(o => !gone.has(`order:${o.order.id}`)) }))
      .filter(pkg => pkg.subOrders.length > 0);
    if (packages.length === 0) return [];
    const keep = new Set(packages.flatMap(pkg => [`parent:${pkg.parent.parent_order.id}`, ...pkg.subOrders.map(o => `order:${o.order.id}`)]));
    const pushResults = b.pushResults && Object.fromEntries(Object.entries(b.pushResults).filter(([k]) => keep.has(k)));
    return [{ ...b, packages, pushResults, updatedAt: now }];
  }));
};
