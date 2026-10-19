import React, { useMemo, useState } from 'react';
import { deliveryConfigStore, loadDeliveryConfig, carrierLabel } from '../services/deliveryRouteService';
import { Metric, fetchMetrics, createMetric, metricUsages } from '../services/metricService';
import { useApiTarget, missingTargetFields } from '../services/onestockClient';

const TEMPLATE = JSON.stringify({ metric: { id: 'cost', name: 'Delivery cost' } }, null, 2);

// Delivery Routes → Metrics: metrics of the site (GET /metrics), their use in the routes (metric_values), creation.
const StepDeliveryMetrics: React.FC = () => {
  const config = deliveryConfigStore.use();
  const target = useApiTarget();
  const missing = missingTargetFields(target);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState(TEMPLATE);
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
  const unknownKeys = metrics ? [...usages.keys()].filter(k => !metrics.some(m => m.id === k)) : [];
  const routesWithout = (config?.routes || []).filter(r => !Object.keys(r.metric_values || {}).length);

  let parsed: Record<string, unknown> | null = null;
  let parseError = '';
  try { parsed = JSON.parse(draft); } catch (err: any) { parseError = err.message; }

  const create = async () => {
    if (!parsed) return;
    setResult(null);
    try {
      await createMetric(parsed);
      setResult({ ok: true, message: 'Created' });
      setMetrics(await fetchMetrics());
    } catch (err: any) { setResult({ ok: false, message: err?.message || String(err) }); }
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
              <tr><th className="px-4 py-2 text-left">Metric</th><th className="px-4 py-2 text-left">Routes</th><th className="px-4 py-2 text-left">Values</th><th /></tr>
            </thead>
            <tbody>
              {metrics.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No metric on this site.</td></tr>}
              {metrics.map(m => {
                const u = usages.get(m.id);
                return (
                  <React.Fragment key={m.id}>
                    <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <td className="px-4 py-2.5"><p className="font-bold text-gray-800">{m.name || m.id}</p><p className="font-mono text-[11px] text-gray-400">{m.id}</p></td>
                      <td className="px-4 py-2.5 text-gray-600">{u ? `${u.routes.length} route(s)` : <span className="text-gray-300">not used</span>}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {u && (u.min !== undefined ? (u.min === u.max ? u.min : `${u.min} – ${u.max}`) : '—')}
                        {u && u.nulls > 0 && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{u.nulls} null</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{open === m.id ? '▾' : '▸'}</td>
                    </tr>
                    {open === m.id && (
                      <tr className="bg-gray-50"><td colSpan={4} className="px-4 py-3 space-y-2">
                        <pre className="max-h-64 overflow-auto bg-gray-900 text-gray-100 p-3 rounded text-[11px]">{JSON.stringify(m, null, 2)}</pre>
                        {u && <div className="text-xs text-gray-600 space-y-0.5">{u.routes.map(r => (
                          <p key={r.id}><span className="font-mono">{r.id}</span> · {r.origin_zone_id} → {r.destination_zone_id} · {carrierLabel(r)} · <strong>{r.metric_values?.[m.id] ?? 'null'}</strong></p>
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
          {unknownKeys.map(k => <p key={k}>Key <span className="font-mono">{k}</span> used by {usages.get(k)!.routes.length} route(s) but not defined in /metrics.</p>)}
          {routesWithout.length > 0 && <p>{routesWithout.length} route(s) without metric_values: {routesWithout.slice(0, 10).map(r => r.id).join(', ')}{routesWithout.length > 10 ? '…' : ''}</p>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <p className="font-bold text-gray-800">Create a metric</p>
          <p className="text-xs text-gray-500">Body sent as is with <span className="font-mono">POST /metrics</span> (site_id and token added).</p>
        </div>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={10} spellCheck={false} className="w-full font-mono text-xs p-3 border border-gray-200 rounded-lg" />
        {parseError && <p className="text-xs text-red-600">Invalid JSON: {parseError}</p>}
        <div className="flex items-center gap-3">
          <button onClick={create} disabled={!parsed || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">POST /metrics</button>
          {result && <span className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'} break-words`}>{result.message}</span>}
        </div>
      </div>
    </div>
  );
};

export default StepDeliveryMetrics;
