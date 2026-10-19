import React, { useMemo, useState } from 'react';
import {
  deliveryConfigStore, loadDeliveryConfig, reloadTimetables, routeTimetableIds, matchZone, placeOfEndpoint, zoneSummary, carrierLabel, transitLabel,
  fetchItemStock, savedImportStock, analyseDelivery, nextOpenings, TIMETABLE_KINDS, timetableReport, routeTimetableIssues, transitIssue, feesIssue, feesLabel, executionTimeIssue, endpointExecutionTimes, durationMinutes, eventsForRoute, eventsForEndpoint, eventLabel, isClosing, VERDICT_LABELS, EndpointAnalysis, StockLine, Verdict, RouteEndpoint,
} from '../services/deliveryRouteService';
import { useApiTarget, missingTargetFields } from '../services/onestockClient';
import DeliveryRoutesGraph from './DeliveryRoutesGraph';
import DeliveryMap from './DeliveryMap';
import DeliveryPromisePanel from './DeliveryPromisePanel';
import TimetableWeek, { TIMETABLE_STATUS } from './TimetableWeek';
import TimetablesView from './TimetablesView';

const inputClass = 'px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#002D72]';
const card = 'bg-white rounded-2xl border border-gray-200 shadow-sm';
type View = 'routes' | 'zones' | 'execution' | 'timetables' | 'analysis';

// Delivery Promise configuration: delivery routes between zones, stock points of each zone, and who can deliver an
// article (stock per stock point × routes × destination).
const StepDeliveryRoutes: React.FC = () => {
  const config = deliveryConfigStore.use();
  const target = useApiTarget();
  const missing = missingTargetFields(target);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('routes');
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [ttLoading, setTtLoading] = useState(false);
  const readTimetables = async () => {
    if (!config) return;
    setTtLoading(true);
    setError(null);
    try { await reloadTimetables(config); } catch (err: any) { setError(err?.message || String(err)); } finally { setTtLoading(false); }
  };

  // Article analysis
  const [itemId, setItemId] = useState('');
  const [country, setCountry] = useState('FR');
  const [zip, setZip] = useState('');
  const [useLive, setUseLive] = useState(true);
  const [useSaved, setUseSaved] = useState(true);
  const [stock, setStock] = useState<StockLine[] | null>(null);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [analysedFor, setAnalysedFor] = useState<{ item: string; country: string; zip: string } | null>(null);

  const load = async () => {
    setError(null);
    try {
      await loadDeliveryConfig(setLoading);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(null);
    }
  };

  const zonesById = useMemo(() => new Map((config?.zones || []).map(z => [z.id, z])), [config]);
  // Stock points matching each zone.
  const zoneEndpoints = useMemo(() => {
    const map = new Map<string, RouteEndpoint[]>();
    if (!config) return map;
    config.zones.forEach(z => map.set(z.id, config.endpoints.filter(ep => matchZone(z, placeOfEndpoint(ep), zonesById).match)));
    return map;
  }, [config, zonesById]);
  const endpointCounts = useMemo(() => new Map([...zoneEndpoints.entries()].map(([k, v]) => [k, v.length])), [zoneEndpoints]);

  const analyse = async () => {
    if (!config || !itemId.trim()) return;
    setLoading('Reading the stock of the article…');
    setStockNotice(null);
    setError(null);
    const lines: StockLine[] = [];
    const notes: string[] = [];
    try {
      if (useLive) {
        try {
          const live = await fetchItemStock(itemId.trim());
          lines.push(...live);
          notes.push(`${live.length} stock line(s) from OneStock (GET /stocks)`);
        } catch (err: any) {
          notes.push(`GET /stocks failed: ${err?.message || err}`);
        }
      }
      if (useSaved) {
        const saved = savedImportStock(itemId.trim()).filter(s => !lines.some(l => l.endpoint_id === s.endpoint_id));
        lines.push(...saved);
        notes.push(`${saved.length} from the saved /stock_import payloads`);
      }
      setStock(lines);
      setStockNotice(notes.join(' · '));
      setAnalysedFor({ item: itemId.trim(), country: country.trim().toUpperCase(), zip: zip.trim() });
    } finally {
      setLoading(null);
    }
  };

  const analyses: EndpointAnalysis[] = useMemo(() => {
    if (!config || !stock || !analysedFor) return [];
    return analyseDelivery(config, stock, { country: analysedFor.country || undefined, zip: analysedFor.zip || undefined });
  }, [config, stock, analysedFor]);
  const withStock = analyses.filter(a => a.quantity > 0);
  const counts = analyses.reduce((m, a) => m.set(a.verdict, (m.get(a.verdict) || 0) + 1), new Map<Verdict, number>());
  const deliveringRouteIds = useMemo(() => new Set(withStock.flatMap(a => a.deliveringRoutes.map(r => r.id))), [withStock]);
  const order: Verdict[] = ['deliverable', 'destination-not-covered', 'no-route', 'no-origin-zone', 'no-stock'];
  const listed = (showAll ? analyses : withStock).sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict) || b.quantity - a.quantity);

  const route = config?.routes.find(r => r.id === selectedRoute);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-2xl font-bold text-[#002D72]">Delivery Routes</h2>
          <p className="text-sm text-gray-500 mt-1">
            Delivery routes (<span className="font-mono">/delivery_routes</span>) between zones (<span className="font-mono">/zones</span>),
            stock points (<span className="font-mono">/endpoints</span>) and who can deliver an article.
          </p>
          {config && (
            <p className="text-xs text-gray-400 mt-1">
              Site <strong>{config.site}</strong> · read {new Date(config.loadedAt).toLocaleString()} · {config.routes.length} route(s) · {config.zones.length} zone(s) · {config.endpoints.length} stock point(s)
              {config.site !== target.siteId && <span className="text-amber-600"> · another site is selected now: reload</span>}
            </p>
          )}
        </div>
        <button onClick={load} disabled={!!loading || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
          {loading || (config ? 'Reload from OneStock' : 'Load from OneStock')}
        </button>
      </div>
      {missing && <p className="text-sm text-amber-700">Missing in API Settings: {missing}</p>}
      {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}

      {config && (
        <>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {([['routes', `Routes (${config.routes.length})`], ['zones', `Zones (${config.zones.length})`], ['execution', `Execution times (${config.executionTimes?.length ?? 0})`], ['timetables', 'Timetables'], ['analysis', 'Article analysis']] as [View, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 text-xs font-bold rounded-lg ${view === v ? 'bg-white text-[#002D72] shadow-sm' : 'text-gray-500'}`}>{label}</button>
            ))}
          </div>

          {view === 'routes' && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
              <div className={`${card} p-5 min-w-0`}>
                <DeliveryRoutesGraph routes={config.routes} zones={config.zones} endpointCounts={endpointCounts} selectedId={selectedRoute} onSelect={setSelectedRoute} />
                <div className="mt-6 overflow-x-auto">
                  {(() => {
                    const ids = routeTimetableIds(config.routes);
                    const found = ids.filter(id => config.timetables?.[id]).length;
                    return (
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Route timetables (GET /timetable_versions)</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${found === ids.length ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{found} / {ids.length} read</span>
                        <button onClick={readTimetables} disabled={ttLoading} className="text-[11px] font-bold text-[#002D72] underline disabled:opacity-40">{ttLoading ? 'Reading…' : 'Read the timetables again'}</button>
                        {found < ids.length && <span className="text-[10px] text-gray-400">missing: {ids.filter(id => !config.timetables?.[id]).slice(0, 8).join(', ')} — see API Logs for the calls</span>}
                      </div>
                    );
                  })()}
                  <table className="text-[11px]">
                    <thead><tr className="text-left text-gray-400"><th className="pr-3">Route</th><th className="pr-3">Transit</th><th className="pr-3">Fees</th>{TIMETABLE_KINDS.map(k => <th key={k.key} className="pr-3">{k.label}</th>)}</tr></thead>
                    <tbody>
                      {config.routes.map(r => (
                        <tr key={r.id} onClick={() => setSelectedRoute(r.id)} className={`cursor-pointer border-t border-gray-50 ${selectedRoute === r.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="pr-3 py-1.5"><p className="font-bold text-gray-800">{r.id}</p><p className="text-gray-400">{carrierLabel(r)}</p></td>
                          <td className="pr-3 py-1.5" title={transitIssue(r) || 'min – max transit hours'}>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${transitIssue(r) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{transitLabel(r) || 'not set'}</span>
                            {transitIssue(r) && <p className="text-[9px] text-red-600 mt-0.5 max-w-[120px]">⚠ {transitIssue(r)}</p>}
                          </td>
                          <td className="pr-3 py-1.5" title={feesIssue(r) || feesLabel(r)}>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${feesIssue(r) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{feesLabel(r) || 'not set'}</span>
                            {feesIssue(r) && <p className="text-[9px] text-red-600 mt-0.5 max-w-[140px]">⚠ {feesIssue(r)}</p>}
                          </td>
                          {TIMETABLE_KINDS.map(k => {
                            const rep = timetableReport(r[k.key], config.timetables);
                            return (
                              <td key={k.key} className="pr-3 py-1.5" title={rep.summary}>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TIMETABLE_STATUS[rep.status].cls}`}>{TIMETABLE_STATUS[rep.status].label}{rep.hoursPerWeek ? ` · ${rep.hoursPerWeek} h` : ''}</span>
                                {(rep.status === 'ok' || rep.status === 'partial') && <TimetableWeek report={rep} width={168} />}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={`${card} p-5 text-xs space-y-3 xl:sticky xl:top-4`}>
                {!route ? <p className="text-gray-400">Click a route to see its detail.</p> : (
                  <>
                    <p className="text-sm font-bold text-gray-900 break-all">{route.id}</p>
                    <p><strong>{route.origin_zone_id}</strong> → <strong>{route.destination_zone_id}</strong></p>
                    <p>Carrier: <strong>{carrierLabel(route)}</strong>{transitLabel(route) && <> · transit <strong>{transitLabel(route)}</strong></>}</p>
                    <p>Transit time: min <strong>{route.minimum_transit_hours ?? '—'} h</strong> · max <strong>{route.maximum_transit_hours ?? '—'} h</strong>
                      {transitIssue(route) && <span className="ml-2 text-red-600 font-bold">⚠ {transitIssue(route)}</span>}</p>
                    {eventsForRoute(route, config.scheduledEvents).length > 0 && (
                      <div>{eventsForRoute(route, config.scheduledEvents).map(e => <p key={e.id} className={isClosing(e) ? 'text-red-600 font-bold' : 'text-amber-700'}>📅 {eventLabel(e)}</p>)}</div>
                    )}
                    <p>Delivery fees (metric_values): <strong>{feesLabel(route) || 'not set'}</strong>
                      {feesIssue(route) && <span className="ml-2 text-red-600 font-bold">⚠ {feesIssue(route)}</span>}</p>
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <p className="font-bold text-gray-500">Timetables</p>
                      {TIMETABLE_KINDS.map(k => {
                        const rep = timetableReport(route[k.key], config.timetables);
                        return (
                          <div key={k.key}>
                            <p className="flex items-center gap-2">
                              <span className="text-gray-600">{k.label}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TIMETABLE_STATUS[rep.status].cls}`}>{TIMETABLE_STATUS[rep.status].label}</span>
                              {route[k.key] && <span className="font-mono text-gray-400 truncate">{route[k.key]}</span>}
                            </p>
                            {rep.status !== 'not-set' && rep.status !== 'not-found' && <TimetableWeek report={rep} width={250} />}
                            <p className="text-[10px] text-gray-500">{rep.summary}</p>
                            {route[k.key] && config.timetables?.[route[k.key]!] && (
                              <details><summary className="text-[10px] text-gray-400 cursor-pointer">timetable JSON ({config.timetables[route[k.key]!].source || '?'}{config.timetables[route[k.key]!].versionsCount ? `, ${config.timetables[route[k.key]!].versionsCount} version(s)` : ''})</summary>
                                <pre className="max-h-48 overflow-auto bg-gray-900 text-gray-100 p-2 rounded text-[10px]">{JSON.stringify(config.timetables[route[k.key]!], null, 2)}</pre></details>
                            )}
                            {rep.exceptions.length > 0 && (
                              <details><summary className="text-[10px] text-gray-400 cursor-pointer">{rep.exceptions.length} dated span(s)</summary>
                                {rep.exceptions.slice(0, 30).map((x, i) => <p key={i} className="text-[10px] text-gray-500">{x}</p>)}</details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {route.constraints?.order_constraints?.length ? (
                      <div><p className="font-bold text-gray-500">Order constraints</p>{route.constraints.order_constraints.map((c, i) => <p key={i} className="font-mono">{c.name} {c.op} {JSON.stringify(c.value)}</p>)}</div>
                    ) : null}
                    {route.constraints?.parcel_constraints?.length ? (
                      <div><p className="font-bold text-gray-500">Parcel constraints</p>{route.constraints.parcel_constraints.map((c, i) => <p key={i} className="font-mono">{c.formula} {c.op} {JSON.stringify(c.value)}</p>)}</div>
                    ) : null}
                    {[route.origin_zone_id, route.destination_zone_id].map((zid, i) => {
                      const z = zonesById.get(zid || '');
                      return (
                        <div key={i} className="pt-2 border-t border-gray-100">
                          <p className="font-bold text-gray-500">{i === 0 ? 'Origin' : 'Destination'} zone {zid}</p>
                          <p className="text-gray-600">{z ? zoneSummary(z) : <span className="text-red-600">unknown zone</span>}</p>
                          {i === 0 && <p className="text-gray-400">{endpointCounts.get(zid || '') ?? 0} stock point(s) in this zone</p>}
                        </div>
                      );
                    })}
                    <details><summary className="cursor-pointer text-gray-400">JSON</summary><pre className="mt-2 max-h-64 overflow-auto bg-gray-900 text-gray-100 p-2 rounded text-[10px]">{JSON.stringify(route, null, 2)}</pre></details>
                  </>
                )}
              </div>
            </div>
          )}

          {view === 'zones' && (
            <div className={`${card} overflow-hidden`}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-widest text-gray-400">
                  <tr><th className="px-4 py-3">Zone</th><th className="px-4 py-3">Criteria</th><th className="px-4 py-3">Stock points</th><th className="px-4 py-3">Routes from / to</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {config.zones.map(z => {
                    const eps = zoneEndpoints.get(z.id) || [];
                    const from = config.routes.filter(r => r.origin_zone_id === z.id).length;
                    const to = config.routes.filter(r => r.destination_zone_id === z.id).length;
                    return (
                      <React.Fragment key={z.id}>
                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpenZone(openZone === z.id ? null : z.id)}>
                          <td className="px-4 py-2.5"><p className="font-bold text-gray-900">{z.name || z.id}</p><p className="font-mono text-gray-400">{z.id}</p></td>
                          <td className="px-4 py-2.5 text-gray-600">{zoneSummary(z)}</td>
                          <td className="px-4 py-2.5">{eps.length}</td>
                          <td className="px-4 py-2.5">{from} / {to}{from + to === 0 && <span className="ml-2 text-amber-600">unused</span>}</td>
                        </tr>
                        {openZone === z.id && (
                          <tr><td colSpan={4} className="px-4 pb-3 text-gray-600">
                            {eps.length ? eps.slice(0, 200).map(e => <span key={e.id} className="inline-block mr-2 mb-1 px-2 py-0.5 bg-gray-100 rounded">{e.name || e.id} <span className="font-mono text-gray-400">{e.id}</span></span>) : 'No stock point in this zone.'}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {view === 'execution' && (
            <div className={`${card} overflow-x-auto`}>
              {config.executionTimes === undefined ? <p className="p-6 text-sm text-gray-400">Reload from OneStock to read the execution times.</p>
                : config.executionTimes.length === 0 ? <p className="p-6 text-sm text-gray-400">No execution time returned by GET /execution_times.</p> : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-widest text-gray-400">
                    <tr><th className="px-4 py-3">Execution time</th><th className="px-4 py-3">Operation</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Moment</th><th className="px-4 py-3">Timetable</th><th className="px-4 py-3">Stock points</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {config.executionTimes.map(et => {
                      const rep = timetableReport(et.timetable_id, config.timetables);
                      const issue = executionTimeIssue(et, config.timetables);
                      const users = config.endpoints.filter(ep => endpointExecutionTimes(ep, config.executionTimes).some(x => x.id === et.id));
                      const min = durationMinutes(et.duration);
                      return (
                        <tr key={et.id} className="align-top">
                          <td className="px-4 py-2.5"><p className="font-bold text-gray-900">{et.name || et.id}</p><p className="font-mono text-gray-400">{et.id}</p>
                            {et.used_options?.length ? <p className="text-gray-400">options: {et.used_options.join(', ')}</p> : null}
                            {issue && <p className="text-red-600 font-bold mt-1">⚠ {issue}</p>}</td>
                          <td className="px-4 py-2.5 font-mono">{et.operation || '—'}</td>
                          <td className="px-4 py-2.5"><span className="font-mono">{et.duration || '—'}</span>{min !== null && <p className="text-gray-400">{min >= 60 ? `${Math.round(min / 6) / 10} h` : `${min} min`}</p>}</td>
                          <td className="px-4 py-2.5 font-mono text-gray-600">{et.execution_moment || '—'}</td>
                          <td className="px-4 py-2.5" title={rep.summary}>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TIMETABLE_STATUS[rep.status].cls}`}>{TIMETABLE_STATUS[rep.status].label}{rep.hoursPerWeek ? ` · ${rep.hoursPerWeek} h` : ''}</span>
                            {et.timetable_id && <span className="ml-1 font-mono text-gray-400">{et.timetable_id}</span>}
                            {(rep.status === 'ok' || rep.status === 'partial') && <TimetableWeek report={rep} width={210} />}
                            {rep.exceptions.length > 0 && <p className="text-[10px] text-gray-400">{rep.exceptions.length} dated span(s)</p>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{users.length ? users.slice(0, 8).map(u => u.name || u.id).join(', ') + (users.length > 8 ? ` +${users.length - 8}` : '') : <span className="text-gray-300">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {view === 'timetables' && <TimetablesView config={config} />}

          {view === 'analysis' && (
            <div className="space-y-4">
              <div className={`${card} p-5 flex flex-wrap items-end gap-3`}>
                <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Article (item id)</span>
                  <input value={itemId} onChange={e => setItemId(e.target.value)} onKeyDown={e => e.key === 'Enter' && analyse()} placeholder="SKU" className={inputClass + ' font-mono w-56'} /></label>
                <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Destination country</span>
                  <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="FR" className={inputClass + ' w-24 font-mono'} /></label>
                <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Zip code</span>
                  <input value={zip} onChange={e => setZip(e.target.value)} placeholder="75001" className={inputClass + ' w-28 font-mono'} /></label>
                <div className="flex flex-col gap-1 text-xs text-gray-600">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useLive} onChange={e => setUseLive(e.target.checked)} />Stock from OneStock (GET /stocks)</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useSaved} onChange={e => setUseSaved(e.target.checked)} />Saved /stock_import payloads</label>
                </div>
                <button onClick={analyse} disabled={!itemId.trim() || !!loading} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">Analyse</button>
              </div>

              {analysedFor && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-700"><strong className="font-mono">{analysedFor.item}</strong> → {analysedFor.country || 'any country'}{analysedFor.zip ? ` ${analysedFor.zip}` : ''}:</span>
                    {order.filter(v => counts.get(v)).map(v => (
                      <span key={v} className="text-[11px] font-bold px-2 py-1 rounded-md text-white" style={{ background: VERDICT_LABELS[v].color }}>{counts.get(v)} {VERDICT_LABELS[v].label}</span>
                    ))}
                    {stockNotice && <span className="w-full text-[11px] text-gray-400">{stockNotice}</span>}
                  </div>
                  {withStock.some(a => a.opening) && (
                    <p className={`${card} p-4 text-sm text-amber-800`}>
                      ⚠ {withStock.filter(a => a.opening).length} stock point(s) with stock have an opening hours problem
                      ({withStock.filter(a => a.opening).slice(0, 5).map(a => `${(a.endpoint as RouteEndpoint).name || a.endpoint.id}: ${a.opening}`).join(' ; ')}):
                      the promise may fail (beyond_time_limit / no_eligible_route) even when the routes exist.
                    </p>
                  )}
                  {withStock.length === 0 ? (
                    <p className={`${card} p-6 text-sm text-red-700`}>No stock found for this article: no stock point can deliver it.</p>
                  ) : counts.get('deliverable') ? null : (
                    <p className={`${card} p-4 text-sm text-red-700`}>None of the {withStock.length} stock point(s) with stock can deliver this destination: see the reasons below.</p>
                  )}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0">
                    <div className={`${card} p-3`}><DeliveryMap analyses={analyses} /></div>
                    <div className={`${card} p-4 min-w-0`}>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Routes usable from the stock (highlighted: reach the destination)</p>
                      <DeliveryRoutesGraph routes={config.routes.filter(r => withStock.some(a => a.routes.some(x => x.id === r.id)))} zones={config.zones} highlight={deliveringRouteIds} />
                    </div>
                  </div>
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-4 py-2 flex items-center bg-gray-50 border-b border-gray-200">
                      <span className="flex-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stock points</span>
                      <label className="flex items-center gap-2 text-[11px] text-gray-600"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show stock points without stock</label>
                    </div>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-100">
                        {listed.slice(0, 500).map(a => (
                          <tr key={a.endpoint.id}>
                            <td className="px-4 py-2 w-56"><p className="font-bold text-gray-900">{(a.endpoint as RouteEndpoint).name || a.endpoint.id}</p><p className="font-mono text-gray-400">{a.endpoint.id}</p></td>
                            <td className="px-2 py-2 w-16 text-right font-mono">{a.quantity}</td>
                            <td className="px-4 py-2 w-48"><span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ background: VERDICT_LABELS[a.verdict].color }}>{VERDICT_LABELS[a.verdict].label}</span></td>
                            <td className="px-4 py-2 text-gray-600">
                              {a.explanation}
                              {a.opening && a.quantity > 0 && <p className="text-amber-700 font-bold">⚠ Opening hours: {a.opening}</p>}
                              {a.quantity > 0 && endpointExecutionTimes(a.endpoint as RouteEndpoint, config.executionTimes).map(et => ({ et, issue: executionTimeIssue(et, config.timetables) })).filter(x => x.issue).map(x => (
                                <p key={`e-${x.et.id}`} className="text-amber-700">⚠ Execution time {x.et.id} ({x.et.operation}): {x.issue}</p>
                              ))}
                              {a.quantity > 0 && eventsForEndpoint(a.endpoint.id, config.scheduledEvents).filter(isClosing).map(e => (
                                <p key={`ev-${e.id}`} className="text-red-600">📅 Stock point closed: {eventLabel(e)}</p>
                              ))}
                              {a.quantity > 0 && (a.deliveringRoutes.length ? a.deliveringRoutes : a.routes).flatMap(r => eventsForRoute(r, config.scheduledEvents).filter(isClosing).map(e => ({ r, e }))).map(({ r, e }) => (
                                <p key={`rev-${r.id}-${e.id}`} className="text-red-600">📅 Route {r.id} closed: {eventLabel(e)}</p>
                              ))}
                              {a.quantity > 0 && (a.deliveringRoutes.length ? a.deliveringRoutes : a.routes).filter(r => feesIssue(r)).map(r => (
                                <p key={`f-${r.id}`} className="text-red-600">⚠ Route {r.id} fees: {feesIssue(r)}</p>
                              ))}
                              {a.quantity > 0 && (a.deliveringRoutes.length ? a.deliveringRoutes : a.routes).filter(r => transitIssue(r)).map(r => (
                                <p key={`t-${r.id}`} className="text-red-600">⚠ Route {r.id} transit: {transitIssue(r)}</p>
                              ))}
                              {a.quantity > 0 && (a.deliveringRoutes.length ? a.deliveringRoutes : a.routes).map(r => ({ r, issue: routeTimetableIssues(r, config.timetables) })).filter(x => x.issue).map(x => (
                                <p key={x.r.id} className="text-amber-700">⚠ Route {x.r.id} timetables: {x.issue}</p>
                              ))}
                              {!a.opening && a.quantity > 0 && nextOpenings(a.endpoint as RouteEndpoint) && <p className="text-gray-400">Opens: {nextOpenings(a.endpoint as RouteEndpoint)}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Zone matching is an approximation of the OneStock rules (countries, regions, zip regex, timezones, included / excluded
                    stock points and zones). Other rules (sales channel, delivery method, timetables, order / parcel constraints, stock
                    reservations) are not evaluated yet.
                  </p>
                </>
              )}

              <DeliveryPromisePanel
                config={config}
                itemId={itemId.trim()}
                country={country.trim().toUpperCase()}
                zip={zip.trim()}
                analyses={analysedFor && analysedFor.item === itemId.trim() ? analyses : []}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StepDeliveryRoutes;
