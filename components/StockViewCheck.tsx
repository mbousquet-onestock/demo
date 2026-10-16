import React, { useEffect, useState } from 'react';
import { onestockRequest, describeCallError } from '../services/onestockClient';
import { DeliveryConfig } from '../services/deliveryRouteService';

interface Props {
  config: DeliveryConfig;
  itemId: string;
  deliveryMethod: string;
  // Stock view names found in the delivery promise answer (debug), if any.
  suggestions: string[];
  // Read at once when the stock view is known.
  auto: boolean;
}

const STORAGE_KEY = 'onestock_stock_view_by_method';
const loadMap = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
const saveName = (method: string, name: string) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadMap(), [method]: name })); } catch { /* ignore */ }
};

interface Line { endpoint_id?: string; item_id?: string; quantity?: number; type?: string; earliest_eta?: number; eta_end?: number; details?: Record<string, any> }

// Stock of the item through the stock view (OMC stock query) of a delivery method: GET /stock_export.
const StockViewCheck: React.FC<Props> = ({ config, itemId, deliveryMethod, suggestions, auto }) => {
  const [name, setName] = useState(() => loadMap()[deliveryMethod] || suggestions[0] || '');
  const [withDetails, setWithDetails] = useState(false);
  const [state, setState] = useState<{ loading?: boolean; error?: string; lines?: Line[]; body?: unknown } | null>(null);

  const run = async (requestName = name) => {
    if (!requestName.trim() || !itemId) return;
    saveName(deliveryMethod, requestName.trim());
    setState({ loading: true });
    try {
      const body = {
        request_name: requestName.trim(),
        aggregates: { '*': { item_filter: { ids: [itemId] } } },
        unification: { by_stock_type: true },
        ...(withDetails ? { with_details: true } : {}),
      };
      const { envelope } = await onestockRequest({ method: 'GET', path: '/stock_export', body });
      if (!envelope.ok) throw new Error(describeCallError(envelope));
      const raw: any = envelope.body;
      const lines: Line[] = Array.isArray(raw?.stocks) ? raw.stocks : [];
      setState({ lines: lines.filter(l => !l.item_id || String(l.item_id) === itemId), body: raw });
    } catch (err: any) {
      setState({ error: err?.message || String(err) });
    }
  };
  useEffect(() => { if (auto && name) run(name); }, [auto, itemId, deliveryMethod]);

  const epName = (id?: string) => config.endpoints.find(e => e.id === id)?.name;
  const lines = state?.lines || [];
  const total = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const positive = lines.filter(l => Number(l.quantity) > 0);

  return (
    <div className="border border-blue-100 bg-blue-50/30 rounded-lg p-3 space-y-2">
      <p className="font-bold text-gray-600">Stock seen by the stock view of "{deliveryMethod}" (GET /stock_export)</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          list={`sv-${deliveryMethod}`}
          placeholder="Stock view (request_name of the OMC stock query)"
          className="flex-1 min-w-[220px] px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg font-mono"
        />
        <datalist id={`sv-${deliveryMethod}`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
        <label className="flex items-center gap-1 text-[11px] text-gray-600"><input type="checkbox" checked={withDetails} onChange={e => setWithDetails(e.target.checked)} />with details</label>
        <button onClick={() => run()} disabled={!name.trim() || state?.loading} className="px-3 py-1.5 text-[11px] font-bold text-white bg-[#002D72] rounded-lg disabled:opacity-40">{state?.loading ? 'Reading…' : 'Read stock'}</button>
      </div>
      {!name && <p className="text-[11px] text-gray-500">Enter the stock view used by this delivery method (OMC → stock queries); it is remembered for "{deliveryMethod}".</p>}
      {state?.error && <p className="text-[11px] text-red-600 break-words">{state.error}</p>}
      {state?.lines && (
        lines.length === 0
          ? <p className="text-[11px] text-red-700 font-bold">No stock for {itemId} in the stock view "{name}": the delivery method cannot use any stock (check the stock query filters: stock points, stock types, deductions).</p>
          : (
            <>
              <p className={`text-[11px] ${positive.length ? 'text-emerald-700' : 'text-red-700'} font-bold`}>
                {positive.length} stock point(s) with stock · total {total}{positive.length === 0 && ' — every line is at 0 after the deductions of the stock view'}
              </p>
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-gray-400"><th>Stock point</th><th className="text-right">Qty</th><th>Type</th><th>ETA</th>{withDetails && <th>Details</th>}</tr></thead>
                <tbody>
                  {lines.sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0)).slice(0, 300).map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td>{epName(l.endpoint_id) ? <>{epName(l.endpoint_id)} <span className="font-mono text-gray-400">{l.endpoint_id}</span></> : <span className="font-mono">{l.endpoint_id || 'all'}</span>}</td>
                      <td className={`text-right font-mono ${Number(l.quantity) > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{l.quantity}</td>
                      <td>{l.type || ''}</td>
                      <td>{l.earliest_eta || l.eta_end ? new Date((l.earliest_eta || l.eta_end)! * 1000).toLocaleDateString() : ''}</td>
                      {withDetails && <td className="font-mono text-gray-500 break-all">{l.details ? JSON.stringify(l.details) : ''}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
      )}
    </div>
  );
};

export default StockViewCheck;
