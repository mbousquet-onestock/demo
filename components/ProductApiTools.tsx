import React, { useMemo, useState } from 'react';
import { Product, AppSettings, SavedPayload } from '../types';
import { buildItemsPayload, regenerateProductIds, RegenerateIdsOptions, extractOnestockItems } from '../utils/payloadUtils';
import { onestockRequest, useApiTarget, missingTargetFields, isProductionTarget, describeCallError, ProxyResponseEnvelope, SITE_ID_VAR, TOKEN_VAR } from '../services/onestockClient';
import { savePayload, downloadJson, savedPayloadsStore, listProjects, getLastProject, setLastProject } from '../services/payloadStore';

const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';
const inputClass = 'w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue';

const Drawer: React.FC<{ title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, onClose, wide, children }) => (
  <div className="fixed inset-0 z-[110] flex justify-end animate-in fade-in duration-200">
    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
    <div className={`relative ${wide ? 'w-full max-w-3xl' : 'w-full max-w-md'} bg-white shadow-2xl h-full p-8 overflow-y-auto animate-in slide-in-from-right duration-300 border-l border-gray-200`}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-[#002D72]">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      {children}
    </div>
  </div>
);

interface RegenerateIdsDrawerProps {
  products: Product[];
  onApply: (updated: Product[]) => void;
  onClose: () => void;
}

export const RegenerateIdsDrawer: React.FC<RegenerateIdsDrawerProps> = ({ products, onApply, onClose }) => {
  const [options, setOptions] = useState<RegenerateIdsOptions>({
    prefix: 'DEMO',
    strategy: 'timestamp',
    startAt: 1,
    regenerateParent: true,
    appendSize: true,
  });
  const [seed, setSeed] = useState(0);

  // Recomputed when options change or when the user asks for a new draw (random strategy).
  const preview = useMemo(() => regenerateProductIds(products, options), [products, options, seed]);

  const set = <K extends keyof RegenerateIdsOptions>(key: K, value: RegenerateIdsOptions[K]) =>
    setOptions(prev => ({ ...prev, [key]: value }));

  return (
    <Drawer title="Regenerate product IDs" onClose={onClose} wide>
      <div className="space-y-6">
        <p className="text-sm text-gray-500">
          New <code>id</code> (SKU) and <code>product_id</code> (parent) for the <strong>{products.length}</strong> selected product(s).
          Variants sharing a parent stay grouped under the same new <code>product_id</code>.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Prefix</label>
            <input className={inputClass} value={options.prefix} onChange={e => set('prefix', e.target.value.replace(/\s+/g, ''))} />
          </div>
          <div>
            <label className={labelClass}>Strategy</label>
            <select className={inputClass} value={options.strategy} onChange={e => set('strategy', e.target.value as RegenerateIdsOptions['strategy'])}>
              <option value="timestamp">Timestamp + counter (unique per run)</option>
              <option value="sequential">Sequential (0001, 0002…)</option>
              <option value="random">Random</option>
            </select>
          </div>
          {options.strategy !== 'random' && (
            <div>
              <label className={labelClass}>Start at</label>
              <input type="number" min={0} className={inputClass} value={options.startAt} onChange={e => set('startAt', parseInt(e.target.value) || 0)} />
            </div>
          )}
          <div className="col-span-2 flex flex-col gap-2 text-sm text-gray-600">
            <label className="flex items-center gap-2"><input type="checkbox" checked={options.regenerateParent} onChange={e => set('regenerateParent', e.target.checked)} /> Regenerate parent ID (product_id) too</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={options.appendSize} onChange={e => set('appendSize', e.target.checked)} /> Append size to the item ID</label>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Preview</span>
            {options.strategy === 'random' && <button onClick={() => setSeed(s => s + 1)} className="text-[10px] font-bold text-onestock-blue hover:underline">New draw</button>}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="px-4 py-2">Current SKU / parent</th>
                <th className="px-4 py-2">New SKU / parent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {preview.slice(0, 12).map((p, i) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-gray-500">{products[i].sku}<br /><span className="text-gray-400">{products[i].parentSku}</span></td>
                  <td className="px-4 py-2 font-mono text-[#002D72] font-bold">{p.sku}<br /><span className="text-gray-400 font-normal">{p.parentSku}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 12 && <p className="px-4 py-2 text-[10px] text-gray-400">…and {preview.length - 12} more</p>}
        </div>

        <button
          onClick={() => { onApply(preview); onClose(); }}
          disabled={products.length === 0}
          className="w-full py-4 bg-[#002D72] text-white font-bold rounded-xl hover:bg-[#001F4D] shadow-lg disabled:opacity-40"
        >
          Apply to {products.length} product(s)
        </button>
      </div>
    </Drawer>
  );
};

interface ItemsPushDrawerProps {
  products: Product[];
  settings: AppSettings;
  onClose: () => void;
}

export const ItemsPushDrawer: React.FC<ItemsPushDrawerProps> = ({ products, settings, onClose }) => {
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);
  const [method, setMethod] = useState<'PATCH' | 'POST'>('PATCH');
  const [aggregate, setAggregate] = useState(false);
  const [onlyIfExists, setOnlyIfExists] = useState(false);
  const [name, setName] = useState('');
  const [project, setProject] = useState(getLastProject());
  const projects = listProjects(savedPayloadsStore.use());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ url: string; request: unknown; envelope: ProxyResponseEnvelope } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const payload = useMemo(() => ({
    site_id: SITE_ID_VAR,
    token: TOKEN_VAR,
    aggregate,
    only_if_exists: onlyIfExists,
    ...buildItemsPayload(products, settings),
  }), [products, settings, aggregate, onlyIfExists]);

  const handleSavePayload = (withResult: boolean) => {
    if (!name.trim()) {
      setNotice('Give the payload a name before saving it.');
      return;
    }
    setLastProject(project.trim());
    savePayload({
      name: name.trim(),
      project: project.trim() || undefined,
      source: 'products',
      method,
      path: '/items',
      url: withResult ? result?.url : undefined,
      connectionName: target.siteId || undefined,
      request: withResult && result ? result.request : payload,
      response: withResult ? result?.envelope.body : undefined,
      status: withResult ? result?.envelope.status : undefined,
      durationMs: withResult ? result?.envelope.durationMs : undefined,
    });
    setNotice('Saved in the payload library (see "API Explorer" → Saved payloads).');
  };

  const handleSend = async () => {
    if (targetMissing) return;
    if (isProductionTarget(target) && !window.confirm(`Send ${products.length} item(s) to ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`)) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await onestockRequest({ method, path: '/items', body: payload });
      setResult({ url: res.url, request: res.requestTemplate, envelope: res.envelope });
      if (!res.envelope.ok) setError(describeCallError(res.envelope));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer title="Items payload & API push" onClose={onClose} wide>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Payload for <strong>{products.length}</strong> selected product(s) on sales channel <strong>{settings.salesChannel}</strong>.
          Target: {targetMissing
            ? <span className="text-red-600 font-semibold">missing in API Settings: {targetMissing}</span>
            : <strong>{target.siteId} · {target.baseUrl}</strong>}.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Method</label>
            <select className={inputClass} value={method} onChange={e => setMethod(e.target.value as 'PATCH' | 'POST')}>
              <option value="PATCH">PATCH /items (OneStock spec)</option>
              <option value="POST">POST /items</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 md:mt-6"><input type="checkbox" checked={aggregate} onChange={e => setAggregate(e.target.checked)} /> aggregate</label>
          <label className="flex items-center gap-2 text-sm text-gray-600 md:mt-6"><input type="checkbox" checked={onlyIfExists} onChange={e => setOnlyIfExists(e.target.checked)} /> only_if_exists</label>
        </div>

        <div>
          <label className={labelClass}>{'Payload — {{site_id}} / {{token}} replaced by the API Settings values at send time'}</label>
          <pre className="max-h-[35vh] overflow-auto bg-[#001F4D] text-blue-100 font-mono text-[11px] p-4 rounded-lg whitespace-pre-wrap break-all">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input value={project} onChange={e => setProject(e.target.value)} list="items-push-projects" placeholder="Project" className="w-36 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
          <datalist id="items-push-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Payload name (required to save)" className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
          <button onClick={() => handleSavePayload(false)} disabled={!name.trim()} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Save payload</button>
          <button onClick={() => downloadJson(payload, `onestock_items_${Date.now()}`)} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Download</button>
          <button
            onClick={handleSend}
            disabled={sending || !!targetMissing || products.length === 0}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
          >
            {sending ? 'Sending…' : `${method} /items`}
          </button>
        </div>

        {notice && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{notice}</p>}
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 break-words">{error}</p>}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-1 rounded ${result.envelope.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {result.envelope.status} {result.envelope.statusText}
              </span>
              <span className="text-xs text-gray-400">{result.envelope.durationMs} ms</span>
              <button onClick={() => handleSavePayload(true)} disabled={!name.trim()} className="disabled:opacity-40 ml-auto px-3 py-1.5 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50">Save payload + result</button>
            </div>
            <p className="text-[10px] font-mono text-gray-400 break-all">{result.url}</p>
            <pre className="max-h-[30vh] overflow-auto bg-gray-900 text-gray-100 font-mono text-[11px] p-4 rounded-lg whitespace-pre-wrap break-all">
              {result.envelope.body === null ? '(empty body)' : typeof result.envelope.body === 'string' ? result.envelope.body : JSON.stringify(result.envelope.body, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Drawer>
  );
};

interface SavedItemsPickerProps {
  hasProducts: boolean;
  onOpen: (items: any[], label: string, mode: 'replace' | 'append', project?: string) => void;
  onClose: () => void;
}

interface ItemsCandidate {
  payload: SavedPayload;
  items: any[];
  fromResult: boolean;
}

const NO_PROJECT = '';

// Items of several payloads, one per item id: the most recent payload wins.
const mergeItems = (candidates: ItemsCandidate[]): any[] => {
  const byId = new Map<string, any>();
  [...candidates]
    .sort((a, b) => b.payload.createdAt.localeCompare(a.payload.createdAt))
    .forEach(c => c.items.forEach(item => {
      const id = String(item?.id ?? '');
      if (id && !byId.has(id)) byId.set(id, item);
    }));
  return [...byId.values()];
};

// Saved payloads holding OneStock items (GET /items results, /items payloads), grouped by project.
export const SavedItemsPicker: React.FC<SavedItemsPickerProps> = ({ hasProducts, onOpen, onClose }) => {
  const saved = savedPayloadsStore.use();
  const [project, setProject] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const candidates = useMemo<ItemsCandidate[]>(() => saved
    .map(p => ({ payload: p, items: extractOnestockItems(p.response) || extractOnestockItems(p.request), fromResult: !!extractOnestockItems(p.response) }))
    .filter((c): c is ItemsCandidate => !!c.items), [saved]);
  const projects = listProjects(candidates.map(c => c.payload));

  const q = search.trim().toLowerCase();
  const visible = candidates.filter(({ payload }) =>
    (project === null || (payload.project || NO_PROJECT) === project)
    && (!q || payload.name.toLowerCase().includes(q) || (payload.project || '').toLowerCase().includes(q)));

  const groups = useMemo(() => {
    const map = new Map<string, ItemsCandidate[]>();
    visible.forEach(c => {
      const key = (c.payload.project || '').trim();
      map.set(key, [...(map.get(key) || []), c]);
    });
    return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [visible]);

  const open = (items: any[], label: string, mode: 'replace' | 'append', fromProject?: string) => {
    onOpen(items, label, mode, fromProject || undefined);
    onClose();
  };

  const loadButtons = (items: any[], label: string, fromProject: string | undefined, primary: boolean, wholeProject = false) => (
    <>
      <button
        onClick={() => open(items, label, 'replace', fromProject)}
        className={primary
          ? 'px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]'
          : 'px-3 py-1.5 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50'}
      >
        {wholeProject ? (hasProducts ? 'Replace list with whole project' : 'Open whole project') : (hasProducts ? 'Replace list' : 'Open')}
      </button>
      {hasProducts && (
        <button onClick={() => open(items, label, 'append', fromProject)} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Add to list
        </button>
      )}
    </>
  );

  return (
    <Drawer title="Load saved /items payloads" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Saved payloads containing OneStock items — <code>GET /items</code> results from the API Explorer and <code>/items</code> payloads
          saved from the Product Manager — grouped by project. Load one payload, or a whole project (items merged by id, most recent payload first).
        </p>
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or project…" className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
          <select
            value={project === null ? '__all__' : project}
            onChange={e => setProject(e.target.value === '__all__' ? null : e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
          >
            <option value="__all__">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
            <option value={NO_PROJECT}>No project</option>
          </select>
        </div>
        {groups.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
            No saved payload with items. Save a <code>GET /items</code> result in the API Explorer, or a payload from "Payload &amp; Push /items".
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(([groupProject, entries]) => {
              const merged = mergeItems(entries);
              const title = groupProject || 'No project';
              return (
                <div key={groupProject || '__none__'} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">{title}</span>
                    <span className="text-[11px] text-gray-400">{entries.length} payload(s) · {merged.length} distinct item(s)</span>
                    {groupProject && entries.length > 1 && (
                      <div className="ml-auto flex gap-2">
                        {loadButtons(merged, `all ${entries.length} /items payloads`, groupProject, true, true)}
                      </div>
                    )}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {entries.map(({ payload, items, fromResult }) => (
                      <li key={payload.id} className="p-4 flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-gray-900">{payload.name}</span>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {payload.method} {payload.path} · {fromResult ? 'result' : 'request'} · {items.length} item(s) · {payload.source === 'products' ? 'Product Manager' : 'API Explorer'} · {new Date(payload.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {loadButtons(items, payload.name, payload.project, !(groupProject && entries.length > 1))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
};
