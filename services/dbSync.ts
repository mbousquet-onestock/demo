// Keeps the app stores in sync with the Postgres database behind /api/data.
// localStorage stays as an offline cache; the database is the shared copy across browsers.
import type { DataCollection, DataDocument } from '../api/_dataCore';
import { createStore, Store } from './persistedStore';
import { historyStore, settingsStore, stockPointSetsStore, orderBatchesStore, manualStepsStore } from './appStores';
import { hasRealValue } from './onestockClient';
import { savedPayloadsStore } from './payloadStore';

export const DATA_ENDPOINT = '/api/data';
const ACCESS_KEY_STORAGE = 'onestock_db_access_key';
const SYNCED_ONCE_STORAGE = 'onestock_db_synced_once';
const FLUSH_DELAY_MS = 1000;
// Stay below the 4.5 MB request body limit of Vercel functions.
const MAX_REQUEST_BYTES = 3_500_000;

export interface DbStatus {
  state: 'disabled' | 'loading' | 'synced' | 'pending' | 'saving' | 'error';
  message?: string;
  lastSyncAt?: string;
}

export const dbStatusStore = createStore<DbStatus>({ state: 'disabled', message: 'No database access key configured.' });

interface Binding {
  collection: DataCollection;
  store: Store<any>;
  // "list": array of objects with an id, one document each. "value": the whole value in a single document.
  kind: 'list' | 'value';
  docId?: string;
  sort?: (a: any, b: any) => number;
}

const byDesc = (key: string) => (a: any, b: any) => String(b[key] ?? '').localeCompare(String(a[key] ?? ''));

const BINDINGS: Binding[] = [
  { collection: 'history', store: historyStore, kind: 'list', sort: byDesc('id') },
  { collection: 'saved_payloads', store: savedPayloadsStore, kind: 'list', sort: byDesc('createdAt') },
  { collection: 'stock_point_sets', store: stockPointSetsStore, kind: 'list', sort: byDesc('updatedAt') },
  { collection: 'order_batches', store: orderBatchesStore, kind: 'list', sort: byDesc('updatedAt') },
  { collection: 'manual_steps', store: manualStepsStore, kind: 'list', sort: (a, b) => (a.order ?? 0) - (b.order ?? 0) },
  { collection: 'settings', store: settingsStore, kind: 'value', docId: 'app_settings' },
];

// Last JSON sent to / read from the database, per collection and document id.
const snapshots = new Map<DataCollection, Map<string, string>>();
const timers = new Map<DataCollection, ReturnType<typeof setTimeout>>();
const flushing = new Map<DataCollection, Promise<void>>();
let subscribed = false;
let ready = false;

export const getAccessKey = () => {
  try { return localStorage.getItem(ACCESS_KEY_STORAGE) || ''; } catch { return ''; }
};

export const setAccessKey = async (key: string) => {
  try { localStorage.setItem(ACCESS_KEY_STORAGE, key.trim()); } catch { /* memory only */ }
  await initDbSync(true);
};

const toDocs = (b: Binding, value: any): { id: string; data: unknown }[] => {
  if (b.kind === 'value') return [{ id: b.docId!, data: { value } }];
  return (Array.isArray(value) ? value : [])
    .filter(item => item && item.id !== undefined && item.id !== '')
    .map(item => ({ id: String(item.id), data: item }));
};

const fromDocs = (b: Binding, docs: { id: string; data: any }[]): any => {
  if (b.kind === 'value') return docs.find(d => d.id === b.docId)?.data?.value;
  const items = docs.map(d => d.data);
  return b.sort ? items.sort(b.sort) : items;
};

const api = async (init: RequestInit & { query?: string } = {}) => {
  const res = await fetch(`${DATA_ENDPOINT}${init.query || ''}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-App-Key': getAccessKey() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || (res.status === 413 ? 'Request too large for the Vercel function (4.5 MB max).' : `HTTP ${res.status}`));
  }
  return data;
};

const pullCollection = async (collection: DataCollection): Promise<DataDocument[]> => {
  const all: DataDocument[] = [];
  let cursor = '';
  for (;;) {
    const page = await api({ query: `?collection=${collection}&cursor=${encodeURIComponent(cursor)}` });
    all.push(...page.documents);
    if (!page.nextCursor) return all;
    cursor = page.nextCursor;
  }
};

const sendChanges = async (collection: DataCollection, upserts: { id: string; data: unknown; json: string }[], deletes: string[]) => {
  const snapshot = snapshots.get(collection)!;
  if (deletes.length > 0) {
    await api({ method: 'POST', body: JSON.stringify({ collection, deletes }) });
    deletes.forEach(id => snapshot.delete(id));
  }
  let batch: typeof upserts = [];
  let size = 0;
  const sendBatch = async () => {
    if (batch.length === 0) return;
    await api({ method: 'POST', body: JSON.stringify({ collection, upserts: batch.map(({ id, data }) => ({ id, data })) }) });
    batch.forEach(u => snapshot.set(u.id, u.json));
    batch = [];
    size = 0;
  };
  for (const u of upserts) {
    if (u.json.length > MAX_REQUEST_BYTES) {
      throw new Error(`"${collection}/${u.id}" is too large to be saved (${(u.json.length / 1e6).toFixed(1)} MB, max ~3.5 MB).`);
    }
    if (size + u.json.length > MAX_REQUEST_BYTES) await sendBatch();
    batch.push(u);
    size += u.json.length;
  }
  await sendBatch();
};

const flush = async (b: Binding): Promise<void> => {
  if (!ready) return;
  const running = flushing.get(b.collection);
  if (running) { await running; return flush(b); }

  const snapshot = snapshots.get(b.collection)!;
  const docs = toDocs(b, b.store.get()).map(d => ({ ...d, json: JSON.stringify(d.data) }));
  const upserts = docs.filter(d => snapshot.get(d.id) !== d.json);
  const ids = new Set(docs.map(d => d.id));
  const deletes = [...snapshot.keys()].filter(id => !ids.has(id));
  if (upserts.length === 0 && deletes.length === 0) return;

  const job = (async () => {
    dbStatusStore.set({ ...dbStatusStore.get(), state: 'saving', message: `Saving ${b.collection}…` });
    try {
      await sendChanges(b.collection, upserts, deletes);
      if (timers.size === 0 && flushing.size <= 1) {
        dbStatusStore.set({ state: 'synced', lastSyncAt: new Date().toISOString() });
      }
    } catch (err: any) {
      dbStatusStore.set({ state: 'error', message: `Save failed (${b.collection}): ${err?.message || err}` });
    }
  })();
  flushing.set(b.collection, job);
  try { await job; } finally { flushing.delete(b.collection); }
};

const scheduleFlush = (b: Binding) => {
  if (!ready) return;
  clearTimeout(timers.get(b.collection));
  if (dbStatusStore.get().state !== 'error') dbStatusStore.set({ ...dbStatusStore.get(), state: 'pending' });
  timers.set(b.collection, setTimeout(() => {
    timers.delete(b.collection);
    flush(b);
  }, FLUSH_DELAY_MS));
};

export const syncNow = async () => {
  timers.forEach(t => clearTimeout(t));
  timers.clear();
  for (const b of BINDINGS) await flush(b);
};

// --- Legacy "Connections" screen (removed) --------------------------------------------
// Its active instance fills API Settings once (when no token is set there), then the stored
// instances, which held passwords, are deleted from this browser and from the database.
const LEGACY_COLLECTIONS: DataCollection[] = ['connections', 'app_state'];
const LEGACY_LOCAL_KEYS = ['onestock_connections', 'onestock_active_connection'];

const legacyBaseUrl = (c: any): string => {
  if (c.customBaseUrl?.trim()) return c.customBaseUrl.trim().replace(/\/+$/, '');
  if (c.environment === 'custom') return '';
  return `https://${c.siteId}.api${c.environment === 'qualif' ? '.qualif' : ''}.onestock-retail.com`;
};

const applyLegacyConnection = (connections: any[], activeId: unknown) => {
  const active = connections.find(c => c && c.id === activeId) || connections.find(c => c?.token);
  if (!active?.token || hasRealValue(settingsStore.get().token)) return;
  settingsStore.set(prev => ({
    ...prev,
    apiUrl: legacyBaseUrl(active) || prev.apiUrl,
    apiVersion: active.version || prev.apiVersion,
    siteId: active.siteId || prev.siteId,
    token: active.token,
  }));
};

export const migrateLegacyLocalConnections = () => {
  try {
    const connections = JSON.parse(localStorage.getItem('onestock_connections') || '[]');
    const activeId = JSON.parse(localStorage.getItem('onestock_active_connection') || 'null');
    if (Array.isArray(connections) && connections.length > 0) applyLegacyConnection(connections, activeId);
    LEGACY_LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Legacy connections migration skipped', e);
  }
};

const migrateLegacyDbConnections = async () => {
  const [connections, appState] = await Promise.all(LEGACY_COLLECTIONS.map(pullCollection));
  if (connections.length === 0 && appState.length === 0) return;
  const activeId = (appState.find(d => d.id === 'active_connection')?.data as any)?.value;
  applyLegacyConnection(connections.map(d => d.data), activeId);
  for (const [collection, docs] of [['connections', connections], ['app_state', appState]] as const) {
    if (docs.length > 0) await api({ method: 'POST', body: JSON.stringify({ collection, deletes: docs.map(d => d.id) }) });
  }
};

let initRun: Promise<void> | null = null;

// Loads every collection from the database. The first sync of a browser merges its local data
// (local-only documents are uploaded); afterwards the database copy wins.
export const initDbSync = (force = false): Promise<void> => {
  if (initRun && !force) return initRun;
  initRun = (async () => {
    ready = false;
    if (!getAccessKey()) {
      dbStatusStore.set({ state: 'disabled', message: 'No database access key configured.' });
      return;
    }
    dbStatusStore.set({ state: 'loading', message: 'Loading data from the database…' });
    const syncedOnceKey = `${SYNCED_ONCE_STORAGE}:${getAccessKey().slice(0, 4)}`;
    let firstSync = true;
    try { firstSync = !localStorage.getItem(syncedOnceKey); } catch { /* ignore */ }

    try {
      for (const b of BINDINGS) {
        const remote = await pullCollection(b.collection);
        const snapshot = new Map(remote.map(d => [d.id, JSON.stringify(d.data)]));
        snapshots.set(b.collection, snapshot);
        const local = toDocs(b, b.store.get());
        const remoteIds = new Set(remote.map(d => d.id));

        if (b.kind === 'list' && (remote.length > 0 || !firstSync)) {
          // After the first sync the database wins, including deletions made from another browser.
          const localOnly = firstSync ? local.filter(d => !remoteIds.has(d.id)) : [];
          b.store.set(fromDocs(b, [...remote, ...localOnly]));
        } else if (b.kind === 'value' && remote.length > 0) {
          b.store.set(fromDocs(b, remote));
        }
        // Remaining differences (local-only documents, or an empty database) are uploaded.
        ready = true;
        await flush(b);
        ready = false;
      }
      try { localStorage.setItem(syncedOnceKey, '1'); } catch { /* ignore */ }

      if (!subscribed) {
        BINDINGS.forEach(b => b.store.subscribe(() => scheduleFlush(b)));
        subscribed = true;
      }
      ready = true;
      await migrateLegacyDbConnections().catch(err => console.warn('Legacy connections cleanup failed', err));
      if (dbStatusStore.get().state !== 'error') {
        dbStatusStore.set({ state: 'synced', lastSyncAt: new Date().toISOString() });
      }
    } catch (err: any) {
      dbStatusStore.set({ state: 'error', message: `Database unavailable: ${err?.message || err}` });
    }
  })();
  return initRun;
};
