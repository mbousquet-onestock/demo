import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Product, AppSettings, OrderBatch } from '../types';
import {
  generateOrderPackages, generateOrderCustomers, priceMissingArticles, validateConfig, incrementId, hasPrice,
  OrderGenerationConfig, OrderPackage, OrderStrategy, ORDER_STRATEGIES, OrderIds, nextFreeIds,
} from '../services/orderService';
import { fetchSalesChannels } from '../services/salesChannelService';
import { getAiStatus, AiStatus } from '../services/aiService';
import { mergeIds } from '../utils/endpointUtils';
import { orderBatchesStore } from '../services/appStores';
import { savedPayloadsStore, listProjects, getLastProject, setLastProject } from '../services/payloadStore';
import { useApiTarget, missingTargetFields, isProductionTarget } from '../services/onestockClient';
import { pushOrderPackages, parentKey, orderKey, OrderPushResult } from '../services/orderPushService';
import StockPointsPicker from './StockPointsPicker';

interface StepOrderGenerationProps {
  products: Product[];
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onCancel: () => void;
}

const CONFIG_KEY = 'onestock_order_generation_config';
const labelTight = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest';
const labelClass = `${labelTight} mb-2`;
const inputClass = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue';

const STRATEGY_LABELS: Record<OrderStrategy, string> = {
  sfs: 'Ship from store (home delivery)',
  ckc: 'Click & collect',
  ropis: 'Reserve & collect',
};

const defaultParentId = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}000001`;
};

type StoredConfig = Omit<OrderGenerationConfig, 'salesChannels' | 'deliveryPoints' | 'currency' | 'countries'> & { countryCodes: string[] };

const loadConfig = (settings: AppSettings): StoredConfig => {
  const defaults: StoredConfig = {
    strategies: ['sfs'],
    orderCount: 3,
    subOrdersMin: 1,
    subOrdersMax: 2,
    itemsMin: 1,
    itemsMax: 3,
    qtyMin: 1,
    qtyMax: 2,
    countryCodes: [settings.deliveryCountries[0]?.code || 'FR'],
    salesChannel: '',
    parentOrderId: defaultParentId(),
    orderIdPrefix: '{TYPE}-',
    startIndex: 1,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    // Earlier versions stored a single country.
    if (!Array.isArray(stored.countryCodes) && stored.countryCode) stored.countryCodes = [stored.countryCode];
    delete stored.countryCode;
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
};

const NumberRange: React.FC<{ label: string; min: number; max: number; onChange: (min: number, max: number) => void; limit?: number }> = ({ label, min, max, onChange, limit = 999 }) => (
  <div>
    <label className={labelClass}>{label}</label>
    <div className="flex items-center gap-2">
      <input type="number" min={1} max={limit} value={min} onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 1), max)} className={inputClass} title="min" />
      <span className="text-gray-400 text-xs">to</span>
      <input type="number" min={1} max={limit} value={max} onChange={e => onChange(min, Math.max(1, parseInt(e.target.value) || 1))} className={inputClass} title="max" />
    </div>
  </div>
);

const StepOrderGeneration: React.FC<StepOrderGenerationProps> = ({ products, settings, onUpdateSettings, onCancel }) => {
  const [config, setConfig] = useState<StoredConfig>(() => loadConfig(settings));
  const set = (patch: Partial<StoredConfig>) => setConfig(prev => ({ ...prev, ...patch }));
  useEffect(() => {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }, [config]);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const aiAvailable = !!settings.openaiApiKey?.trim() || !!aiStatus?.serverKey;
  const [aiCustomers, setAiCustomers] = useState(true);
  const [aiPrices, setAiPrices] = useState(true);

  const channels = settings.salesChannelsCache || [];
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  const [newCountry, setNewCountry] = useState({ code: '', name: '', currency: 'EUR' });
  const [showAddCountry, setShowAddCountry] = useState(false);

  const deliveryPoints = settings.orderDeliveryPoints || [];
  const [newPoint, setNewPoint] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // Current batch (generated or reopened); `dirty` until saved.
  const [batch, setBatch] = useState<OrderBatch | null>(null);
  const [dirty, setDirty] = useState(false);
  const packages: OrderPackage[] | null = batch?.packages || null;
  const batches = orderBatchesStore.use();
  const savedPayloads = savedPayloadsStore.use();
  const projects = useMemo(() => listProjects([...savedPayloads, ...batches]), [savedPayloads, batches]);
  const [batchProjectFilter, setBatchProjectFilter] = useState('');
  const [toMerge, setToMerge] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState('');
  const [mergeProject, setMergeProject] = useState('');
  const [deleteMerged, setDeleteMerged] = useState(false);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);
  const [createParents, setCreateParents] = useState(true);
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [openPackage, setOpenPackage] = useState<number | null>(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  useEffect(() => { getAiStatus().then(setAiStatus); }, []);

  const loadChannels = async () => {
    setLoadingChannels(true);
    setChannelsError(null);
    try {
      const list = await fetchSalesChannels();
      onUpdateSettings({ salesChannelsCache: list });
      if (config.salesChannel && !list.some(c => c.id === config.salesChannel)) set({ salesChannel: '' });
    } catch (err: any) {
      setChannelsError(err?.message || String(err));
    } finally {
      setLoadingChannels(false);
    }
  };
  // First visit: load the sales channels from OneStock.
  useEffect(() => { if (channels.length === 0) loadChannels(); }, []);

  // Order ids are kept in the settings (database), shared by every browser.
  const ids: OrderIds = settings.orderIds || { parentOrderId: config.parentOrderId, orderIdPrefix: config.orderIdPrefix, startIndex: config.startIndex };
  const setIds = (patch: Partial<OrderIds>) => onUpdateSettings({ orderIds: { ...ids, ...patch } });

  const selectedCountries = settings.deliveryCountries.filter(c => config.countryCodes.includes(c.code));
  const channel = channels.find(c => c.id === config.salesChannel);
  const currency = channel?.currency || selectedCountries[0]?.currency || products.find(p => p.currency)?.currency || 'EUR';
  const missingPrices = useMemo(() => products.filter(p => !hasPrice(p)).length, [products]);
  const needsPoints = config.strategies.some(s => s !== 'sfs');

  const fullConfig: OrderGenerationConfig = {
    ...config,
    ...ids,
    countries: selectedCountries,
    currency,
    salesChannels: channels.map(c => c.id),
    channelCurrencies: Object.fromEntries(channels.filter(c => c.currency).map(c => [c.id, c.currency!])),
    deliveryPoints,
  };

  const toggleStrategy = (s: OrderStrategy) =>
    set({ strategies: config.strategies.includes(s) ? config.strategies.filter(x => x !== s) : [...config.strategies, s] });

  const addCountry = () => {
    const code = newCountry.code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || !newCountry.name.trim()) return;
    const entry = { code, name: newCountry.name.trim(), currency: newCountry.currency.trim().toUpperCase() || undefined };
    onUpdateSettings({ deliveryCountries: [...settings.deliveryCountries.filter(c => c.code !== code), entry] });
    set({ countryCodes: Array.from(new Set([...config.countryCodes, code])) });
    setNewCountry({ code: '', name: '', currency: 'EUR' });
    setShowAddCountry(false);
  };

  const toggleCountry = (code: string) =>
    set({ countryCodes: config.countryCodes.includes(code) ? config.countryCodes.filter(c => c !== code) : [...config.countryCodes, code] });

  const removeCountry = (code: string) => {
    const c = settings.deliveryCountries.find(x => x.code === code);
    if (!c || !window.confirm(`Delete ${c.name} (${c.code}) from the saved destination countries?`)) return;
    onUpdateSettings({ deliveryCountries: settings.deliveryCountries.filter(x => x.code !== code) });
    set({ countryCodes: config.countryCodes.filter(x => x !== code) });
  };

  const setPoints = (ids: string[]) => onUpdateSettings({ orderDeliveryPoints: ids });
  const addPoint = () => {
    const id = newPoint.trim();
    if (!id || deliveryPoints.includes(id)) return;
    setPoints([...deliveryPoints, id]);
    setNewPoint('');
  };

  const handleGenerate = async () => {
    const invalid = validateConfig(fullConfig, products);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setWarning(null);
    const useAi = aiAvailable;
    const warnings: string[] = [];
    try {
      setProgress('Generating customers…');
      const { customers, warnings: customerWarnings } = await generateOrderCustomers(
        config.orderCount, selectedCountries, useAi && aiCustomers, (d, t) => setProgress(`Generating customers ${d} / ${t}…`));
      warnings.push(...customerWarnings);

      let prices: Record<string, number> = {};
      if (missingPrices > 0) {
        setProgress(`Pricing ${missingPrices} article(s)…`);
        try {
          prices = await priceMissingArticles(products, currency, useAi && aiPrices, (d, t) => setProgress(`Pricing articles ${d} / ${t}…`));
        } catch (err: any) {
          warnings.push(`AI pricing failed (${err?.message || err}): random prices used.`);
          prices = await priceMissingArticles(products, currency, false);
        }
      }

      // Never reuse an id of a saved batch (it may already exist in OneStock).
      const usedParents = new Set<string>();
      const usedOrders = new Set<string>();
      [...batches.map(b => b.packages), ...(batch ? [batch.packages] : [])].flat().forEach(p => {
        usedParents.add(p.parent.parent_order.id);
        p.subOrders.forEach(o => usedOrders.add(o.order.id));
      });
      const free = nextFreeIds(ids, usedParents, usedOrders);
      if (free.moved) warnings.push(`Ids moved to ${free.ids.parentOrderId} / ${free.ids.startIndex} to skip ids already used by saved batches.`);

      const result = generateOrderPackages({ ...fullConfig, ...free.ids }, products, customers, prices);
      const now = new Date().toISOString();
      setBatch({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        name: `Orders ${new Date().toLocaleString()}`,
        project: getLastProject() || undefined,
        createdAt: now,
        updatedAt: now,
        packages: result,
      });
      setDirty(true);
      setPushNotice(null);
      setOpenPackage(0);
      const subCount = result.reduce((n, p) => n + p.subOrders.length, 0);
      // Next batch continues the numbering.
      setIds({ parentOrderId: incrementId(free.ids.parentOrderId, config.orderCount), startIndex: free.ids.startIndex + subCount });
      if (!useAi && (aiCustomers || (aiPrices && missingPrices > 0))) warnings.push('No OpenAI key (API Settings): sample identities / random prices used.');
      setWarning(warnings.length ? warnings.join(' ') : null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setProgress(null);
    }
  };

  const updateBatch = (patch: Partial<OrderBatch>) => {
    setBatch(prev => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const saveBatch = (toSave: OrderBatch | null = batch) => {
    if (!toSave) return null;
    const saved = { ...toSave, name: toSave.name.trim() || `Orders ${new Date().toLocaleString()}`, updatedAt: new Date().toISOString() };
    orderBatchesStore.set(prev => [saved, ...prev.filter(b => b.id !== saved.id)]);
    if (saved.project) setLastProject(saved.project);
    setBatch(saved);
    setDirty(false);
    return saved;
  };

  const openBatch = (b: OrderBatch) => {
    if (dirty && !window.confirm('Discard the unsaved generated orders?')) return;
    setBatch(b);
    setDirty(false);
    setOpenPackage(0);
    setPushNotice(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const deleteBatch = (b: OrderBatch) => {
    if (!window.confirm(`Delete the saved batch "${b.name}"? (Orders already created in OneStock are not deleted.)`)) return;
    orderBatchesStore.set(prev => prev.filter(x => x.id !== b.id));
    if (batch?.id === b.id) { setBatch(null); setDirty(false); }
  };

  const toggleMerge = (b: OrderBatch) => {
    const next = toMerge.includes(b.id) ? toMerge.filter(id => id !== b.id) : [...toMerge, b.id];
    setToMerge(next);
    setMergeNotice(null);
    if (next.length > 0 && toMerge.length === 0) {
      setMergeProject(b.project || '');
      setMergeName('');
    }
  };

  // Several saved batches → one batch: packages concatenated (a parent order present twice is kept once),
  // creation results kept.
  const mergeBatches = () => {
    const selected = batches.filter(b => toMerge.includes(b.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (selected.length < 2) return;
    const seen = new Set<string>();
    const packagesMerged = selected.flatMap(b => b.packages).filter(p => {
      const id = p.parent.parent_order.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const duplicates = selected.reduce((n, b) => n + b.packages.length, 0) - packagesMerged.length;
    const now = new Date().toISOString();
    const merged: OrderBatch = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name: mergeName.trim() || `Merged: ${selected.map(b => b.name).join(' + ')}`,
      project: mergeProject.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      packages: packagesMerged,
      pushResults: Object.assign({}, ...selected.map(b => b.pushResults || {})),
    };
    orderBatchesStore.set(prev => [merged, ...prev.filter(b => !(deleteMerged && toMerge.includes(b.id)))]);
    if (deleteMerged && batch && toMerge.includes(batch.id)) { setBatch(null); setDirty(false); }
    setToMerge([]);
    setMergeNotice(`"${merged.name}" created from ${selected.length} batches: ${packagesMerged.length} order(s)${duplicates ? `, ${duplicates} duplicate parent order(s) ignored` : ''}${deleteMerged ? ', originals deleted' : ''}.`);
  };

  const results: Record<string, OrderPushResult> = batch?.pushResults || {};
  const subOrderIds = packages ? packages.flatMap(p => p.subOrders.map(o => o.order.id)) : [];
  const createdCount = subOrderIds.filter(id => results[orderKey(id)]?.ok).length;
  const failedCount = subOrderIds.filter(id => results[orderKey(id)] && !results[orderKey(id)].ok).length;

  const pushOrders = async (onlyRemaining: boolean) => {
    if (!batch || targetMissing) return;
    const remaining = subOrderIds.length - (onlyRemaining ? createdCount : 0);
    if (isProductionTarget(target) && !window.confirm(`Create ${remaining} order(s) on ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`)) return;
    setPushing('Creating…');
    setPushNotice(null);
    const base = batch;
    try {
      const pushed = await pushOrderPackages(base.packages, { createParents, previous: onlyRemaining ? base.pushResults : undefined },
        (partial, done, total) => {
          setPushing(`Creating ${done} / ${total}…`);
          setBatch(prev => (prev ? { ...prev, pushResults: { ...(base.pushResults || {}), ...partial } } : prev));
        });
      // Results are kept with the saved batch.
      saveBatch({ ...base, pushResults: { ...(base.pushResults || {}), ...pushed } });
      const all = { ...(base.pushResults || {}), ...pushed };
      const ok = subOrderIds.filter(id => all[orderKey(id)]?.ok).length;
      setPushNotice(ok === subOrderIds.length
        ? `${ok} order(s) created in OneStock.`
        : `${ok} / ${subOrderIds.length} order(s) created — see the statuses below and API Logs.`);
    } finally {
      setPushing(null);
    }
  };

  const statusBadge = (r?: OrderPushResult) => r
    ? <span title={r.message} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.ok ? 'Created' : `Error ${r.status ?? ''}`}</span>
    : null;

  const handleCopy = (content: any, label: string) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 4));
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleDownloadZip = async () => {
    if (!packages) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      packages.forEach(pkg => {
        const folder = zip.folder(pkg.parent.parent_order.id);
        folder?.file('parent_order.json', JSON.stringify(pkg.parent, null, 4));
        pkg.subOrders.forEach(o => folder?.file(`orders/${o.order.id}.json`, JSON.stringify(o, null, 4)));
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `onestock_orders_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setIsZipping(false);
    }
  };

  const totalSubOrders = packages?.reduce((n, p) => n + p.subOrders.length, 0) || 0;
  const previewId = `${ids.orderIdPrefix.replace(/\{TYPE\}/gi, (config.strategies[0] || 'sfs').toUpperCase())}${String(ids.startIndex).padStart(3, '0')}`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      <datalist id="order-batch-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>

      {isPickerOpen && (
        <StockPointsPicker
          hasEndpoints={deliveryPoints.length > 0}
          onLoad={(ids, _label, mode) => setPoints(mode === 'replace' ? ids : mergeIds(deliveryPoints, ids))}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-[#002D72]">Customer Order Generation</h2>
          <p className="text-sm text-gray-500 mt-1">Configure, generate, review, then create the orders in OneStock.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-bold text-onestock-blue bg-blue-50 px-2 py-1 rounded-full uppercase tracking-widest border border-blue-100">{products.length} item(s) selected</span>
          {missingPrices > 0 && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-full uppercase tracking-widest border border-amber-100">{missingPrices} without price</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-4">
          {/* 1. What */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-bold text-[#002D72]"><span className="inline-flex w-6 h-6 rounded-full bg-[#002D72] text-white text-xs items-center justify-center mr-2">1</span>Orders</h3>
            <div>
              <label className={labelClass}>Strategies (one drawn per sub-order)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ORDER_STRATEGIES.map(s => {
                  const active = config.strategies.includes(s);
                  return (
                    <button key={s} onClick={() => toggleStrategy(s)} className={`px-4 py-3 rounded-xl border text-left transition-all ${active ? 'bg-[#002D72] border-[#002D72] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-200'}`}>
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${active ? 'bg-white text-[#002D72] border-white' : 'border-gray-300'}`}>{active ? '✓' : ''}</span>
                        {s}
                      </span>
                      <span className={`block text-[11px] mt-0.5 ${active ? 'text-white/70' : 'text-gray-400'}`}>{STRATEGY_LABELS[s]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>Orders</label>
                <input type="number" min={1} max={200} value={config.orderCount} onChange={e => set({ orderCount: Math.max(1, Math.min(200, parseInt(e.target.value) || 1)) })} className={inputClass} />
              </div>
              <NumberRange label="Sub-orders / order" min={config.subOrdersMin} max={config.subOrdersMax} onChange={(a, b) => set({ subOrdersMin: a, subOrdersMax: b })} limit={20} />
              <NumberRange label="Items / sub-order" min={config.itemsMin} max={config.itemsMax} onChange={(a, b) => set({ itemsMin: a, itemsMax: b })} limit={50} />
              <NumberRange label="Quantity / item" min={config.qtyMin} max={config.qtyMax} onChange={(a, b) => set({ qtyMin: a, qtyMax: b })} />
            </div>
          </section>

          {/* 2. Where */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-bold text-[#002D72]"><span className="inline-flex w-6 h-6 rounded-full bg-[#002D72] text-white text-xs items-center justify-center mr-2">2</span>Market</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Destination countries ({selectedCountries.length})</label>
                  <button onClick={() => setShowAddCountry(v => !v)} className="text-[10px] font-bold text-onestock-blue hover:underline">{showAddCountry ? 'Cancel' : '+ Add'}</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {settings.deliveryCountries.map(c => {
                    const active = config.countryCodes.includes(c.code);
                    return (
                      <span key={c.code} className={`flex items-center rounded-lg border text-xs font-bold ${active ? 'bg-[#002D72] border-[#002D72] text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                        <button onClick={() => toggleCountry(c.code)} className="pl-2.5 pr-1.5 py-1.5" title={active ? 'Click to deselect' : 'Click to select'}>
                          {c.code} <span className={`font-normal ${active ? 'text-white/70' : 'text-gray-400'}`}>{c.name}{c.currency ? ` · ${c.currency}` : ''}</span>
                        </button>
                        <button onClick={() => removeCountry(c.code)} className={`pr-2 pl-1 py-1.5 ${active ? 'text-white/40 hover:text-white' : 'text-gray-300 hover:text-red-500'}`} title="Delete from the saved countries">✕</button>
                      </span>
                    );
                  })}
                  {settings.deliveryCountries.length === 0 && <span className="text-xs text-gray-400">No country yet: add one.</span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Click to select · one selected country is drawn per order (evenly spread).</p>
                {showAddCountry && (
                  <div className="flex gap-2 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <input value={newCountry.code} onChange={e => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase().slice(0, 2) })} placeholder="DE" className={inputClass + ' w-16'} title="ISO code" />
                    <input value={newCountry.name} onChange={e => setNewCountry({ ...newCountry, name: e.target.value })} placeholder="Germany" className={inputClass} />
                    <input value={newCountry.currency} onChange={e => setNewCountry({ ...newCountry, currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" className={inputClass + ' w-20'} title="Currency" />
                    <button onClick={addCountry} disabled={!/^[A-Za-z]{2}$/.test(newCountry.code) || !newCountry.name.trim()} className="px-3 py-2 bg-onestock-blue text-white font-bold text-xs rounded-lg disabled:opacity-40">Add</button>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sales channel</label>
                  <button onClick={loadChannels} disabled={loadingChannels} className="text-[10px] font-bold text-onestock-blue hover:underline disabled:opacity-50">{loadingChannels ? 'Loading…' : '↻ Reload from OneStock'}</button>
                </div>
                <select value={config.salesChannel} onChange={e => set({ salesChannel: e.target.value })} className={inputClass}>
                  <option value="">{channels.length ? `Random among the ${channels.length} channel(s)` : '— no sales channel loaded —'}</option>
                  {channels.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.id}{c.name || c.description ? ` — ${c.name || c.description}` : ''}{c.currency ? ` (${c.currency})` : ''}
                    </option>
                  ))}
                </select>
                {channelsError && <p className="text-[11px] text-red-600 mt-1 break-words">{channelsError}</p>}
              </div>
            </div>

            {needsPoints && (
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Collection points for CKC / ROPIS ({deliveryPoints.length})</label>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <input value={newPoint} onChange={e => setNewPoint(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPoint()} placeholder="Endpoint id…" className="w-36 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <button onClick={addPoint} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Add</button>
                    <button onClick={() => setPoints(mergeIds(deliveryPoints, settings.stockEndpoints))} disabled={settings.stockEndpoints.length === 0} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40" title="Stock points of the Stock Manager">+ Stock Manager</button>
                    <button onClick={() => setIsPickerOpen(true)} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Load stock points</button>
                    {deliveryPoints.length > 0 && <button onClick={() => setPoints([])} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Clear</button>}
                  </div>
                </div>
                {deliveryPoints.length === 0
                  ? <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">Add at least one collection point — one is drawn per CKC / ROPIS sub-order.</p>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {deliveryPoints.map(ep => (
                        <span key={ep} className="bg-blue-50 border border-blue-100 pl-2.5 pr-1.5 py-1 rounded-lg flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-bold text-onestock-blue">{ep}</span>
                          <button onClick={() => setPoints(deliveryPoints.filter(p => p !== ep))} className="text-blue-300 hover:text-red-500">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </section>

          {/* 3. Ids & data */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-bold text-[#002D72]"><span className="inline-flex w-6 h-6 rounded-full bg-[#002D72] text-white text-xs items-center justify-center mr-2">3</span>Ids & customer data</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
              <label className={labelTight}>First parent order id</label>
              <label className={labelTight + ' hidden sm:block'}>Sub-order id prefix</label>
              <label className={labelTight + ' hidden sm:block'}>Next sub-order number</label>
              <input value={ids.parentOrderId} onChange={e => setIds({ parentOrderId: e.target.value.trim() })} className={inputClass + ' font-mono'} />
              <label className={labelTight + ' mt-3 sm:hidden'}>Sub-order id prefix</label>
              <input value={ids.orderIdPrefix} onChange={e => setIds({ orderIdPrefix: e.target.value })} className={inputClass + ' font-mono'} />
              <label className={labelTight + ' mt-3 sm:hidden'}>Next sub-order number</label>
              <input type="number" min={0} value={ids.startIndex} onChange={e => setIds({ startIndex: parseInt(e.target.value) || 0 })} className={inputClass + ' font-mono'} />
              <p className="text-[10px] text-gray-400">Shared by all browsers · ids of saved batches are skipped</p>
              <p className="text-[10px] text-gray-400">{'{TYPE}'} → SFS / CKC / ROPIS</p>
              <p className="text-[10px] text-gray-400">Continues after each batch · next: <span className="font-mono">{previewId}</span></p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 items-center">
              <div>
                <p className="text-xs font-bold text-gray-700">ChatGPT</p>
                <p className="text-[10px] text-gray-400">{aiAvailable ? 'Key from API Settings' : <span className="text-amber-600">No key in API Settings — sample data used</span>}</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={aiCustomers} disabled={!aiAvailable} onChange={e => setAiCustomers(e.target.checked)} />
                Customers & addresses
              </label>
              {missingPrices > 0
                ? (
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={aiPrices} disabled={!aiAvailable} onChange={e => setAiPrices(e.target.checked)} />
                    Prices of {missingPrices} article(s) without price
                  </label>
                )
                : <span className="text-xs text-gray-400">All selected articles have a price</span>}
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className="xl:sticky xl:top-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#002D72] uppercase tracking-widest">Summary</h3>
          <dl className="text-xs space-y-2">
            {[
              ['Strategies', config.strategies.length ? config.strategies.map(s => s.toUpperCase()).join(', ') : '—'],
              ['Orders', `${config.orderCount} parent order(s)`],
              ['Sub-orders', `${config.orderCount * config.subOrdersMin}${config.subOrdersMax !== config.subOrdersMin ? ` – ${config.orderCount * config.subOrdersMax}` : ''}`],
              ['Lines / sub-order', `${config.itemsMin}${config.itemsMax !== config.itemsMin ? `–${config.itemsMax}` : ''} item(s) × ${config.qtyMin}${config.qtyMax !== config.qtyMin ? `–${config.qtyMax}` : ''}`],
              ['Countries', selectedCountries.length ? selectedCountries.map(c => c.code).join(', ') : '—'],
              ['Sales channel', channel ? `${channel.id}${channel.name ? ` — ${channel.name}` : ''}` : (channels.length ? 'random' : '—')],
              ['Currency', config.salesChannel ? currency : 'per channel / country'],
              ...(needsPoints ? [['Collection points', `${deliveryPoints.length}`]] : []),
              ['Customers', aiAvailable && aiCustomers ? 'ChatGPT' : 'sample data'],
              ['Parent ids', config.orderCount > 1 ? `${ids.parentOrderId} → …${incrementId(ids.parentOrderId, config.orderCount - 1).slice(-4)}` : ids.parentOrderId],
              ['First sub-order', previewId],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-gray-400 shrink-0">{k}</dt>
                <dd className="font-bold text-gray-800 text-right break-words min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
          <button
            onClick={handleGenerate}
            disabled={!!progress || products.length === 0}
            className="w-full py-3 bg-[#002D72] text-white font-bold rounded-xl hover:bg-[#001F4D] shadow-lg text-sm disabled:opacity-50"
          >
            {progress || `Generate ${config.orderCount} order(s)`}
          </button>
          {products.length === 0 && (
            <p className="text-xs text-amber-700">
              No article selected: orders are built from the articles selected in the Product Manager.{' '}
              <button onClick={onCancel} className="font-bold underline">Open the Product Manager</button>
            </p>
          )}
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
          {warning && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{warning}</p>}
        </aside>
      </div>

      {packages && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[#002D72] flex items-center gap-2">
              Generated orders
              <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{packages.length} parent(s) · {totalSubOrders} sub-order(s)</span>
            </h3>
            <button onClick={handleDownloadZip} disabled={isZipping} className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-50">
              {isZipping ? 'Zipping…' : 'Download ZIP package'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input value={batch?.project || ''} onChange={e => updateBatch({ project: e.target.value || undefined })} list="order-batch-projects" placeholder="Project" className="w-44 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
              <input value={batch?.name || ''} onChange={e => updateBatch({ name: e.target.value })} placeholder="Batch name" className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
              <button onClick={() => { saveBatch(); setPushNotice('Batch saved.'); }} className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50">Save batch</button>
              {dirty && <span className="text-[11px] font-bold text-amber-600">unsaved</span>}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-600">Create in OneStock</span>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={createParents} onChange={e => setCreateParents(e.target.checked)} />
                Parent orders first (POST /parent_orders, v4)
              </label>
              <button onClick={() => pushOrders(false)} disabled={!!pushing || !!targetMissing} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {pushing || `POST /orders (${subOrderIds.length})`}
              </button>
              {(failedCount > 0 || (createdCount > 0 && createdCount < subOrderIds.length)) && !pushing && (
                <button onClick={() => pushOrders(true)} disabled={!!targetMissing} className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                  Retry not created ({subOrderIds.length - createdCount})
                </button>
              )}
              <span className="text-[11px] text-gray-500">
                {createdCount} created · {failedCount} failed · {targetMissing ? <span className="text-red-600">Missing in API Settings: {targetMissing}</span> : <>target <strong>{target.siteId}</strong> · {target.baseUrl}</>}
              </span>
            </div>
            {pushNotice && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{pushNotice}</p>}
          </div>

          {packages.map((pkg, i) => {
            const isOpen = openPackage === i;
            return (
              <div key={pkg.parent.parent_order.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button onClick={() => setOpenPackage(isOpen ? null : i)} className="w-full px-5 py-3 flex flex-wrap items-center gap-3 text-left hover:bg-gray-50">
                  <span className="font-mono font-bold text-sm text-[#002D72]">{pkg.parent.parent_order.id}</span>
                  {statusBadge(results[parentKey(pkg.parent.parent_order.id)])}
                  {pkg.subOrders.some(o => results[orderKey(o.order.id)]) && (
                    <span className="text-[10px] font-bold text-gray-500">{pkg.subOrders.filter(o => results[orderKey(o.order.id)]?.ok).length}/{pkg.subOrders.length} sub-orders created</span>
                  )}
                  {pkg.country && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{pkg.country}</span>}
                  <span className="text-xs text-gray-600">{pkg.customer.first_name} {pkg.customer.last_name} · {pkg.customer.address.zip_code} {pkg.customer.address.city}</span>
                  <span className="text-xs text-gray-400">{pkg.subOrders.map(o => o.order.id).join(', ')}</span>
                  <span className="ml-auto text-xs font-bold text-gray-700">{pkg.parent.parent_order.pricing_details.price} {pkg.parent.parent_order.pricing_details.currency}</span>
                </button>
                {isOpen && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 bg-gray-50">
                    {[{ key: `p-${i}`, title: 'Parent order', body: pkg.parent, result: results[parentKey(pkg.parent.parent_order.id)] }, ...pkg.subOrders.map((o, j) => ({ key: `s-${i}-${j}`, title: `${o.order.id} · ${o.order.types.join('+').toUpperCase()}${o.order.delivery.destination.endpoint_id ? ` @ ${o.order.delivery.destination.endpoint_id}` : ''}`, body: o, result: results[orderKey(o.order.id)] }))].map(block => (
                      <div key={block.key} className="bg-[#001F4D] rounded-xl overflow-hidden border border-white/10">
                        <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
                          <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest flex items-center gap-2">{block.title} {statusBadge(block.result)}</span>
                          <button onClick={() => handleCopy(block.body, block.key)} className="text-[10px] font-bold text-white/40 hover:text-white">{copyStatus === block.key ? 'COPIED!' : 'COPY'}</button>
                        </div>
                        {block.result && !block.result.ok && <p className="px-4 pt-3 text-[11px] text-red-300 break-words">{block.result.message}{block.result.requestId ? ` · Request-Id ${block.result.requestId}` : ''}</p>}
                        <pre className="p-4 max-h-60 overflow-y-auto text-[11px] font-mono text-blue-100">{JSON.stringify(block.body, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3 flex-1">Saved order batches ({batches.length})</h3>
          <select value={batchProjectFilter} onChange={e => setBatchProjectFilter(e.target.value)} className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none">
            <option value="">All projects</option>
            {listProjects(batches).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {toMerge.length > 0 && (
          <div className="p-4 bg-blue-50/60 border-b border-blue-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#002D72]">{toMerge.length} batch(es) selected</span>
            <input value={mergeProject} onChange={e => setMergeProject(e.target.value)} list="order-batch-projects" placeholder="Project" className="w-40 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none" />
            <input value={mergeName} onChange={e => setMergeName(e.target.value)} placeholder="Name of the merged batch" className="flex-1 min-w-[180px] px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={deleteMerged} onChange={e => setDeleteMerged(e.target.checked)} /> Delete the originals</label>
            <button onClick={mergeBatches} disabled={toMerge.length < 2} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D] disabled:opacity-40">Merge into one batch</button>
            <button onClick={() => setToMerge([])} className="px-3 py-1.5 text-xs font-bold text-gray-500">Cancel</button>
          </div>
        )}
        {mergeNotice && <p className="m-4 text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{mergeNotice}</p>}
        {batches.filter(b => !batchProjectFilter || (b.project || '') === batchProjectFilter).length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No saved batch yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {batches.filter(b => !batchProjectFilter || (b.project || '') === batchProjectFilter).map(b => {
              const ids = b.packages.flatMap(p => p.subOrders.map(o => o.order.id));
              const ok = ids.filter(id => b.pushResults?.[orderKey(id)]?.ok).length;
              return (
                <li key={b.id} className={`p-4 flex flex-wrap items-center gap-3 ${batch?.id === b.id ? 'bg-blue-50/50' : ''}`}>
                  <input type="checkbox" checked={toMerge.includes(b.id)} onChange={() => toggleMerge(b)} title="Select to merge" className="w-4 h-4" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.project && <span className="text-[9px] font-bold uppercase bg-blue-50 text-onestock-blue px-1.5 py-0.5 rounded">{b.project}</span>}
                      <span className="font-bold text-sm text-gray-900">{b.name}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {b.packages.length} parent(s) · {ids.length} sub-order(s) · {ok} created · updated {new Date(b.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => openBatch(b)} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Open</button>
                  <button onClick={() => deleteBatch(b)} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StepOrderGeneration;
