import React, { useEffect, useState } from 'react';
import { onestockRequest, describeCallError, SITE_ID_VAR, TOKEN_VAR, useApiTarget } from '../services/onestockClient';
import { fetchSalesChannels, SalesChannelInfo } from '../services/salesChannelService';
import { settingsStore } from '../services/appStores';
import { savePayload, getLastProject } from '../services/payloadStore';
import { DeliveryConfig, EndpointAnalysis, carrierLabel } from '../services/deliveryRouteService';

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
  beyond_time_limit: { meaning: 'Cannot be fulfilled within a reasonable timeframe (stock point or carrier timetable).', check: 'Opening / pickup / delivery timetables of the routes and the stock points opening hours.' },
  no_eligible_route: { meaning: 'Every eligible route was discarded after applying the configured constraints.', check: 'Order / parcel constraints of the routes reaching the destination; routes from the zones of the stock points with stock.' },
  estimation_degraded_mode: { meaning: 'The stock repartitions exceed the computation limits.', check: 'Too many stock points / combinations: number of stock points with stock, maximum shipments.' },
  failed_parcel_constraints: { meaning: 'No route can handle the parcel.', check: 'Parcel constraints (weight, dimensions formulas) of the routes vs the item weight / dimensions.' },
  failed_parcel_contraints: { meaning: 'No route can handle the parcel.', check: 'Parcel constraints (weight, dimensions formulas) of the routes vs the item weight / dimensions.' },
  future_arrival_exceeds_limit: { meaning: 'The stock used arrives after the precalculation limit of the Delivery Promise module.', check: 'Future / in-transit stock ETA; precalculation limit of the module.' },
  invalid_item: { meaning: 'The item does not exist in OneStock.', check: 'Item id (PATCH /items); spelling of the item id.' },
  exceeds_authorized_shipment_number: { meaning: 'No promise within the configured maximum number of shipments.', check: 'Authorized shipment number; stock split over several stock points.' },
  missing_destination_timetable: { meaning: 'No destination timetable found to compute the ETA.', check: 'Delivery timetable of the routes reaching the destination.' },
};

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
    ...(debug ? { debug: { all: true } } : {}),
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
                {reason && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-1">
                    <p className="text-red-800"><strong>Why:</strong> {reason.meaning}</p>
                    <p className="text-red-800"><strong>Check:</strong> {reason.check}</p>
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
