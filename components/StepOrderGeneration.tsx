import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Product, AppSettings } from '../types';
import {
  generateOrderPackages, generateCustomers, priceMissingArticles, validateConfig, incrementId, hasPrice,
  OrderGenerationConfig, OrderPackage, OrderStrategy, ORDER_STRATEGIES,
} from '../services/orderService';
import { fetchSalesChannels } from '../services/salesChannelService';
import { getAiStatus, AiStatus } from '../services/aiService';
import { mergeIds } from '../utils/endpointUtils';
import StockPointsPicker from './StockPointsPicker';

interface StepOrderGenerationProps {
  products: Product[];
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onCancel: () => void;
}

const CONFIG_KEY = 'onestock_order_generation_config';
const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2';
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

type StoredConfig = Omit<OrderGenerationConfig, 'salesChannels' | 'deliveryPoints' | 'currency' | 'countryName'>;

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
    countryCode: settings.deliveryCountries[0]?.code || 'FR',
    salesChannel: '',
    parentOrderId: defaultParentId(),
    orderIdPrefix: '{TYPE}-',
    startIndex: 1,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
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

const StepOrderGeneration: React.FC<StepOrderGenerationProps> = ({ products, settings, onUpdateSettings }) => {
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
  const [packages, setPackages] = useState<OrderPackage[] | null>(null);
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

  const country = settings.deliveryCountries.find(c => c.code === config.countryCode);
  const channel = channels.find(c => c.id === config.salesChannel);
  const currency = channel?.currency || country?.currency || products.find(p => p.currency)?.currency || 'EUR';
  const missingPrices = useMemo(() => products.filter(p => !hasPrice(p)).length, [products]);
  const needsPoints = config.strategies.some(s => s !== 'sfs');

  const fullConfig: OrderGenerationConfig = {
    ...config,
    countryName: country?.name,
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
    set({ countryCode: code });
    setNewCountry({ code: '', name: '', currency: 'EUR' });
    setShowAddCountry(false);
  };

  const removeCountry = () => {
    if (!country || !window.confirm(`Remove ${country.name} (${country.code}) from the destination countries?`)) return;
    const rest = settings.deliveryCountries.filter(c => c.code !== country.code);
    onUpdateSettings({ deliveryCountries: rest });
    set({ countryCode: rest[0]?.code || 'FR' });
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
      let customers;
      try {
        customers = await generateCustomers(config.orderCount, config.countryCode, country?.name, useAi && aiCustomers,
          (d, t) => setProgress(`Generating customers ${d} / ${t}…`));
      } catch (err: any) {
        warnings.push(`AI customers failed (${err?.message || err}): sample identities used.`);
        customers = await generateCustomers(config.orderCount, config.countryCode, country?.name, false);
      }

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

      const result = generateOrderPackages(fullConfig, products, customers, prices);
      setPackages(result);
      setOpenPackage(0);
      const subCount = result.reduce((n, p) => n + p.subOrders.length, 0);
      // Next batch continues the numbering.
      set({ parentOrderId: incrementId(config.parentOrderId, config.orderCount), startIndex: config.startIndex + subCount });
      if (!useAi && (aiCustomers || (aiPrices && missingPrices > 0))) warnings.push('No OpenAI key (API Settings): sample identities / random prices used.');
      setWarning(warnings.length ? warnings.join(' ') : null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setProgress(null);
    }
  };

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
  const previewId = `${config.orderIdPrefix.replace(/\{TYPE\}/gi, (config.strategies[0] || 'sfs').toUpperCase())}${String(config.startIndex).padStart(3, '0')}`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      {isPickerOpen && (
        <StockPointsPicker
          hasEndpoints={deliveryPoints.length > 0}
          onLoad={(ids, _label, mode) => setPoints(mode === 'replace' ? ids : mergeIds(deliveryPoints, ids))}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-[#002D72]">Customer Order Generation</h2>
              <span className="text-[10px] font-bold text-onestock-blue bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-blue-100">{products.length} items selected</span>
              {missingPrices > 0 && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-amber-100">{missingPrices} without price</span>}
            </div>
            <p className="text-sm text-gray-500 mt-1">Parent orders with their sub-orders, customers generated with ChatGPT, payloads ready for OneStock.</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!!progress || products.length === 0}
            className="px-6 py-2.5 bg-[#002D72] text-white font-bold rounded-lg hover:bg-[#001F4D] shadow-lg text-sm disabled:opacity-50"
          >
            {progress || `Generate ${config.orderCount} order(s)`}
          </button>
        </div>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
        {warning && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{warning}</p>}

        {/* Strategies */}
        <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <label className={labelClass}>Order strategies to apply (one is drawn per sub-order)</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {ORDER_STRATEGIES.map(s => {
              const active = config.strategies.includes(s);
              return (
                <button key={s} onClick={() => toggleStrategy(s)} className={`px-4 py-3 rounded-lg border text-left transition-all ${active ? 'bg-[#002D72] border-[#002D72] text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-200'}`}>
                  <span className="text-xs font-bold uppercase tracking-wider">{active ? '☑' : '☐'} {s}</span>
                  <span className={`block text-[11px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{STRATEGY_LABELS[s]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Volumes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 p-5 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <label className={labelClass}>Orders to generate</label>
            <input type="number" min={1} max={200} value={config.orderCount} onChange={e => set({ orderCount: Math.max(1, Math.min(200, parseInt(e.target.value) || 1)) })} className={inputClass} />
          </div>
          <NumberRange label="Sub-orders per order (batch order count)" min={config.subOrdersMin} max={config.subOrdersMax} onChange={(a, b) => set({ subOrdersMin: a, subOrdersMax: b })} limit={20} />
          <NumberRange label="Items per sub-order" min={config.itemsMin} max={config.itemsMax} onChange={(a, b) => set({ itemsMin: a, itemsMax: b })} limit={50} />
          <NumberRange label="Quantity per item" min={config.qtyMin} max={config.qtyMax} onChange={(a, b) => set({ qtyMin: a, qtyMax: b })} />
        </div>

        {/* Market */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Destination country</label>
              <div className="flex gap-3">
                <button onClick={() => setShowAddCountry(v => !v)} className="text-[10px] font-bold text-onestock-blue hover:underline">{showAddCountry ? 'Cancel' : '+ Add country'}</button>
                {country && settings.deliveryCountries.length > 1 && <button onClick={removeCountry} className="text-[10px] font-bold text-red-500 hover:underline">Remove</button>}
              </div>
            </div>
            <select value={config.countryCode} onChange={e => set({ countryCode: e.target.value })} className={inputClass}>
              {settings.deliveryCountries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code}){c.currency ? ` · ${c.currency}` : ''}</option>)}
            </select>
            {showAddCountry && (
              <div className="flex gap-2 mt-2">
                <input value={newCountry.code} onChange={e => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase().slice(0, 2) })} placeholder="DE" className={inputClass + ' w-16'} />
                <input value={newCountry.name} onChange={e => setNewCountry({ ...newCountry, name: e.target.value })} placeholder="Germany" className={inputClass} />
                <input value={newCountry.currency} onChange={e => setNewCountry({ ...newCountry, currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" className={inputClass + ' w-20'} title="Currency" />
                <button onClick={addCountry} disabled={!/^[A-Za-z]{2}$/.test(newCountry.code) || !newCountry.name.trim()} className="px-3 py-2 bg-onestock-blue text-white font-bold text-xs rounded-lg disabled:opacity-40">Add</button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sales channel (GET /sales_channels)</label>
              <button onClick={loadChannels} disabled={loadingChannels} className="text-[10px] font-bold text-onestock-blue hover:underline disabled:opacity-50">{loadingChannels ? 'Loading…' : '↻ Reload from OneStock'}</button>
            </div>
            <select value={config.salesChannel} onChange={e => set({ salesChannel: e.target.value })} className={inputClass}>
              <option value="">{channels.length ? `Random among the ${channels.length} channel(s)` : '— no sales channel loaded —'}</option>
              {channels.map(c => <option key={c.id} value={c.id}>{c.name ? `${c.name} (${c.id})` : c.id}{c.currency ? ` · ${c.currency}` : ''}</option>)}
            </select>
            {channelsError && <p className="text-[11px] text-red-600 mt-1 break-words">{channelsError}</p>}
            <p className="text-[11px] text-gray-400 mt-1">Order currency: <strong>{config.salesChannel ? currency : 'currency of the drawn sales channel'}</strong>{!config.salesChannel && ` (default ${currency})`}</p>
          </div>
        </div>

        {/* Delivery points */}
        {needsPoints && (
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery points for CKC / ROPIS ({deliveryPoints.length}) — one is drawn per sub-order</label>
              <div className="ml-auto flex flex-wrap gap-2">
                <input value={newPoint} onChange={e => setNewPoint(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPoint()} placeholder="Endpoint id…" className="w-40 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none" />
                <button onClick={addPoint} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-white">Add</button>
                <button onClick={() => setPoints(mergeIds(deliveryPoints, settings.stockEndpoints))} disabled={settings.stockEndpoints.length === 0} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40" title="Stock points of the Stock Manager">+ Stock Manager points</button>
                <button onClick={() => setIsPickerOpen(true)} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Load stock points</button>
                {deliveryPoints.length > 0 && <button onClick={() => setPoints([])} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Clear</button>}
              </div>
            </div>
            {deliveryPoints.length === 0
              ? <p className="text-xs text-amber-700">Add at least one delivery point.</p>
              : (
                <div className="flex flex-wrap gap-1.5">
                  {deliveryPoints.map(ep => (
                    <span key={ep} className="bg-white border border-blue-100 pl-2.5 pr-1.5 py-1 rounded-lg flex items-center gap-1.5">
                      <span className="text-[11px] font-mono font-bold text-onestock-blue">{ep}</span>
                      <button onClick={() => setPoints(deliveryPoints.filter(p => p !== ep))} className="text-blue-300 hover:text-red-500">✕</button>
                    </span>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* Ids + AI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 p-5 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <label className={labelClass}>First parent order id (auto-incs)</label>
            <input value={config.parentOrderId} onChange={e => set({ parentOrderId: e.target.value })} className={inputClass + ' font-mono border-l-4 border-l-green-500'} />
          </div>
          <div>
            <label className={labelClass}>Sub-order id prefix ({'{TYPE}'} = strategy)</label>
            <input value={config.orderIdPrefix} onChange={e => set({ orderIdPrefix: e.target.value })} className={inputClass + ' font-mono'} />
          </div>
          <div>
            <label className={labelClass}>Sub-order counter (auto-incs)</label>
            <input type="number" min={0} value={config.startIndex} onChange={e => set({ startIndex: parseInt(e.target.value) || 0 })} className={inputClass + ' font-mono border-l-4 border-l-green-500'} />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>ChatGPT {aiAvailable ? '' : '(no key in API Settings)'}</label>
            <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={aiCustomers} disabled={!aiAvailable} onChange={e => setAiCustomers(e.target.checked)} /> Customers & addresses</label>
            <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={aiPrices} disabled={!aiAvailable} onChange={e => setAiPrices(e.target.checked)} /> Prices of articles without price</label>
          </div>
          <p className="col-span-full text-xs text-onestock-blue">
            Preview: parent <strong className="font-mono">{config.parentOrderId}</strong> · first sub-order <strong className="font-mono">{previewId}</strong>
          </p>
        </div>
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

          {packages.map((pkg, i) => {
            const isOpen = openPackage === i;
            return (
              <div key={pkg.parent.parent_order.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button onClick={() => setOpenPackage(isOpen ? null : i)} className="w-full px-5 py-3 flex flex-wrap items-center gap-3 text-left hover:bg-gray-50">
                  <span className="font-mono font-bold text-sm text-[#002D72]">{pkg.parent.parent_order.id}</span>
                  <span className="text-xs text-gray-600">{pkg.customer.first_name} {pkg.customer.last_name} · {pkg.customer.address.zip_code} {pkg.customer.address.city}</span>
                  <span className="text-xs text-gray-400">{pkg.subOrders.map(o => o.order.id).join(', ')}</span>
                  <span className="ml-auto text-xs font-bold text-gray-700">{pkg.parent.parent_order.pricing_details.price} {pkg.parent.parent_order.pricing_details.currency}</span>
                </button>
                {isOpen && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 bg-gray-50">
                    {[{ key: `p-${i}`, title: 'Parent order', body: pkg.parent }, ...pkg.subOrders.map((o, j) => ({ key: `s-${i}-${j}`, title: `${o.order.id} · ${o.order.types.join('+').toUpperCase()}${o.order.delivery.destination.endpoint_id ? ` @ ${o.order.delivery.destination.endpoint_id}` : ''}`, body: o }))].map(block => (
                      <div key={block.key} className="bg-[#001F4D] rounded-xl overflow-hidden border border-white/10">
                        <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
                          <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">{block.title}</span>
                          <button onClick={() => handleCopy(block.body, block.key)} className="text-[10px] font-bold text-white/40 hover:text-white">{copyStatus === block.key ? 'COPIED!' : 'COPY'}</button>
                        </div>
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
    </div>
  );
};

export default StepOrderGeneration;
