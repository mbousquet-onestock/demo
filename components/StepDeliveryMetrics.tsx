import React, { useEffect, useMemo, useState } from 'react';
import { deliveryConfigStore, loadDeliveryConfig, carrierLabel } from '../services/deliveryRouteService';
import { Metric, METRIC_OPERATORS, METRIC_UNITS, fetchMetrics, saveMetric, deleteMetric, metricUsages, metricKey, metricUnit, readMetric, lastListAnswers } from '../services/metricService';
import { useApiTarget, missingTargetFields } from '../services/onestockClient';
import SortOrdersPanel from './SortOrdersPanel';

const EMPTY = { id: '', operator: 'sum', unit: '' };
type Draft = { operator: string; unit: string };
const SUGGESTIONS = ['cost_by_parcel', 'carbon_footprint'];

// Delivery Routes → Metrics: metrics of the site (GET /metrics), their use in the routes (metric_values), creation.
const StepDeliveryMetrics: React.FC = () => {
  const config = deliveryConfigStore.use();
  const target = useApiTarget();
  const missing = missingTargetFields(target);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  // Changes typed in the table (unit, operator), saved per row with PATCH /metrics/{id}.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Selection for the bulk deletion, raw GET /metrics/{id} answers.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reads, setReads] = useState<Record<string, unknown>>({});
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  // Result of the last call, shown under the table (updates, deletions) or the form (creation).
  const [result, setResult] = useState<{ ok: boolean; message: string; at: 'table' | 'form' } | null>(null);

  const load = async () => {
    setError(null);
    try {
      setLoading('Reading GET /metrics…');
      setMetrics(await fetchMetrics(versionNumber));
      if (!config || config.site !== target.siteId) await loadDeliveryConfig(setLoading);
    } catch (err: any) { setError(err?.message || String(err)); } finally { setLoading(null); }
  };

  // Read at opening when the API target is set.
  useEffect(() => { if (!missing) load(); }, [target.siteId, target.baseUrl]);

  const usages = useMemo(() => metricUsages(config?.routes || []), [config]);
  // Keys used by the routes but not defined in /metrics.
  const unknownKeys = metrics ? [...usages.keys()].filter(k => !metrics.some(m => m.id === k || m.name === k)) : [];
  const routesWithout = (config?.routes || []).filter(r => !Object.keys(r.metric_values || {}).length);

  const exists = !!metrics?.some(m => m.id === form.id.trim());
  const formError = !form.id.trim() ? 'Name required' : /\s/.test(form.id.trim()) ? 'No space in the name' : exists ? 'This metric already exists: change it in the table' : '';
  const versionNumber = Number(version) || undefined;

  const run = async (action: () => Promise<unknown>, done: string, at: 'table' | 'form' = 'table', units?: { id: string; unit: string }[]) => {
    setBusy(true);
    setResult(null);
    try {
      await action();
      const next = await fetchMetrics(versionNumber);
      setMetrics(next);
      // unit is not a documented field: check that the API kept it.
      const lost = (units || []).filter(x => String(next.find(m => m.id === x.id)?.unit ?? '') !== x.unit);
      setResult(lost.length
        ? { ok: false, message: `${done}, but the API did not keep the unit of ${lost.map(x => `${x.id} (${x.unit})`).join(', ')}: unit is not stored for the metrics of this site`, at }
        : { ok: true, message: done, at });
      return true;
    } catch (err: any) { setResult({ ok: false, message: err?.message || String(err), at }); return false; } finally { setBusy(false); }
  };
  const create = async () => {
    const id = form.id.trim();
    const unit = form.unit.trim();
    if (await run(() => saveMetric({ ...form, id }, false, versionNumber), `Created: ${id}`, 'form', unit ? [{ id, unit }] : undefined)) setForm(EMPTY);
  };
  const stored = (m: Metric): Draft => ({ operator: String(m.operator || ''), unit: String(m.unit ?? '') });
  const draftOf = (m: Metric) => drafts[m.id] || stored(m);
  const changed = (m: Metric) => !!drafts[m.id] && JSON.stringify(drafts[m.id]) !== JSON.stringify(stored(m));
  const setDraft = (m: Metric, d: Partial<Draft>) => setDrafts({ ...drafts, [m.id]: { ...draftOf(m), ...d } });
  const update = async (list: Metric[]) => {
    const ok = await run(async () => {
      for (const m of list) await saveMetric({ id: m.id, ...draftOf(m), operator: draftOf(m).operator || 'sum' }, true, versionNumber);
    }, `Updated: ${list.map(m => m.id).join(', ')}`, 'table', list.filter(m => draftOf(m).unit.trim()).map(m => ({ id: m.id, unit: draftOf(m).unit.trim() })));
    const keep = <T,>(d: Record<string, T>) => Object.fromEntries(Object.entries(d).filter(([id]) => !list.some(m => m.id === id)));
    // Raw reads are outdated after a change.
    if (ok) { setDrafts(keep); setReads(keep); }
  };
  const changedMetrics = (metrics || []).filter(changed);
  // Deletion one by one (409 while a metric is still referenced), with the outcome of each id.
  const removeMany = async (ids: string[]) => {
    const used = ids.filter(id => { const m = metrics?.find(x => x.id === id); return m && usages.get(metricKey(m, usages))?.routes.length; });
    if (!window.confirm(`Delete ${ids.length} metric(s): ${ids.join(', ')}?${used.length ? `\nStill used by routes: ${used.join(', ')} (the API refuses with 409 while a metric is referenced).` : ''}`)) return;
    setBusy(true);
    setResult(null);
    const failed: string[] = [];
    for (const id of ids) {
      try { await deleteMetric(id, versionNumber); } catch (err: any) { failed.push(`${id}: ${err?.message || err}`); }
    }
    try { setMetrics(await fetchMetrics(versionNumber)); } catch { /* list kept */ }
    setSelected(new Set());
    setResult({ ok: failed.length === 0, message: `${ids.length - failed.length} deleted${failed.length ? ` · ${failed.length} failed — ${failed.join(' · ')}` : ''}`, at: 'table' });
    setBusy(false);
  };
  const read = async (id: string) => {
    setOpen(id);
    setReads(r => ({ ...r, [id]: 'loading' }));
    try { const body = await readMetric(id, versionNumber); setReads(r => ({ ...r, [id]: body })); }
    catch (err: any) { setReads(r => ({ ...r, [id]: { error: err?.message || String(err) } })); }
  };
  const toggle = (id: string) => setSelected(sel => { const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <datalist id="metric-units">{METRIC_UNITS.map(u => <option key={u} value={u} />)}</datalist>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-2xl font-bold text-[#002D72]">Delivery metrics</h2>
          <p className="text-sm text-gray-500 mt-1">
            Metrics of the site (<span className="font-mono">GET /metrics</span>), their values on the delivery routes (<span className="font-mono">metric_values</span>) and the sort orders using them.
          </p>
        </div>
        <button onClick={load} disabled={!!loading || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
          {loading || (metrics ? 'Reload' : 'Load the metrics')}
        </button>
      </div>
      {missing && <p className="text-sm text-amber-700">Missing in API Settings: {missing}</p>}
      {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
      {(error || metrics?.length === 0) && lastListAnswers['/metrics'] && (
        <details open className="text-xs text-gray-600">
          <summary className="cursor-pointer font-bold">Raw answers of GET /metrics ({lastListAnswers['/metrics'].length} attempt(s))</summary>
          <pre className="mt-2 max-h-80 overflow-auto bg-gray-900 text-gray-100 p-3 rounded text-[11px]">{JSON.stringify(lastListAnswers['/metrics'], null, 2)}</pre>
        </details>
      )}

      {metrics && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
              <tr><th className="pl-4 py-2 w-6"><input type="checkbox" checked={metrics.length > 0 && selected.size === metrics.length} onChange={e => setSelected(e.target.checked ? new Set(metrics.map(m => m.id)) : new Set())} /></th><th className="px-4 py-2 text-left">Metric (name)</th><th className="px-4 py-2 text-left">Version</th><th className="px-4 py-2 text-left">Unit</th><th className="px-4 py-2 text-left">Operator</th><th className="px-4 py-2 text-left">Routes</th><th className="px-4 py-2 text-left">Values</th><th /></tr>
            </thead>
            <tbody>
              {metrics.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No metric on this site.</td></tr>}
              {metrics.map(m => {
                const key = metricKey(m, usages);
                const u = usages.get(key);
                return (
                  <React.Fragment key={m.id}>
                    <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <td className="pl-4 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /></td>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-800">{m.id}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{m.version !== undefined ? String(m.version) : '—'}</td>
                      <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                        <input value={draftOf(m).unit} onChange={e => setDraft(m, { unit: e.target.value })} list="metric-units" placeholder="EUR" className={`w-24 px-2 py-1 text-sm border rounded-lg ${changed(m) ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`} />
                      </td>
                      <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                        <select value={draftOf(m).operator} onChange={e => setDraft(m, { operator: e.target.value })} className={`px-2 py-1 text-sm font-mono border rounded-lg bg-white ${changed(m) ? 'border-amber-400' : 'border-gray-200'}`}>
                          {!draftOf(m).operator && <option value="">— none —</option>}
                          {METRIC_OPERATORS.map(o => <option key={o.id} value={o.id}>{o.id}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{u ? `${u.routes.length} route(s)` : <span className="text-gray-300">not used</span>}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {u && (u.min !== undefined ? `${u.min === u.max ? u.min : `${u.min} – ${u.max}`}${metricUnit(m) ? ` ${metricUnit(m)}` : ''}` : '—')}
                        {u && u.nulls > 0 && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{u.nulls} null</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {changed(m) && <>
                          <button onClick={e => { e.stopPropagation(); update([m]); }} disabled={busy} className="text-xs font-bold text-emerald-700 hover:underline mr-3 disabled:opacity-40">Save</button>
                          <button onClick={e => { e.stopPropagation(); setDrafts(d => { const { [m.id]: _, ...rest } = d; return rest; }); }} className="text-xs font-bold text-gray-500 hover:underline mr-3">Undo</button>
                        </>}
                        <button onClick={e => { e.stopPropagation(); read(m.id); }} className="text-xs font-bold text-[#002D72] hover:underline mr-3">Read</button>
                        <button onClick={e => { e.stopPropagation(); removeMany([m.id]); }} disabled={busy} className="text-xs font-bold text-red-600 hover:underline mr-3 disabled:opacity-40">Delete</button>
                        <span className="text-gray-300">{open === m.id ? '▾' : '▸'}</span>
                      </td>
                    </tr>
                    {open === m.id && (
                      <tr className="bg-gray-50"><td colSpan={8} className="px-4 py-3 space-y-2">
                        {reads[m.id] !== undefined && <p className="text-[10px] font-bold text-gray-500">GET /metrics/{m.id}{reads[m.id] === 'loading' ? ' …' : ''}</p>}
                        <pre className="max-h-64 overflow-auto bg-gray-900 text-gray-100 p-3 rounded text-[11px]">{JSON.stringify(reads[m.id] !== undefined && reads[m.id] !== 'loading' ? reads[m.id] : m, null, 2)}</pre>
                        {u && <div className="text-xs text-gray-600 space-y-0.5">{u.routes.map(r => (
                          <p key={r.id}><span className="font-mono">{r.id}</span> · {r.origin_zone_id} → {r.destination_zone_id} · {carrierLabel(r)} · <strong>{r.metric_values?.[key] ?? 'null'}</strong></p>
                        ))}</div>}
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {selected.size > 0 && (
            <div className="px-4 py-3 border-t border-red-200 bg-red-50 flex flex-wrap items-center gap-3 text-sm text-red-800">
              {selected.size} metric(s) selected
              <button onClick={() => removeMany([...selected])} disabled={busy || !!missing} className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
                {busy ? 'Deleting…' : `Delete selected (DELETE /metrics/{id})`}
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs font-bold hover:underline">Clear</button>
            </div>
          )}
          {changedMetrics.length > 0 && (
            <div className="px-4 py-3 border-t border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3 text-sm text-amber-800">
              {changedMetrics.length} metric(s) changed
              <button onClick={() => update(changedMetrics)} disabled={busy || !!missing} className="px-3 py-1.5 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
                {busy ? 'Sending…' : `Save all (PATCH /metrics/{id})`}
              </button>
              <button onClick={() => setDrafts({})} className="text-xs font-bold hover:underline">Undo all</button>
            </div>
          )}
          {result?.at === 'table' && <p className={`px-4 py-2 border-t border-gray-100 text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'} break-words`}>{result.message}</p>}
        </div>
      )}

      {metrics && (unknownKeys.length > 0 || routesWithout.length > 0) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-1">
          {unknownKeys.map(k => (
            <p key={k}>Key <span className="font-mono">{k}</span> used by {usages.get(k)!.routes.length} route(s) but not defined in /metrics (no operator to combine it).{' '}
              <button onClick={() => setForm({ id: k, operator: 'sum', unit: '' })} className="font-bold underline">Create it</button></p>
          ))}
          {routesWithout.length > 0 && <p>{routesWithout.length} route(s) without metric_values: {routesWithout.slice(0, 10).map(r => r.id).join(', ')}{routesWithout.length > 10 ? '…' : ''}</p>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <p className="font-bold text-gray-800">Create a metric</p>
          <p className="text-xs text-gray-500">
            <span className="font-mono">POST /metrics</span> · the routes give a value per metric (<span className="font-mono">metric_values</span>),
            the operator says how the delivery promise combines the values of its routes. The unit is not a documented field: it is sent when filled and checked after saving.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs text-gray-500">Name (key of metric_values)
            <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} list="metric-suggestions" placeholder="cost_by_parcel" className="mt-1 w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg disabled:bg-gray-50" />
            <datalist id="metric-suggestions">{[...new Set([...SUGGESTIONS, ...unknownKeys])].map(k => <option key={k} value={k} />)}</datalist>
          </label>
          <label className="text-xs text-gray-500">Unit <span className="text-gray-400">(optional)</span>
            <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} list="metric-units" placeholder="EUR" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </label>
          <label className="text-xs text-gray-500">Operator
            <select value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              {METRIC_OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Delivery Promise version
            <input value={version} onChange={e => setVersion(e.target.value.replace(/\D/g, ''))} placeholder="current" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </label>
        </div>
        {formError && form.id && <p className="text-xs text-red-600">{formError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={create} disabled={!!formError || busy || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
            {busy ? 'Sending…' : 'Create'}
          </button>
          {result?.at === 'form' && <span className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'} break-words`}>{result.message}</span>}
        </div>
      </div>

      {metrics && <SortOrdersPanel metrics={metrics} version={versionNumber} disabled={!!missing} />}
    </div>
  );
};

export default StepDeliveryMetrics;
