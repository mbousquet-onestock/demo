import React, { useEffect, useMemo, useState } from 'react';
import { StockPointDraft, StockPointPushResult, StockPointSet } from '../types';
import { settingsStore, stockPointSetsStore } from '../services/appStores';
import { savedPayloadsStore, listProjects, getLastProject, setLastProject, downloadJson } from '../services/payloadStore';
import { useApiTarget, missingTargetFields, isProductionTarget, SITE_ID_VAR, TOKEN_VAR } from '../services/onestockClient';
import { generateStockPoints, createStockPoints, getAiStatus, AiStatus, MAX_STOCK_POINTS, withOpeningHours247 } from '../services/stockPointService';
import StockPointsMap from './StockPointsMap';

const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';
const inputClass = 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue';
const smallBtn = 'px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50';

const newId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

const EXAMPLE_CONTEXT = 'Enseigne de prêt-à-porter française : magasins dans les grandes villes de France (centre-ville et centres commerciaux), 2 entrepôts logistiques (Lyon et Lille), quelques dark stores à Paris.';

const StepStockPoints: React.FC = () => {
  const settings = settingsStore.use();
  const sets = stockPointSetsStore.use();
  const savedPayloads = savedPayloadsStore.use();
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [current, setCurrent] = useState<StockPointSet | null>(null);
  const [dirty, setDirty] = useState(false);

  const [project, setProject] = useState(getLastProject());
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [count, setCount] = useState(10);
  const [idPrefix, setIdPrefix] = useState('');

  const [generating, setGenerating] = useState<string | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushMode, setPushMode] = useState<'one' | 'bulk'>('one');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonEdit, setJsonEdit] = useState<{ id: string; text: string; error?: string } | null>(null);
  const [projectFilter, setProjectFilter] = useState('');

  useEffect(() => { getAiStatus().then(setAiStatus); }, []);

  const projects = useMemo(() => listProjects([...savedPayloads, ...sets]), [savedPayloads, sets]);
  const model = settings.openaiModel || aiStatus?.defaultModel || 'gpt-4.1-mini';
  const needsKey = aiStatus ? !aiStatus.serverKey : true;

  const updateCurrent = (patch: Partial<StockPointSet>) => {
    setCurrent(prev => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };
  const updateEndpoint = (id: string, patch: Partial<StockPointDraft>) => {
    if (!current) return;
    updateCurrent({ endpoints: current.endpoints.map(e => (e.id === id ? { ...e, ...patch } : e)) });
  };

  const handleGenerate = async () => {
    if (!context.trim()) { setError('Describe the context first.'); return; }
    if (needsKey && !settings.openaiApiKey?.trim()) { setError('Set an OpenAI API key in API Settings (or OPENAI_API_KEY on the server).'); return; }
    setError(null);
    setNotice(null);
    setGenerating(`Generating 0 / ${count}…`);
    try {
      const endpoints = await generateStockPoints({
        context, count, idPrefix,
        onProgress: (done, total) => setGenerating(`Generating ${done} / ${total}…`),
      });
      const now = new Date().toISOString();
      setCurrent({
        id: newId(),
        name: name.trim() || `Stock points ${new Date().toLocaleString()}`,
        project: project.trim() || undefined,
        context, count, idPrefix: idPrefix.trim() || undefined, model,
        createdAt: now, updatedAt: now,
        endpoints,
      });
      setDirty(true);
      setSelectedId(null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setGenerating(null);
    }
  };

  const saveCurrent = (set: StockPointSet | null = current) => {
    if (!set) return;
    const toSave = { ...set, updatedAt: new Date().toISOString() };
    stockPointSetsStore.set(prev => [toSave, ...prev.filter(s => s.id !== toSave.id)]);
    if (toSave.project) setLastProject(toSave.project);
    setCurrent(toSave);
    setDirty(false);
    return toSave;
  };

  const openSet = (set: StockPointSet) => {
    if (dirty && !window.confirm('Discard the unsaved changes of the current set?')) return;
    setCurrent(set);
    setDirty(false);
    setSelectedId(null);
    setJsonEdit(null);
    setProject(set.project || '');
    setName(set.name);
    setContext(set.context);
    setCount(set.count);
    setIdPrefix(set.idPrefix || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteSet = (set: StockPointSet) => {
    if (!window.confirm(`Delete "${set.name}"? (Stock points already created in OneStock are not deleted.)`)) return;
    stockPointSetsStore.set(prev => prev.filter(s => s.id !== set.id));
    if (current?.id === set.id) { setCurrent(null); setDirty(false); }
  };

  const push = async (onlyFailed: boolean) => {
    if (!current || targetMissing) return;
    const list = onlyFailed
      ? current.endpoints.filter(e => !current.pushResults?.[e.id]?.ok)
      : current.endpoints;
    if (list.length === 0) return;
    if (isProductionTarget(target) && !window.confirm(`Create ${list.length} stock point(s) on ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`)) return;
    setError(null);
    setNotice(null);
    setPushing(`Creating 0 / ${list.length}…`);
    let base = current;
    try {
      const results = await createStockPoints(list, pushMode, (partial, done) => {
        setPushing(`Creating ${done} / ${list.length}…`);
        setCurrent(prev => (prev ? { ...prev, pushResults: { ...(base.pushResults || {}), ...partial } } : prev));
      });
      base = { ...base, pushResults: { ...(base.pushResults || {}), ...results } };
      // Results are kept with the set.
      saveCurrent(base);
      const failed = Object.values(results).filter(r => !r.ok).length;
      setNotice(failed ? `${list.length - failed} created, ${failed} failed — see the status column and API Logs.` : `${list.length} stock point(s) created in OneStock.`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setPushing(null);
    }
  };

  const applyJsonEdit = () => {
    if (!jsonEdit || !current) return;
    try {
      const parsed = JSON.parse(jsonEdit.text);
      if (!parsed.id || !parsed.name) throw new Error('"id" and "name" are required.');
      updateCurrent({ endpoints: current.endpoints.map(e => (e.id === jsonEdit.id ? parsed : e)) });
      setJsonEdit(null);
    } catch (e: any) {
      setJsonEdit({ ...jsonEdit, error: e.message });
    }
  };

  const payloadForDownload = current && { site_id: SITE_ID_VAR, token: TOKEN_VAR, endpoints: current.endpoints.map(withOpeningHours247) };
  const results: Record<string, StockPointPushResult> = current?.pushResults || {};
  const createdCount = current ? current.endpoints.filter(e => results[e.id]?.ok).length : 0;
  const failedCount = current ? current.endpoints.filter(e => results[e.id] && !results[e.id].ok).length : 0;

  const visibleSets = sets.filter(s => !projectFilter || (s.project || '') === projectFilter);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <datalist id="stock-point-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>

      {/* Generator */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Points generator</h2>
          <p className="text-gray-500 text-sm mt-1">
            Describe the network; the AI (OpenAI) generates OneStock stock locations you can review, save under a project
            and create with <code className="text-xs bg-gray-100 px-1 rounded">POST /endpoints</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Project</label>
            <input value={project} onChange={e => setProject(e.target.value)} list="stock-point-projects" placeholder="e.g. Demo Fashion" className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Set name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. French store network" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Number of stock points</label>
            <input type="number" min={1} max={MAX_STOCK_POINTS} value={count} onChange={e => setCount(Math.max(1, Math.min(MAX_STOCK_POINTS, parseInt(e.target.value) || 1)))} className={inputClass} />
          </div>
          <div className="md:col-span-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Context</label>
              {!context && <button onClick={() => setContext(EXAMPLE_CONTEXT)} className="text-[10px] font-bold text-onestock-blue hover:underline">Use an example</button>}
            </div>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              rows={4}
              placeholder="Brand, countries / cities, store types (stores, warehouses, dark stores, lockers…), proportions, services (click & collect, ship from store…)"
              className={inputClass + ' resize-y'}
            />
          </div>
          <div>
            <label className={labelClass}>Id prefix (optional)</label>
            <input value={idPrefix} onChange={e => setIdPrefix(e.target.value.replace(/\s+/g, ''))} placeholder="e.g. demo_" className={inputClass} />
          </div>
          <div className="md:col-span-3 flex items-end">
            <p className="text-[11px] text-gray-500">
              OpenAI: model <strong>{model}</strong> · key {settings.openaiApiKey?.trim() ? 'from API Settings' : aiStatus?.serverKey ? 'of the server (OPENAI_API_KEY)' : <span className="text-red-600 font-bold">missing — set it in API Settings</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={handleGenerate} disabled={!!generating} className="px-6 py-2.5 bg-onestock-blue text-white font-bold text-sm rounded-lg hover:bg-[#001F4D] disabled:opacity-50">
            {generating || `Generate ${count} stock point(s)`}
          </button>
          {error && <span className="text-sm text-red-600 break-words">{error}</span>}
        </div>
      </div>

      {/* Current set */}
      {current && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Project</label>
                <input value={current.project || ''} onChange={e => updateCurrent({ project: e.target.value || undefined })} list="stock-point-projects" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Set name</label>
                <input value={current.name} onChange={e => updateCurrent({ name: e.target.value })} className={inputClass} />
              </div>
              <p className="md:col-span-3 text-[11px] text-gray-400">
                {current.endpoints.length} stock point(s) · {createdCount} created · {failedCount} failed · model {current.model || '—'}
                {dirty && <span className="text-amber-600 font-bold"> · unsaved changes</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button onClick={() => { saveCurrent(); setNotice('Set saved.'); }} disabled={!current.name.trim()} className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Save set</button>
              <button onClick={() => payloadForDownload && downloadJson(payloadForDownload, `onestock_endpoints_${current.name.replace(/[^a-z0-9]+/gi, '_')}`)} className="px-4 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Download payload</button>
              <button onClick={() => { if (!dirty || window.confirm('Close without saving?')) { setCurrent(null); setDirty(false); } }} className="px-4 py-2 text-xs font-bold text-gray-500">Close</button>
            </div>
          </div>

          <StockPointsMap endpoints={current.endpoints} results={results} selectedId={selectedId} onSelect={setSelectedId} />

          <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-xs font-bold text-gray-600">Create in OneStock</span>
            <select value={pushMode} onChange={e => setPushMode(e.target.value as 'one' | 'bulk')} className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg outline-none">
              <option value="one">One call per stock point (status per row)</option>
              <option value="bulk">Bulk (50 per call)</option>
            </select>
            <button onClick={() => push(false)} disabled={!!pushing || !!targetMissing} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
              {pushing || `POST /endpoints (${current.endpoints.length})`}
            </button>
            {failedCount > 0 && !pushing && (
              <button onClick={() => push(true)} disabled={!!targetMissing} className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Retry failed / not created ({current.endpoints.length - createdCount})</button>
            )}
            <span className="text-[11px] text-gray-500">
              {targetMissing ? <span className="text-red-600">Missing in API Settings: {targetMissing}</span> : <>Target: <strong>{target.siteId}</strong> · {target.baseUrl}</>}
            </span>
          </div>
          {notice && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{notice}</p>}

          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-left text-xs min-w-[1000px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-3 py-2 w-24">Status</th>
                  <th className="px-3 py-2">Id</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Modules</th>
                  <th className="px-3 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {current.endpoints.map(ep => {
                  const result = results[ep.id];
                  const isSelected = ep.id === selectedId;
                  const lat = ep.address?.coordinates?.lat;
                  const lon = ep.address?.coordinates?.lon;
                  return (
                    <React.Fragment key={ep.id}>
                      <tr className={`${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} cursor-pointer`} onClick={() => setSelectedId(ep.id)}>
                        <td className="px-3 py-2">
                          {result
                            ? <span title={result.message} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${result.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{result.ok ? 'Created' : `Error ${result.status ?? ''}`}</span>
                            : <span className="text-[10px] text-gray-400">Draft</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={ep.id}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              const id = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                              if (!id || current.endpoints.some(o => o !== ep && o.id === id)) return;
                              updateEndpoint(ep.id, { id });
                              if (isSelected) setSelectedId(id);
                            }}
                            className="w-40 font-mono bg-transparent border border-transparent hover:border-gray-200 focus:border-onestock-blue rounded px-1 py-0.5 outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={ep.name}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateEndpoint(ep.id, { name: e.target.value })}
                            className="w-48 font-bold text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-onestock-blue rounded px-1 py-0.5 outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-600">{(ep.classification?.endpoint_type || []).join(', ') || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          <div>{(ep.address?.lines || []).join(', ')}</div>
                          <div className="text-gray-400">
                            {[ep.address?.zip_code, ep.address?.city, ep.address?.regions?.country?.code].filter(Boolean).join(' ')}
                            {lat !== undefined && lon !== undefined && (
                              <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="ml-2 text-onestock-blue hover:underline">map</a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(['ffs', 'ckc', 'cfs', 'ropis'] as const).map(m => (
                              <button
                                key={m}
                                onClick={e => { e.stopPropagation(); updateEndpoint(ep.id, { modules: { ...(ep.modules || {}), [m]: !ep.modules?.[m] } }); }}
                                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${ep.modules?.[m] ? 'bg-onestock-blue text-white' : 'bg-gray-100 text-gray-400'}`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={e => { e.stopPropagation(); setJsonEdit(jsonEdit?.id === ep.id ? null : { id: ep.id, text: JSON.stringify(ep, null, 2) }); }} className={smallBtn}>JSON</button>
                            <button onClick={e => { e.stopPropagation(); updateCurrent({ endpoints: current.endpoints.filter(o => o.id !== ep.id) }); }} className="px-2 py-1 text-[11px] font-bold text-red-600 border border-red-200 rounded hover:bg-red-50">✕</button>
                          </div>
                        </td>
                      </tr>
                      {result && !result.ok && (
                        <tr><td colSpan={7} className="px-3 pb-2 text-[11px] text-red-600 break-words">{result.message}{result.requestId ? ` · Request-Id ${result.requestId}` : ''}</td></tr>
                      )}
                      {jsonEdit?.id === ep.id && (
                        <tr>
                          <td colSpan={7} className="px-3 pb-3">
                            <textarea value={jsonEdit.text} onChange={e => setJsonEdit({ ...jsonEdit, text: e.target.value, error: undefined })} rows={14} spellCheck={false} className="w-full font-mono text-[11px] p-3 bg-[#001F4D] text-blue-100 rounded-lg outline-none" />
                            <div className="flex items-center gap-2 mt-1">
                              <button onClick={applyJsonEdit} className="px-3 py-1 text-[11px] font-bold text-white bg-onestock-blue rounded">Apply</button>
                              <button onClick={() => setJsonEdit(null)} className="px-3 py-1 text-[11px] font-bold text-gray-500">Cancel</button>
                              {jsonEdit.error && <span className="text-[11px] text-red-600">{jsonEdit.error}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved sets */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3 flex-1">Saved stock point sets ({sets.length})</h3>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none">
            <option value="">All projects</option>
            {listProjects(sets).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {visibleSets.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">No saved set yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visibleSets.map(s => {
              const created = s.endpoints.filter(e => s.pushResults?.[e.id]?.ok).length;
              return (
                <li key={s.id} className={`p-4 flex flex-wrap items-center gap-3 ${current?.id === s.id ? 'bg-blue-50/50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.project && <span className="text-[9px] font-bold uppercase bg-blue-50 text-onestock-blue px-1.5 py-0.5 rounded">{s.project}</span>}
                      <span className="font-bold text-sm text-gray-900">{s.name}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {s.endpoints.length} stock point(s) · {created} created · updated {new Date(s.updatedAt).toLocaleString()} · {s.context}
                    </p>
                  </div>
                  <button onClick={() => openSet(s)} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Open</button>
                  <button onClick={() => deleteSet(s)} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StepStockPoints;
