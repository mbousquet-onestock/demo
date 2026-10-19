import React, { useEffect, useState } from 'react';
import {
  Metric, SortOrder, SortCriteria, SORT_PRESETS, fetchSortOrders, saveSortOrder, deleteSortOrder,
  sortFields, sortOrderLabel, unknownMetricFields,
} from '../services/metricService';
import { SalesChannelInfo, fetchSalesChannels } from '../services/salesChannelService';

interface Props {
  metrics: Metric[];
  // Delivery Promise version (current when undefined).
  version?: number;
  disabled?: boolean;
}

const EMPTY: SortOrder = { id: '', sales_channel: '', delivery_method: '', sort_orders: [], sort_criterias: [{ field: 'eta_end', desc: false }] };

// Sort orders (GET /sort_orders): order of the delivery options per delivery method / sales channel, on ETA or metrics.
const SortOrdersPanel: React.FC<Props> = ({ metrics, version, disabled }) => {
  const [orders, setOrders] = useState<SortOrder[] | null>(null);
  const [channels, setChannels] = useState<SalesChannelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SortOrder>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    setError(null);
    try { setOrders(await fetchSortOrders(version)); } catch (err: any) { setError(err?.message || String(err)); }
  };
  useEffect(() => {
    load();
    fetchSalesChannels().then(setChannels).catch(() => setChannels([]));
  }, []);

  const fields = sortFields(metrics);
  const criterias = form.sort_criterias || [];
  const setCriteria = (i: number, c: Partial<SortCriteria>) => setForm({ ...form, sort_criterias: criterias.map((x, k) => (k === i ? { ...x, ...c } : x)) });
  const move = (i: number, d: number) => {
    const next = [...criterias];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setForm({ ...form, sort_criterias: next });
  };
  const togglePreset = (p: string) => {
    const cur = form.sort_orders || [];
    setForm({ ...form, sort_orders: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p] });
  };

  const id = form.id.trim();
  const formError = !id ? 'Id required' : /\s/.test(id) ? 'No space in the id'
    : !editing && orders?.some(o => o.id === id) ? 'This id already exists: edit it instead'
      : !form.delivery_method?.trim() ? 'Delivery method required'
        : !criterias.some(c => c.field.trim()) && !(form.sort_orders || []).length ? 'At least one criterion or preset' : '';
  const warnings = unknownMetricFields(form, metrics);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setResult(null);
    try {
      await action();
      setResult({ ok: true, message: done });
      await load();
      return true;
    } catch (err: any) { setResult({ ok: false, message: err?.message || String(err) }); return false; } finally { setBusy(false); }
  };
  const save = async () => {
    const body: SortOrder = {
      id,
      sales_channel: form.sales_channel?.trim() || undefined,
      delivery_method: form.delivery_method?.trim(),
      ...((form.sort_orders || []).length ? { sort_orders: form.sort_orders } : {}),
      sort_criterias: criterias.filter(c => c.field.trim()).map(c => ({ field: c.field.trim(), desc: !!c.desc })),
    };
    if (await run(() => saveSortOrder(body, !!editing, version), `${editing ? 'Updated' : 'Created'}: ${id}`)) { setForm(EMPTY); setEditing(null); }
  };
  const edit = (o: SortOrder) => {
    setEditing(o.id);
    setForm({ ...EMPTY, ...o, sort_orders: o.sort_orders || [], sort_criterias: o.sort_criterias?.length ? o.sort_criterias : [] });
    setResult(null);
  };
  const remove = (o: SortOrder) => {
    if (!window.confirm(`Delete the sort order ${o.id}?`)) return;
    run(() => deleteSortOrder(o.id, version), `Deleted: ${o.id}`);
  };

  const input = 'mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg';
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="flex-1">
          <p className="font-bold text-gray-800">Sort orders</p>
          <p className="text-xs text-gray-500">Order of the delivery options of a delivery method / sales channel (<span className="font-mono">GET /sort_orders</span>), on the ETA or the metrics.</p>
        </div>
        <button onClick={load} className="text-xs font-bold text-[#002D72] hover:underline">Reload</button>
      </div>
      {error && <p className="m-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
      {orders && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
            <tr><th className="px-4 py-2 text-left">Sort order</th><th className="px-4 py-2 text-left">Delivery method · sales channel</th><th className="px-4 py-2 text-left">Criteria</th><th /></tr>
          </thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No sort order on this site.</td></tr>}
            {orders.map(o => {
              const unknown = unknownMetricFields(o, metrics);
              return (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{o.id}</td>
                  <td className="px-4 py-2.5 text-gray-600">{o.delivery_method || '—'} · {o.sales_channel || <span className="text-gray-400">all channels</span>}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {sortOrderLabel(o)}
                    {unknown.length > 0 && <p className="text-[10px] text-red-600">Metric not defined: {unknown.join(', ')}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => edit(o)} className="text-xs font-bold text-[#002D72] hover:underline mr-3">Edit</button>
                    <button onClick={() => remove(o)} disabled={busy} className="text-xs font-bold text-red-600 hover:underline disabled:opacity-40">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="p-4 border-t border-gray-100 space-y-3">
        <p className="text-sm font-bold text-gray-700">
          {editing ? `Edit ${editing}` : 'New sort order'} <span className="font-mono text-xs font-normal text-gray-400">{editing ? `PATCH /sort_orders/${editing}` : 'POST /sort_orders'}</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-gray-500">Id
            <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} disabled={!!editing} placeholder="standard_web_fr" className={`${input} font-mono disabled:bg-gray-50`} />
          </label>
          <label className="text-xs text-gray-500">Delivery method
            <input value={form.delivery_method || ''} onChange={e => setForm({ ...form, delivery_method: e.target.value })} list="sort-methods" placeholder="standard" className={input} />
            <datalist id="sort-methods">{[...new Set((orders || []).map(o => o.delivery_method).filter(Boolean))].map(m => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="text-xs text-gray-500">Sales channel
            {channels.length > 0 ? (
              <select value={form.sales_channel || ''} onChange={e => setForm({ ...form, sales_channel: e.target.value })} className={`${input} bg-white`}>
                <option value="">— none —</option>
                {channels.map(c => <option key={c.id} value={c.id}>{c.id}{c.name && c.name !== c.id ? ` — ${c.name}` : ''}</option>)}
                {form.sales_channel && !channels.some(c => c.id === form.sales_channel) && <option value={form.sales_channel}>{form.sales_channel}</option>}
              </select>
            ) : <input value={form.sales_channel || ''} onChange={e => setForm({ ...form, sales_channel: e.target.value })} placeholder="sc001" className={input} />}
          </label>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Criteria, in order (the next one breaks the ties of the previous one)</p>
          <datalist id="sort-fields">{fields.map(f => <option key={f} value={f} />)}</datalist>
          <div className="space-y-2">
            {criterias.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-5 text-xs text-gray-400 text-right">{i + 1}.</span>
                <input value={c.field} onChange={e => setCriteria(i, { field: e.target.value })} list="sort-fields" placeholder="eta_end or delivery_route.metric_value.cost_by_parcel" className="flex-1 min-w-[260px] px-3 py-1.5 text-sm font-mono border border-gray-200 rounded-lg" />
                <select value={c.desc ? 'desc' : 'asc'} onChange={e => setCriteria(i, { desc: e.target.value === 'desc' })} className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="asc">ascending (lowest first)</option>
                  <option value="desc">descending (highest first)</option>
                </select>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="px-2 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Up">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === criterias.length - 1} className="px-2 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Down">↓</button>
                <button onClick={() => setForm({ ...form, sort_criterias: criterias.filter((_, k) => k !== i) })} className="px-2 text-red-400 hover:text-red-600" title="Remove">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setForm({ ...form, sort_criterias: [...criterias, { field: '', desc: false }] })} className="mt-2 text-xs font-bold text-[#002D72] hover:underline">+ Add a criterion</button>
          {warnings.length > 0 && <p className="mt-1 text-xs text-amber-700">Metric not defined in /metrics: {warnings.join(', ')}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="text-gray-500">Presets (sort_orders, older sites):</span>
          {SORT_PRESETS.map(p => (
            <label key={p} className="flex items-center gap-1"><input type="checkbox" checked={(form.sort_orders || []).includes(p)} onChange={() => togglePreset(p)} />{p}</label>
          ))}
        </div>

        {formError && form.id && <p className="text-xs text-red-600">{formError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={!!formError || busy || disabled} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
            {busy ? 'Sending…' : editing ? 'Update' : 'Create'}
          </button>
          {editing && <button onClick={() => { setEditing(null); setForm(EMPTY); }} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>}
          {result && <span className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'} break-words`}>{result.message}</span>}
        </div>
      </div>
    </div>
  );
};

export default SortOrdersPanel;
