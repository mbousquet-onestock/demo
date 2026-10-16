import React, { useEffect, useState } from 'react';
import { onestockRequest, describeCallError, SITE_ID_VAR, TOKEN_VAR, useApiTarget } from '../services/onestockClient';
import { fetchSalesChannels, SalesChannelInfo } from '../services/salesChannelService';
import { settingsStore } from '../services/appStores';
import { savePayload, getLastProject } from '../services/payloadStore';
import StockViewCheck from './StockViewCheck';
import { DeliveryConfig, EndpointAnalysis, carrierLabel, routeTimetableIssues, transitIssue, feesIssue, executionTimeIssue, endpointExecutionTimes, RouteEndpoint } from '../services/deliveryRouteService';

interface Props {
  config: DeliveryConfig;
  itemId: string;
  country: string;
  zip: string;
  // Result of the local analysis (stock × routes), compared with the OneStock answer.
  analyses: EndpointAnalysis[];
}

const STATUS_COLORS: Record<string, string> = {
  valid: '#059669', valid_estimation: '#0D9488', partial: '#D97706', partial_estimation: '#D97706', none: '#DC2626',
};

// Meaning of the OneStock failure reasons (API documentation) and what to check in the configuration.
const REASONS: Record<string, { meaning: string; check: string }> = {
  no_stock: { meaning: 'Not enough stock available, or the item is restricted for this delivery method.', check: 'Stock of the item in the stock points of the origin zones; item restrictions of the delivery method; stock reservations / buffers.' },
  missing_config: { meaning: 'The combination destination + sales channel + delivery method is not configured.', check: 'Delivery configuration of this sales channel and delivery method; destination zone matching the address (country / zip).' },
  beyond_time_limit: { meaning: 'Cannot be fulfilled within a reasonable timeframe (stock point or carrier timetable).', check: 'Opening hours of the stock points with stock (closed, no opening in the next days), then the opening / pickup / delivery timetables of the routes.' },
  no_eligible_route: { meaning: 'Every eligible route was discarded after applying the configured constraints.', check: 'Order / parcel constraints of the routes reaching the destination; routes from the zones of the stock points with stock; opening hours of these stock points.' },
  estimation_degraded_mode: { meaning: 'The stock repartitions exceed the computation limits.', check: 'Too many stock points / combinations: number of stock points with stock, maximum shipments.' },
  failed_parcel_constraints: { meaning: 'No route can handle the parcel.', check: 'Parcel constraints (weight, dimensions formulas) of the routes vs the item weight / dimensions.' },
  failed_parcel_contraints: { meaning: 'No route can handle the parcel.', check: 'Parcel constraints (weight, dimensions formulas) of the routes vs the item weight / dimensions.' },
  future_arrival_exceeds_limit: { meaning: 'The stock used arrives after the precalculation limit of the Delivery Promise module.', check: 'Future / in-transit stock ETA; precalculation limit of the module.' },
  invalid_item: { meaning: 'The item does not exist in OneStock.', check: 'Item id (PATCH /items); spelling of the item id.' },
  exceeds_authorized_shipment_number: { meaning: 'No promise within the configured maximum number of shipments.', check: 'Authorized shipment number; stock split over several stock points.' },
  missing_destination_timetable: { meaning: 'No destination timetable found to compute the ETA.', check: 'Delivery timetable of the routes reaching the destination.' },
};


// ---- Debug data of the answer (format not documented: searched by key name, possibly grouped by delivery method)
const findByKey = (node: any, re: RegExp, depth = 0, path = ''): { path: string; value: any }[] => {
  if (!node || typeof node !== 'object' || depth > 8) return [];
  if (Array.isArray(node)) return node.flatMap((x, i) => findByKey(x, re, depth + 1, `${path}[${i}]`));
  return Object.entries(node).flatMap(([k, v]) => (re.test(k)
    ? [{ path: path ? `${path}.${k}` : k, value: v }]
    : findByKey(v, re, depth + 1, path ? `${path}.${k}` : k)));
};
// Value for one delivery method when the debug data is grouped by method ({ standard: …, express: … }).
const forMethod = (value: any, method: string, methods: string[]) =>
  value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).some(k => methods.includes(k)) ? value[method] : value;

interface StockRow { endpoint: string; item: string; quantity: number | string; type?: string; eta?: string }
const stockRows = (value: any): StockRow[] => {
  const rows: StockRow[] = [];
  const walk = (n: any, depth: number, endpointKey?: string) => {
    if (!n || typeof n !== 'object' || depth > 8) return;
    if (Array.isArray(n)) { n.forEach(x => walk(x, depth + 1, endpointKey)); return; }
    const endpoint = n.endpoint_id ?? n.endpoint ?? n.stock_location_id ?? endpointKey;
    const quantity = n.quantity ?? n.qty ?? n.available ?? n.stock;
    if (endpoint !== undefined && (typeof quantity === 'number' || typeof quantity === 'string')) {
      rows.push({
        endpoint: String(endpoint), item: String(n.item_id ?? n.item ?? n.id ?? ''), quantity,
        type: n.type ?? n.stock_type, eta: n.eta_end ? new Date(n.eta_end * 1000).toLocaleDateString() : undefined,
      });
      return;
    }
    // { <endpoint id>: { quantity } } maps
    Object.entries(n).forEach(([k, v]) => walk(v, depth + 1, v && typeof v === 'object' && !Array.isArray(v) && ('quantity' in (v as any) || 'qty' in (v as any)) ? k : endpointKey));
  };
  walk(value, 0);
  return rows;
};
const isEmpty = (v: any) => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

const fmt = (t?: number) => (t ? new Date(t * 1000).toLocaleString() : '—');

const DeliveryPromisePanel: React.FC<Props> = ({ config, itemId, country, zip, analyses }) => {
  const settings = settingsStore.use();
  const target = useApiTarget();
  const [channels, setChannels] = useState<SalesChannelInfo[]>(settings.salesChannelsCache || []);
  const [channelsState, setChannelsState] = useState<string | null>(null);
  const [salesChannel, setSalesChannel] = useState(settings.salesChannel || channels[0]?.id || '');
  // Sales channels of the selected site (GET /sales_channels), reloaded when the site changes.
  const loadChannels = async () => {
    setChannelsState('Loading…');
    try {
      const list = await fetchSalesChannels();
      setChannels(list);
      settingsStore.set(prev => ({ ...prev, salesChannelsCache: list }));
      setSalesChannel(prev => (list.some(c => c.id === prev) ? prev : list[0]?.id || ''));
      setEdited(null);
      setChannelsState(list.length ? null : 'No sales channel returned.');
    } catch (err: any) {
      setChannelsState(err?.message || String(err));
    }
  };
  useEffect(() => { loadChannels(); }, [target.siteId, target.baseUrl, target.token]);
  const [methods, setMethods] = useState('standard');
  const [qty, setQty] = useState(1);
  const [debug, setDebug] = useState(true);
  const [edited, setEdited] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status: number; body: any; error?: string; durationMs?: number; url?: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const location: Record<string, string> = { country: country || 'FR', ...(zip ? { zip_code: zip } : {}) };
  const built = {
    site_id: SITE_ID_VAR,
    token: TOKEN_VAR,
    fields: ['delivery_options.delivery_routes', 'delivery_options.excluded_line_items'],
    line_items: [{ item_id: itemId, qty }],
    sales_channel: salesChannel,
    delivery_options: methods.split(',').map(m => m.trim()).filter(Boolean).map(delivery_method => ({ delivery_method, destination: { location } })),
    pricing_details: { price: 0 },
    ...(debug ? { debug: { all: true, delivery_routes: true, delivery_restrictions: true, stocks: { all: true } } } : {}),
  };
  // The payload follows the form until it is edited by hand.
  useEffect(() => { setEdited(null); }, [itemId, country, zip]);
  const text = edited ?? JSON.stringify(built, null, 2);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setSaved(null);
    try {
      const body = JSON.parse(text);
      const { url, envelope } = await onestockRequest({ method: 'GET', path: '/delivery_promises', body });
      setResult({ ok: envelope.ok, status: envelope.status, body: envelope.body, durationMs: envelope.durationMs, url, error: envelope.ok ? undefined : describeCallError(envelope) });
    } catch (err: any) {
      setResult({ ok: false, status: 0, body: null, error: err?.message || String(err) });
    } finally {
      setRunning(false);
    }
  };

  const save = () => {
    if (!result) return;
    const name = `Delivery promise ${itemId} → ${country}${zip ? ` ${zip}` : ''}`;
    savePayload({ name, project: getLastProject() || undefined, source: 'explorer', method: 'GET', path: '/delivery_promises', url: result.url, request: JSON.parse(text), response: result.body, status: result.status, durationMs: result.durationMs });
    setSaved(`Saved as "${name}"${getLastProject() ? ` in ${getLastProject()}` : ''}.`);
  };

  const options: any[] = Array.isArray(result?.body?.delivery_options) ? result!.body.delivery_options : [];
  const methodList = options.map(o => String(o.delivery_method || ''));
  // Debug outside the delivery options (top level).
  const globalPart = result?.body && typeof result.body === 'object' ? Object.fromEntries(Object.entries(result.body).filter(([k]) => k !== 'delivery_options')) : {};
  const debugOf = (o: any, re: RegExp) => {
    const own = findByKey(o, re);
    if (own.length) return own;
    return findByKey(globalPart, re).map(f => ({ ...f, value: forMethod(f.value, String(o.delivery_method || ''), methodList) }));
  };
  // Stock view names mentioned in the answer (debug: request_name / stock_request / stock_query…).
  const STOCK_VIEW_KEY = /request_name|stock_request|stock_query|stock_view/i;
  const stockViewsOf = (o: any) => {
    const method = String(o.delivery_method || '');
    // Found in the global debug under another delivery method (debug.delivery_configs.<method>…): not this one's.
    const global = findByKey(globalPart, STOCK_VIEW_KEY).filter(f => {
      const segments = f.path.split(/[.[\]]/);
      return !methodList.some(m => m !== method && segments.includes(m));
    });
    return [...new Set([...findByKey(o, STOCK_VIEW_KEY), ...global]
      .map(f => forMethod(f.value, method, methodList)).filter((v: any) => typeof v === 'string' && v))] as string[];
  };
  const endpointName = (id: string) => config.endpoints.find(e => e.id === id)?.name;
  const extraKeys = result?.body && typeof result.body === 'object' ? Object.keys(result.body).filter(k => k !== 'delivery_options') : [];
  const withStock = analyses.filter(a => a.quantity > 0);
  const deliverable = analyses.filter(a => a.verdict === 'deliverable');
  // Routes of the configuration used by an option (same carrier name / option).
  const configRoutesOf = (r: any) => config.routes.filter(x => x.carrier?.name === r?.carrier?.name && (!r?.carrier?.option || x.carrier?.option === r.carrier.option));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[#002D72]">Delivery promise (GET /delivery_promises)</h3>
        <p className="text-xs text-gray-500">Asks OneStock for the promise of this article and destination, with the routes used and the debug details, to compare with the analysis above.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Sales channel <button type="button" onClick={loadChannels} className="ml-1 normal-case tracking-normal text-[#002D72] underline" title="GET /sales_channels">refresh</button>
        </span>
          <select value={salesChannel} onChange={e => { setSalesChannel(e.target.value); setEdited(null); }} className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-64">
            {!channels.some(c => c.id === salesChannel) && <option value={salesChannel}>{salesChannel || 'Select…'}</option>}
            {channels.map(c => {
              const label = c.name || c.description;
              return <option key={c.id} value={c.id}>{c.id}{label && label !== c.id ? ` — ${label}` : ''}{c.currency ? ` (${c.currency})` : ''}</option>;
            })}
          </select>
          {channelsState && <span className={`text-[10px] ${channelsState === 'Loading…' ? 'text-gray-400' : 'text-red-600'} max-w-64 break-words`}>{channelsState}</span>}
        </label>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery methods (comma separated)</span>
          <input value={methods} onChange={e => { setMethods(e.target.value); setEdited(null); }} placeholder="standard, express" className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-64 font-mono" /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Qty</span>
          <input type="number" min={1} value={qty} onChange={e => { setQty(Math.max(1, parseInt(e.target.value) || 1)); setEdited(null); }} className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-20" /></label>
        <label className="flex items-center gap-2 text-xs text-gray-600 pb-2"><input type="checkbox" checked={debug} onChange={e => { setDebug(e.target.checked); setEdited(null); }} />Debug (all)</label>
        <button onClick={run} disabled={running || !itemId} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">{running ? 'Calling…' : 'Run delivery promise'}</button>
      </div>

      <details>
        <summary className="text-[11px] font-bold text-gray-500 cursor-pointer">Request payload {edited !== null && <span className="text-amber-600">(edited)</span>}</summary>
        <textarea value={text} onChange={e => setEdited(e.target.value)} spellCheck={false} className="mt-2 w-full h-56 font-mono text-[11px] p-3 bg-gray-900 text-gray-100 rounded-lg" />
        {edited !== null && <button onClick={() => setEdited(null)} className="text-[11px] text-gray-500 underline">Rebuild from the form</button>}
      </details>

      {result && !result.ok && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{result.error}</p>}

      {result?.ok && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span>HTTP {result.status}{result.durationMs !== undefined ? ` · ${result.durationMs} ms` : ''}</span>
            <button onClick={save} className="font-bold text-[#002D72] underline">Save the call</button>
            {saved && <span className="text-emerald-700">{saved}</span>}
          </div>
          {options.length === 0 && <p className="text-sm text-gray-600">No delivery option returned.</p>}
          {options.map((o, i) => {
            const reason = o.reason ? REASONS[o.reason] : null;
            return (
              <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-gray-900 font-mono">{o.delivery_method}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ background: STATUS_COLORS[o.status] || '#6B7280' }}>{o.status || '?'}</span>
                  {o.reason && <span className="font-mono text-red-700">{o.reason}</span>}
                  {o.destination?.delivery_zone && <span className="text-gray-500">destination zone <strong>{o.destination.delivery_zone}</strong></span>}
                </div>
                {o.status && o.status !== 'none' && (o.cost === null || o.cost === undefined) && (
                  <p className="text-red-600 font-bold">⚠ Delivery fees null: the option has no cost (check the metric_values of its routes).</p>
                )}
                {o.status && o.status !== 'none' && (
                  <p className="text-gray-700">ETA {fmt(o.eta_start)} → {fmt(o.eta_end)} · {o.shipment_number ?? '?'} shipment(s){o.cost !== undefined ? ` · cost ${o.cost}` : ''}{o.cutoff ? ` · cutoff ${fmt(o.cutoff)}` : ''}</p>
                )}
                {Array.isArray(o.line_items) && o.line_items.length > 0 && (
                  <p className="text-gray-600">Fulfillable: {o.line_items.map((l: any) => `${l.item_id} × ${l.qty}`).join(', ')}</p>
                )}
                {Array.isArray(o.excluded_line_items) && o.excluded_line_items.length > 0 && (
                  <p className="text-amber-700">Excluded: {JSON.stringify(o.excluded_line_items)}</p>
                )}
                {Array.isArray(o.delivery_routes) && o.delivery_routes.length > 0 && (
                  <div>
                    <p className="font-bold text-gray-500">Routes used</p>
                    {o.delivery_routes.map((r: any, j: number) => {
                      const matches = configRoutesOf(r);
                      return (
                        <p key={j} className="text-gray-700">
                          <span className="font-mono">{[r.carrier?.name, r.carrier?.option].filter(Boolean).join(' / ')}</span>
                          {Array.isArray(r.items) && r.items.length > 0 && <> · {r.items.map((it: any) => `${it.id} × ${it.quantity}`).join(', ')}</>}
                          {matches.length > 0 && <span className="text-gray-400"> · config route(s) {matches.map(m => `${m.id} (${m.origin_zone_id} → ${m.destination_zone_id})`).join(', ')}</span>}
                        </p>
                      );
                    })}
                  </div>
                )}
                {(() => {
                  const stocks = debugOf(o, /^(stocks?|stock_repartitions?)$/i);
                  const rows = stocks.flatMap(f => stockRows(f.value));
                  const total = rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
                  const restrictions = debugOf(o, /restriction/i);
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="border border-gray-100 rounded-lg p-3">
                        <p className="font-bold text-gray-500 mb-1">Stock of the delivery method's stock request{rows.length ? ` · ${rows.length} line(s), total ${total}` : ''}</p>
                        {stocks.length === 0 ? <p className="text-gray-400">Not returned (enable Debug).</p>
                          : rows.length === 0 ? <p className="text-amber-700">No stock line returned: the stock request of this delivery method finds no stock for the item.</p> : (
                            <table className="w-full text-[11px]">
                              <thead><tr className="text-left text-gray-400"><th>Stock point</th><th>Item</th><th className="text-right">Qty</th><th>Type</th></tr></thead>
                              <tbody>
                                {rows.slice(0, 200).map((r, k) => (
                                  <tr key={k} className="border-t border-gray-50">
                                    <td>{endpointName(r.endpoint) ? <>{endpointName(r.endpoint)} <span className="font-mono text-gray-400">{r.endpoint}</span></> : <span className="font-mono">{r.endpoint}</span>}</td>
                                    <td className="font-mono">{r.item}</td>
                                    <td className={`text-right font-mono ${Number(r.quantity) > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{r.quantity}</td>
                                    <td>{r.type}{r.eta ? ` · ${r.eta}` : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        {stocks.length > 0 && <details className="mt-1"><summary className="text-[10px] text-gray-400 cursor-pointer">Raw ({stocks.map(f => f.path).join(', ')})</summary><pre className="max-h-60 overflow-auto text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(stocks.map(f => f.value), null, 2)}</pre></details>}
                      </div>
                      <div className="border border-gray-100 rounded-lg p-3">
                        <p className="font-bold text-gray-500 mb-1">Delivery restrictions</p>
                        {restrictions.length === 0 ? <p className="text-gray-400">Not returned (enable Debug).</p>
                          : restrictions.every(f => isEmpty(f.value)) ? <p className="text-emerald-700">No delivery restriction.</p> : (
                            <div className="space-y-1">
                              {restrictions.filter(f => !isEmpty(f.value)).flatMap(f => (Array.isArray(f.value) ? f.value : [f.value]).map((r: any, k: number) => (
                                <div key={`${f.path}-${k}`} className="p-2 bg-amber-50 border border-amber-100 rounded text-[11px]">
                                  {r && typeof r === 'object'
                                    ? Object.entries(r).map(([rk, rv]) => <p key={rk}><span className="text-gray-500">{rk}:</span> <span className="font-mono break-all">{typeof rv === 'object' ? JSON.stringify(rv) : String(rv)}</span></p>)
                                    : <span className="font-mono">{String(r)}</span>}
                                </div>
                              )))}
                              <p className="text-[10px] text-gray-400">{restrictions.map(f => f.path).join(', ')}</p>
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })()}
                {(o.status === 'none' || /partial/.test(o.status || '') || !o.status) && (
                  <StockViewCheck config={config} itemId={itemId} deliveryMethod={String(o.delivery_method || '')} suggestions={stockViewsOf(o)} auto />
                )}
                {reason && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-1">
                    <p className="text-red-800"><strong>Why:</strong> {reason.meaning}</p>
                    <p className="text-red-800"><strong>Check:</strong> {reason.check}</p>
                    {['beyond_time_limit', 'no_eligible_route', 'missing_destination_timetable', 'no_stock'].includes(o.reason) && withStock.some(a => a.opening) && (
                      <p className="text-amber-800">Opening hours: {withStock.filter(a => a.opening).map(a => `${(a.endpoint as any).name || a.endpoint.id} ${a.opening}`).join(' ; ')}.</p>
                    )}
                    {['beyond_time_limit', 'no_eligible_route', 'missing_destination_timetable'].includes(o.reason) && (() => {
                      const routes = [...new Map(withStock.flatMap(a => (a.deliveringRoutes.length ? a.deliveringRoutes : a.routes)).map(r => [r.id, r])).values()];
                      const issues = routes.map(r => ({ r, issue: [transitIssue(r) && `transit: ${transitIssue(r)}`, feesIssue(r) && `fees: ${feesIssue(r)}`, routeTimetableIssues(r, config.timetables)].filter(Boolean).join(' ; ') })).filter(x => x.issue);
                      return issues.length
                        ? <p className="text-amber-800">Routes transit / timetables: {issues.map(x => `${x.r.id} (${carrierLabel(x.r)}) — ${x.issue}`).join(' ; ')}.</p>
                        : routes.length ? <p className="text-gray-700">The transit times and timetables of the {routes.length} route(s) from the stock are set.</p> : null;
                    })()}
                    {['beyond_time_limit', 'no_eligible_route', 'missing_destination_timetable'].includes(o.reason) && (() => {
                      // Execution times of the stock points with stock when known, else every execution time of the site.
                      const own = withStock.flatMap(a => endpointExecutionTimes(a.endpoint as RouteEndpoint, config.executionTimes));
                      const list = own.length ? own : config.executionTimes || [];
                      const issues = [...new Map(list.map(e => [e.id, e])).values()].map(e => ({ e, issue: executionTimeIssue(e, config.timetables) })).filter(x => x.issue);
                      return issues.length ? <p className="text-amber-800">Execution times: {issues.map(x => `${x.e.id} (${x.e.operation || '?'}, ${x.e.duration || '?'}) — ${x.issue}`).join(' ; ')}.</p> : null;
                    })()}
                    {['beyond_time_limit', 'no_eligible_route'].includes(o.reason) && withStock.length > 0 && !withStock.some(a => a.opening) && (
                      <p className="text-gray-700">The stock points with stock have opening hours in the next 7 days: look at the route timetables.</p>
                    )}
                    {o.reason === 'no_stock' && <p className="text-gray-700">Analysis above: {withStock.length} stock point(s) with stock, {deliverable.length} able to deliver this destination.</p>}
                    {(o.reason === 'no_eligible_route' || o.reason === 'missing_config') && (
                      <p className="text-gray-700">
                        Analysis above: {deliverable.length
                          ? `${deliverable.length} stock point(s) reach the destination through ${[...new Set(deliverable.flatMap(a => a.deliveringRoutes.map(carrierLabel)))].join(', ')} — so the routes exist: look at their constraints, timetables and the delivery configuration of "${o.delivery_method}".`
                          : 'no stock point with stock reaches the destination through the routes: see the reasons in the table above.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {extraKeys.map(k => (
            <details key={k} className="border border-gray-100 rounded-lg">
              <summary className="px-3 py-2 text-[11px] font-bold text-gray-600 cursor-pointer">Debug: {k}</summary>
              <pre className="px-3 pb-3 max-h-96 overflow-auto text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(result.body[k], null, 2)}</pre>
            </details>
          ))}
          <details className="border border-gray-100 rounded-lg">
            <summary className="px-3 py-2 text-[11px] font-bold text-gray-600 cursor-pointer">Full response</summary>
            <pre className="px-3 pb-3 max-h-96 overflow-auto text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(result.body, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default DeliveryPromisePanel;
