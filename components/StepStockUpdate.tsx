
import React, { useState, useMemo } from 'react';
import { SITE_ID_VAR, TOKEN_VAR, useApiTarget, missingTargetFields, isProductionTarget } from '../services/onestockClient';
import { savedPayloadsStore, savePayload, listProjects, getLastProject, setLastProject, downloadJson, SOURCE_LABELS } from '../services/payloadStore';
import { pushStockImport, StockChunkResult, StockImportPayload, StockLine, STOCK_IMPORT_MAX_LINES } from '../services/stockService';
import { Drawer } from './ProductApiTools';
import { Product, AppSettings, SavedPayload } from '../types';
import StockPointsPicker from './StockPointsPicker';
import { mergeIds } from '../utils/endpointUtils';

interface StepStockUpdateProps {
  products: Product[];
  settings: AppSettings;
  // Stock points used as columns (kept in the settings, shared with the Order Generator).
  onEndpointsChange: (ids: string[]) => void;
  onCancel: () => void;
}

const StepStockUpdate: React.FC<StepStockUpdateProps> = ({ products, settings, onEndpointsChange, onCancel }) => {
  const endpoints = settings.stockEndpoints;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState('');
  const [endpointsSource, setEndpointsSource] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'payload'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [stockLevels, setStockLevels] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    products.forEach(p => {
      initial[p.sku] = {};
      endpoints.forEach(ep => {
        initial[p.sku][ep] = 0;
      });
    });
    return initial;
  });

  const savedPayloads = savedPayloadsStore.use();
  const projects = listProjects(savedPayloads);
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);
  const [incremental, setIncremental] = useState(false);
  const [importId, setImportId] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveProject, setSaveProject] = useState(getLastProject());
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushResults, setPushResults] = useState<StockChunkResult[] | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isStockPickerOpen, setIsStockPickerOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const lowSearch = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lowSearch) ||
      p.sku.toLowerCase().includes(lowSearch)
    );
  }, [products, searchTerm]);

  const handleStockChange = (sku: string, endpoint: string, val: string) => {
    const numVal = parseInt(val) || 0;
    setStockLevels(prev => ({
      ...prev,
      [sku]: {
        ...prev[sku],
        [endpoint]: numVal
      }
    }));
  };

  const applyToColumn = (endpoint: string) => {
    const valStr = prompt(`Enter stock quantity to apply to all visible rows for "${endpoint}":`, "0");
    if (valStr === null) return;
    const val = parseInt(valStr) || 0;

    setStockLevels(prev => {
      const updated = { ...prev };
      filteredProducts.forEach(p => {
        if (!updated[p.sku]) updated[p.sku] = {};
        updated[p.sku][endpoint] = val;
      });
      return updated;
    });
  };

  const fillRandom = () => {
    setStockLevels(prev => {
      const updated = { ...prev };
      products.forEach(p => {
        updated[p.sku] = { ...(updated[p.sku] || {}) };
        endpoints.forEach(ep => {
          const isZero = Math.random() < 0.5;
          updated[p.sku][ep] = isZero ? 0 : Math.floor(Math.random() * 25) + 1;
        });
      });
      return updated;
    });
  };

  const clearAll = () => {
    setStockLevels(prev => {
      const updated = { ...prev };
      products.forEach(p => {
        updated[p.sku] = { ...(updated[p.sku] || {}) };
        endpoints.forEach(ep => {
          updated[p.sku][ep] = 0;
        });
      });
      return updated;
    });
  };

  // One line per product and current stock point (stock points removed from the list are left out).
  const getStockDataArray = () => {
    const formattedStocks: { item_id: string; endpoint_id: string; quantity: number }[] = [];
    products.forEach(p => {
      endpoints.forEach(ep => {
        formattedStocks.push({ item_id: p.sku, endpoint_id: ep, quantity: stockLevels[p.sku]?.[ep] ?? 0 });
      });
    });
    return formattedStocks;
  };

  const handleLoadEndpoints = (ids: string[], label: string, mode: 'replace' | 'append') => {
    onEndpointsChange(mode === 'replace' ? ids : mergeIds(endpoints, ids));
    setEndpointsSource(mode === 'replace' || !endpointsSource ? label : `${endpointsSource} + ${label}`);
  };

  const addEndpoint = () => {
    const id = newEndpoint.trim();
    if (!id || endpoints.includes(id)) return;
    onEndpointsChange([...endpoints, id]);
    setNewEndpoint('');
  };

  const buildPayload = (): StockImportPayload => ({
    site_id: SITE_ID_VAR,
    token: TOKEN_VAR,
    import: { incremental, ...(importId.trim() ? { import_id: importId.trim() } : {}) },
    stocks: getStockDataArray(),
  });

  const generatePayload = () => {
    setPushResults(null);
    setPushError(null);
    setNotice(null);
    setViewMode('payload');
  };

  const payload = viewMode === 'payload' ? buildPayload() : null;
  const payloadContent = payload ? JSON.stringify(payload, null, 4) : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadContent);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSave = (withResult: boolean) => {
    if (!payload) return;
    if (!saveName.trim()) {
      setNotice('Give the payload a name before saving it.');
      return;
    }
    setLastProject(saveProject.trim());
    const single = pushResults?.length === 1 ? pushResults[0] : null;
    savePayload({
      name: saveName.trim(),
      project: saveProject.trim() || undefined,
      source: 'stock',
      method: 'PATCH',
      path: '/stock_import',
      url: withResult ? pushResults?.[0]?.url : undefined,
      connectionName: target.siteId || undefined,
      request: payload,
      response: withResult && pushResults
        ? (single ? single.response : pushResults.map(r => ({ chunk: r.index + 1, lines: r.lines, status: r.status, body: r.response })))
        : undefined,
      status: withResult && pushResults ? (pushResults.every(r => r.ok) ? pushResults[0].status ?? undefined : pushResults.find(r => !r.ok)?.status ?? undefined) : undefined,
      durationMs: withResult && pushResults ? pushResults.reduce((t, r) => t + (r.durationMs || 0), 0) : undefined,
    });
    setNotice(`Saved "${saveName.trim()}" in the payload library${saveProject.trim() ? ` (project ${saveProject.trim()})` : ''}.`);
  };

  const handleSend = async () => {
    if (!payload || targetMissing) return;
    if (isProductionTarget(target) && !window.confirm(`Send ${payload.stocks.length} stock line(s) to ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`)) return;
    setPushing('Sending…');
    setPushError(null);
    setNotice(null);
    setPushResults(null);
    try {
      const results = await pushStockImport(payload, (done, total) => setPushing(`Sending request ${done} / ${total}…`));
      setPushResults(results);
      const failed = results.filter(r => !r.ok);
      if (failed.length) setPushError(failed.map(r => `Request ${r.index + 1}: ${r.message}`).join('\n'));
    } catch (err: any) {
      setPushError(err?.message || String(err));
    } finally {
      setPushing(null);
    }
  };

  // Restores quantities (and stock points) from a saved /stock_import payload.
  const loadSavedStock = (saved: SavedPayload) => {
    const stocks: StockLine[] = Array.isArray((saved.request as any)?.stocks) ? (saved.request as any).stocks : [];
    const skus = new Set(products.map(p => p.sku));
    const matching = stocks.filter(l => skus.has(String(l.item_id)));
    onEndpointsChange(mergeIds(endpoints, matching.map(l => String(l.endpoint_id))));
    setStockLevels(prev => {
      const next = { ...prev };
      matching.forEach(l => {
        next[l.item_id] = { ...(next[l.item_id] || {}), [l.endpoint_id]: Number(l.quantity) || 0 };
      });
      return next;
    });
    if (typeof (saved.request as any)?.import?.incremental === 'boolean') setIncremental((saved.request as any).import.incremental);
    setSaveName(saved.name);
    setSaveProject(saved.project || '');
    setIsStockPickerOpen(false);
    setNotice(`Loaded "${saved.name}": ${matching.length} line(s) applied${stocks.length - matching.length ? `, ${stocks.length - matching.length} ignored (items not in the current selection)` : ''}.`);
  };

  const savedStockPayloads = savedPayloads.filter(p => p.path === '/stock_import' && Array.isArray((p.request as any)?.stocks));
  const savedStockGroups = (() => {
    const map = new Map<string, SavedPayload[]>();
    savedStockPayloads.forEach(p => map.set((p.project || '').trim(), [...(map.get((p.project || '').trim()) || []), p]));
    return [...map.entries()].sort(([x], [y]) => (x === '' ? 1 : y === '' ? -1 : x.localeCompare(y)));
  })();

  if (viewMode === 'payload' && payload) {
    const lines = payload.stocks.length;
    const requests = Math.max(1, Math.ceil(lines / STOCK_IMPORT_MAX_LINES));
    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <datalist id="stock-payload-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-[#002D72]">Stock Payload Generation</h2>
            <p className="text-sm text-gray-500">
              <strong>{lines}</strong> stock line(s) — {products.length} item(s) × <strong>{endpoints.length}</strong> stock point(s)
              {requests > 1 && <> · sent in <strong>{requests}</strong> requests of max {STOCK_IMPORT_MAX_LINES} lines sharing one import_id</>}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setViewMode('table')} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Back to Table
            </button>
            <button
              onClick={handleCopy}
              className={`px-4 py-2 text-sm font-bold border rounded-lg transition-all ${copySuccess ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-onestock-blue text-onestock-blue hover:bg-blue-50'}`}
            >
              {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button onClick={() => downloadJson(payload, `onestock_stock_payload_${Date.now()}`)} className="px-4 py-2 text-sm font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Download .json
            </button>
          </div>
        </div>

        <div className="bg-white px-6 py-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={incremental} onChange={e => setIncremental(e.target.checked)} />
              <span><strong>incremental</strong> — add to existing stock instead of replacing it</span>
            </label>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">import_id (optional)</label>
              <input value={importId} onChange={e => setImportId(e.target.value)} placeholder={requests > 1 ? 'generated automatically' : 'none'} className="w-56 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input value={saveProject} onChange={e => setSaveProject(e.target.value)} list="stock-payload-projects" placeholder="Project" className="w-40 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
            <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Payload name (required to save)" className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
            <button onClick={() => handleSave(false)} disabled={!saveName.trim()} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Save payload</button>
            <button
              onClick={handleSend}
              disabled={!!pushing || !!targetMissing || lines === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
            >
              {pushing || 'PATCH /stock_import'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            {targetMissing ? <span className="text-red-600">Missing in API Settings: {targetMissing}</span> : <>Target: <strong>{target.siteId}</strong> · {target.baseUrl}</>}
          </p>
          {notice && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{notice}</p>}
          {pushError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-line break-words">{pushError}</p>}
          {pushResults && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {pushResults.map(r => (
                  <span key={r.index} title={r.message} className={`text-xs font-bold px-2 py-1 rounded ${r.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {pushResults.length > 1 ? `#${r.index + 1} · ` : ''}{r.status ?? 'ERR'} · {r.lines} line(s){r.durationMs !== undefined ? ` · ${r.durationMs} ms` : ''}
                  </span>
                ))}
                <button onClick={() => handleSave(true)} disabled={!saveName.trim()} className="ml-auto px-3 py-1.5 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Save payload + result</button>
              </div>
              <pre className="max-h-[25vh] overflow-auto bg-gray-900 text-gray-100 font-mono text-[11px] p-4 rounded-lg whitespace-pre-wrap break-all">
                {JSON.stringify(pushResults.length === 1 ? pushResults[0].response ?? null : pushResults.map(r => ({ request: r.index + 1, status: r.status, body: r.response })), null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-[#001F4D] rounded-2xl shadow-2xl p-6 border border-white/10 relative overflow-hidden">
          <div className="absolute top-4 right-4 text-white/20 font-mono text-xs uppercase tracking-widest font-bold">STOCK PAYLOAD STRUCTURE</div>
          <div className="max-h-[50vh] overflow-y-auto pr-4">
            <pre className="text-blue-100 font-mono text-sm leading-relaxed whitespace-pre-wrap">{payloadContent}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between bg-white px-8 py-6 rounded-2xl border border-gray-200 shadow-sm gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#002D72]">Inventory Management</h2>
          <p className="text-sm text-gray-500 mt-1">Assign stock quantities per <strong>Endpoint ID</strong> across {products.length} items.</p>
          {products.length === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2 inline-flex items-center gap-2">
              No article selected: the stock lines come from the articles selected in the Product Manager.
              <button onClick={onCancel} className="font-bold underline">Open the Product Manager</button>
            </p>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px]">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text"
              placeholder="Search SKU or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-onestock-blue transition-all"
            />
          </div>

          <button onClick={() => setIsStockPickerOpen(true)} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">Load saved stock payload</button>

          <button onClick={fillRandom} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all">Randomize (50% zeroes)</button>
          
          <button 
            onClick={generatePayload}
            className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all"
          >
            Review JSON
          </button>
        </div>
      </div>

      {isStockPickerOpen && (
        <Drawer title="Load saved stock payload" onClose={() => setIsStockPickerOpen(false)} wide>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Saved <code>/stock_import</code> payloads, grouped by project. Quantities are applied to the items of the current selection
              and their stock points are added to the list.
            </p>
            {savedStockGroups.length === 0 ? (
              <p className="p-10 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">No saved stock payload yet.</p>
            ) : savedStockGroups.map(([group, entries]) => (
              <div key={group || '__none__'} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">{group || 'No project'}</span>
                  <span className="text-[11px] text-gray-400">{entries.length} payload(s)</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {entries.map(sp => (
                    <li key={sp.id} className="p-4 flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-sm text-gray-900">{sp.name}</span>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {(sp.request as any).stocks.length} line(s) · {SOURCE_LABELS[sp.source] || sp.source}
                          {sp.status !== undefined && ` · sent, HTTP ${sp.status}`} · {new Date(sp.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => loadSavedStock(sp)} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Load</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {notice && viewMode === 'table' && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{notice}</p>}

      {isPickerOpen && (
        <StockPointsPicker hasEndpoints={endpoints.length > 0} onLoad={handleLoadEndpoints} onClose={() => setIsPickerOpen(false)} />
      )}

      <div className="bg-white px-6 py-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xs font-bold text-[#002D72] uppercase tracking-widest">Stock points ({endpoints.length})</h3>
          {endpointsSource && <span className="text-[11px] text-gray-500">Loaded from <strong>{endpointsSource}</strong></span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              value={newEndpoint}
              onChange={e => setNewEndpoint(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEndpoint()}
              placeholder="Add an endpoint id…"
              className="w-48 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-onestock-blue"
            />
            <button onClick={addEndpoint} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Add</button>
            <button onClick={() => setIsPickerOpen(true)} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Load stock points</button>
            {endpoints.length > 0 && (
              <button onClick={() => { if (window.confirm('Remove all stock points from the list?')) { onEndpointsChange([]); setEndpointsSource(null); } }} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Clear</button>
            )}
          </div>
        </div>
        {endpoints.length === 0 ? (
          <p className="text-xs text-gray-400">No stock point: load a list from the saved payloads / Stock Points sets, or add ids manually.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {endpoints.map(ep => (
              <span key={ep} className="bg-blue-50 border border-blue-100 pl-2.5 pr-1.5 py-1 rounded-lg flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold text-onestock-blue">{ep}</span>
                <button onClick={() => onEndpointsChange(endpoints.filter(e => e !== ep))} className="text-blue-300 hover:text-red-500" title="Remove">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-64">Item Identifier (SKU)</th>
              {endpoints.map(ep => (
                <th key={ep} className="px-4 py-4 text-[10px] font-bold text-[#002D72] uppercase tracking-widest text-center border-l border-gray-100">
                  <div className="flex flex-col items-center gap-2">
                    <span>{ep}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredProducts.map(p => (
              <tr key={p.sku} className="hover:bg-blue-50/10 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded border border-gray-100 overflow-hidden shrink-0">
                      <img 
                        src={p.imageUrl} 
                        alt="" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/002D72/white?text=Err'; }}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 truncate max-w-[150px]" title={p.name}>{p.name}</div>
                      <code className="text-[10px] text-gray-400 font-bold">{p.sku}</code>
                    </div>
                  </div>
                </td>
                {endpoints.map(ep => (
                  <td key={ep} className="px-4 py-4 border-l border-gray-50">
                    <input 
                      type="number"
                      min="0"
                      value={stockLevels[p.sku]?.[ep] ?? 0}
                      onChange={(e) => handleStockChange(p.sku, ep, e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-transparent focus:border-onestock-blue focus:bg-white rounded-lg text-center font-mono font-bold text-onestock-blue outline-none transition-all"
                    />
                  </td>
                ))}
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={endpoints.length + 1} className="px-6 py-12 text-center text-gray-400 italic">
                  No products found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StepStockUpdate;
