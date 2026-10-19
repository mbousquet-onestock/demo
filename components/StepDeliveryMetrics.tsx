import React, { useMemo, useState } from 'react';
import { deliveryConfigStore, loadDeliveryConfig, carrierLabel } from '../services/deliveryRouteService';
import { Metric, METRIC_OPERATORS, fetchMetrics, saveMetric, deleteMetric, metricUsages, metricKey } from '../services/metricService';
import { useApiTarget, missingTargetFields } from '../services/onestockClient';

const EMPTY = { id: '', name: '', operator: 'sum' };
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
  // Id of the metric being edited (PATCH), null for a creation (POST).
  const [editing, setEditing] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    setError(null);
    try {
      setLoading('Reading GET /metrics…');
      setMetrics(await fetchMetrics());
      if (!config || config.site !== target.siteId) await loadDeliveryConfig(setLoading);
    } catch (err: any) { setError(err?.message || String(err)); } finally { setLoading(null); }
  };

  const usages = useMemo(() => metricUsages(config?.routes || []), [config]);
  // Keys used by the routes but not defined in /metrics.
  const unknownKeys = metrics ? [...usages.keys()].filter(k => !metrics.some(m => m.id === k || m.name === k)) : [];
  const routesWithout = (config?.routes || []).filter(r => !Object.keys(r.metric_values || {}).length);

  const exists = !!metrics?.some(m => m.id === form.id.trim());
  const formError = !form.id.trim() ? 'Id required' : /\s/.test(form.id.trim()) ? 'No space in the id' : !editing && exists ? 'This id already exists: edit it instead' : '';
  const versionNumber = Number(version) || undefined;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setResult(null);
    try {
      await action();
      setResult({ ok: true, message: done });
      setMetrics(await fetchMetrics());
      return true;
    } catch (err: any) { setResult({ ok: false, message: err?.message || String(err) }); return false; } finally { setBusy(false); }
  };
  const save = async () => {
    const id = form.id.trim();
    if (await run(() => saveMetric({ ...form, id }, !!editing, versionNumber), `${editing ? 'Updated' : 'Created'}: ${id}`)) { setForm(EMPTY); setEditing(null); }
  };
  const edit = (m: Metric) => { setEditing(m.id); setForm({ id: m.id, name: String(m.name || ''), operator: String(m.operator || 'sum') }); setResult(null); };
  const remove = (m: Metric) => {
    const used = usages.get(metricKey(m, usages))?.routes.length;
    if (!window.confirm(`Delete the metric ${m.id}?${used ? `\nIt is used by ${used} route(s) (the API refuses with 409 while it is referenced).` : ''}`)) return;
    run(() => deleteMetric(m.id, versionNumber), `Deleted: ${m.id}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-2xl font-bold text-[#002D72]">Delivery metrics</h2>
          <p className="text-sm text-gray-500 mt-1">
            Metrics of the site (<span className="font-mono">GET /metrics</span>) and their values on the delivery routes (<span className="font-mono">metric_values</span>).
          </p>
        </div>
        <button onClick={load} disabled={!!loading || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
          {loading || (metrics ? 'Reload' : 'Load the metrics')}
        </button>
      </div>
      {missing && <p className="text-sm text-amber-700">Missing in API Settings: {missing}</p>}
      {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}

      {metrics && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
              <tr><th className="px-4 py-2 text-left">Metric</th><th className="px-4 py-2 text-left">Operator</th><th className="px-4 py-2 text-left">Routes</th><th className="px-4 py-2 text-left">Values</th><th /></tr>
            </thead>
            <tbody>
              {metrics.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No metric on this site.</td></tr>}
              {metrics.map(m => {
                const key = metricKey(m, usages);
                const u = usages.get(key);
                return (
                  <React.Fragment key={m.id}>
                    <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <td className="px-4 py-2.5"><p className="font-bold text-gray-800">{m.name || m.id}</p><p className="font-mono text-[11px] text-gray-400">{m.id}</p></td>
                      <td className="px-4 py-2.5">{m.operator ? <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-blue-50 text-[#002D72]">{String(m.operator)}</span> : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">no operator</span>}</td>
                      <td className="px-4 py-2.5 text-gray-600">{u ? `${u.routes.length} route(s)` : <span className="text-gray-300">not used</span>}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {u && (u.min !== undefined ? (u.min === u.max ? u.min : `${u.min} – ${u.max}`) : '—')}
                        {u && u.nulls > 0 && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{u.nulls} null</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={e => { e.stopPropagation(); edit(m); }} className="text-xs font-bold text-[#002D72] hover:underline mr-3">Edit</button>
                        <button onClick={e => { e.stopPropagation(); remove(m); }} disabled={busy} className="text-xs font-bold text-red-600 hover:underline mr-3 disabled:opacity-40">Delete</button>
                        <span className="text-gray-300">{open === m.id ? '▾' : '▸'}</span>
                      </td>
                    </tr>
                    {open === m.id && (
                      <tr className="bg-gray-50"><td colSpan={5} className="px-4 py-3 space-y-2">
                        <pre className="max-h-64 overflow-auto bg-gray-900 text-gray-100 p-3 rounded text-[11px]">{JSON.stringify(m, null, 2)}</pre>
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
        </div>
      )}

      {metrics && (unknownKeys.length > 0 || routesWithout.length > 0) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-1">
          {unknownKeys.map(k => (
            <p key={k}>Key <span className="font-mono">{k}</span> used by {usages.get(k)!.routes.length} route(s) but not defined in /metrics (no operator to combine it).{' '}
              <button onClick={() => { setEditing(null); setForm({ id: k, name: k, operator: 'sum' }); }} className="font-bold underline">Create it</button></p>
          ))}
          {routesWithout.length > 0 && <p>{routesWithout.length} route(s) without metric_values: {routesWithout.slice(0, 10).map(r => r.id).join(', ')}{routesWithout.length > 10 ? '…' : ''}</p>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <p className="font-bold text-gray-800">{editing ? `Edit the metric ${editing}` : 'Create a metric'}</p>
          <p className="text-xs text-gray-500">
            <span className="font-mono">{editing ? 'PATCH' : 'POST'} /metrics/{form.id.trim() || '{id}'}</span> · the routes give a value per metric (<span className="font-mono">metric_values</span>),
            the operator says how the delivery promise combines the values of its routes.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs text-gray-500">Id (key of metric_values)
            <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} disabled={!!editing} list="metric-suggestions" placeholder="cost_by_parcel" className="mt-1 w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg disabled:bg-gray-50" />
            <datalist id="metric-suggestions">{[...new Set([...SUGGESTIONS, ...unknownKeys])].map(k => <option key={k} value={k} />)}</datalist>
          </label>
          <label className="text-xs text-gray-500">Name
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={form.id || 'same as the id'} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
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
          <button onClick={save} disabled={!!formError || busy || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
            {busy ? 'Sending…' : editing ? 'Update' : 'Create'}
          </button>
          {editing && <button onClick={() => { setEditing(null); setForm(EMPTY); }} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>}
          {result && <span className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'} break-words`}>{result.message}</span>}
        </div>
      </div>
    </div>
  );
};

export default StepDeliveryMetrics;
