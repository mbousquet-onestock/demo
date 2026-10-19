import React, { useEffect, useMemo, useState } from 'react';
import {
  DeliveryConfig, Timetable, fetchAllTimetables, fetchTimetableDetail, timetableReport,
  reloadScheduledEvents, eventsForTimetable, eventLabel, isClosing, isActiveNow, ScheduledEvent, timetableUsages, routeTimetableIds, TIMETABLE_TYPES,
} from '../services/deliveryRouteService';
import TimetableWeek, { TIMETABLE_STATUS } from './TimetableWeek';

// Every timetable of the site (GET /timetables): type, timezone, weekly spans, dated spans, where it is used.
const TimetablesView: React.FC<{ config: DeliveryConfig }> = ({ config }) => {
  const [list, setList] = useState<Timetable[] | null>(null);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyUsed, setOnlyUsed] = useState(false);
  // Detail of the opened timetables (GET /timetables/{id}).
  const [details, setDetails] = useState<Record<string, Timetable | { error: string } | 'loading'>>({});
  const openRow = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setDetails(d => ({ ...d, [id]: 'loading' }));
    try {
      const t = await fetchTimetableDetail(id);
      setDetails(d => ({ ...d, [id]: t }));
    } catch (err: any) {
      setDetails(d => ({ ...d, [id]: { error: err?.message || String(err) } }));
    }
  };

  // Scheduled events (GET /scheduledevents) of the chosen period.
  const [days, setDays] = useState(60);
  const [evLoading, setEvLoading] = useState(false);
  const loadEvents = async (d = days) => {
    setEvLoading(true);
    setError(null);
    const now = Math.floor(Date.now() / 1000);
    try { await reloadScheduledEvents(config, now - 86400, now + d * 86400); } catch (err: any) { setError(err?.message || String(err)); } finally { setEvLoading(false); }
  };
  const events = config.scheduledEvents;

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setList(await fetchAllTimetables(type || undefined)); } catch (err: any) { setError(err?.message || String(err)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [type, config.site]);

  // The detail (GET /timetables/{id}) replaces the list entry once read.
  const byId = useMemo(() => Object.fromEntries((list || []).map(t => {
    const d = details[t.id];
    return [t.id, d && typeof d === 'object' && !('error' in d) ? d as Timetable : t];
  })), [list, details]);
  const referenced = useMemo(() => [...new Set([...routeTimetableIds(config.routes), ...(config.executionTimes || []).map(e => e.timetable_id).filter(Boolean) as string[]])], [config]);
  // Referenced carrier timetables (routes) not returned by the list.
  const routeRefs = useMemo(() => routeTimetableIds(config.routes), [config]);
  const missing = list && !type ? routeRefs.filter(id => !byId[id]) : [];
  const q = search.trim().toLowerCase();
  const rows = (list || [])
    .filter(t => !q || `${t.id} ${t.name || ''} ${t.description || ''}`.toLowerCase().includes(q))
    .filter(t => !onlyUsed || referenced.includes(t.id));

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg">
          <option value="">All carrier timetables</option>
          {TIMETABLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search id / name…" className="flex-1 min-w-[180px] px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg" />
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={onlyUsed} onChange={e => setOnlyUsed(e.target.checked)} />Used by routes / execution times</label>
        <button onClick={load} disabled={loading} className="px-3 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg disabled:opacity-40">{loading ? 'Reading…' : 'Reload GET /timetables'}</button>
        {list && <span className="w-full text-[11px] text-gray-500">{list.length} timetable(s){type ? ` of type ${type}` : ''} · {rows.length} shown</span>}
      </div>
      {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
      {missing.length > 0 && (
        <p className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          ⚠ {missing.length} route timetable(s) not returned among the carrier timetables (GET /timetables): {missing.map(id => `${id} (${timetableUsages(id, config).join(', ')})`).join(' ; ')}
        </p>
      )}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scheduled events (GET /scheduledevents){events ? ` · ${events.length}` : ''}</p>
          <select value={days} onChange={e => { const d = Number(e.target.value); setDays(d); loadEvents(d); }} className="px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg">
            {[7, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>next {d} days</option>)}
          </select>
          <button onClick={() => loadEvents()} disabled={evLoading} className="px-3 py-1.5 text-xs font-bold text-[#002D72] border border-[#002D72]/30 rounded-lg disabled:opacity-40">{evLoading ? 'Reading…' : 'Reload events'}</button>
        </div>
        {events === undefined ? <p className="text-xs text-gray-400">Reload the configuration (or the events) to read them.</p>
          : events.length === 0 ? <p className="text-xs text-gray-400">No scheduled event in the period.</p> : (
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-gray-400"><th>Event</th><th>Period</th><th>Timetables</th><th>Applies to</th><th>Options</th></tr></thead>
              <tbody>
                {[...events].sort((a, b) => (a.start || 0) - (b.start || 0)).map((e: ScheduledEvent) => (
                  <tr key={e.id} className="border-t border-gray-50 align-top">
                    <td className="py-1.5 pr-2"><p className="font-bold text-gray-800">{e.name || e.id}</p><p className="text-gray-400">{e.type}</p></td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{eventLabel(e).split(') ')[1]?.split(' · ')[0]}{isActiveNow(e) && <span className="ml-1 text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-700">NOW</span>}<p className="text-gray-400">{e.timezone}</p></td>
                    <td className="py-1.5 pr-2 font-mono text-gray-500">{(e.timetable_types || ['all']).map(t => t.replace('_timetable', '')).join(', ')}</td>
                    <td className="py-1.5 pr-2 text-gray-600">{e.links && Object.entries(e.links).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => <p key={k}><span className="text-gray-400">{k}:</span> {(v as string[]).slice(0, 6).join(', ')}{(v as string[]).length > 6 ? ` +${(v as string[]).length - 6}` : ''}</p>)}
                      {!e.links || !Object.values(e.links).some(v => Array.isArray(v) && v.length) ? <span className="text-gray-400">whole site</span> : null}</td>
                    <td className="py-1.5">{e.options && Object.entries(e.options).map(([k, v]) => <span key={k} className={`inline-block mr-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${k === 'open' && v === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{k}: {String(v)}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {list && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-widest text-gray-400">
              <tr><th className="px-4 py-3">Timetable</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Week</th><th className="px-4 py-3">Used by</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No timetable.</td></tr>}
              {rows.map(t => {
                const rep = timetableReport(t.id, byId);
                const uses = timetableUsages(t.id, config);
                const isOpen = open === t.id;
                return (
                  <React.Fragment key={t.id}>
                    <tr className="align-top hover:bg-gray-50 cursor-pointer" onClick={() => openRow(t.id)}>
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-gray-900">{t.name || t.id}</p>
                        <p className="font-mono text-gray-400">{t.id}</p>
                        {t.description && <p className="text-gray-500">{t.description}</p>}
                      </td>
                      <td className="px-4 py-2.5"><p className="font-mono text-gray-700">{t.type || '—'}</p><p className="text-gray-400">{t.hours?.timezone || ''}</p></td>
                      <td className="px-4 py-2.5" title={rep.summary}>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TIMETABLE_STATUS[rep.status].cls}`}>{TIMETABLE_STATUS[rep.status].label}{rep.hoursPerWeek ? ` · ${rep.hoursPerWeek} h` : ''}</span>
                        {(rep.status === 'ok' || rep.status === 'partial') && <TimetableWeek report={rep} width={230} />}
                        {rep.exceptions.length > 0 && <p className="text-[10px] text-gray-400">{rep.exceptions.length} dated span(s)</p>}
                        {rep.status === 'empty' && <p className="text-[10px] text-red-600 max-w-[260px]">{rep.summary}</p>}
                        {(() => {
                          const ev = eventsForTimetable(t, config);
                          return ev.length ? <p className={`text-[10px] font-bold ${ev.some(isClosing) ? 'text-red-600' : 'text-amber-700'}`}>{ev.length} scheduled event(s){ev.some(isClosing) ? ' · closing' : ''}</p> : null;
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{uses.length ? uses.map(u => <p key={u}>{u}</p>) : <span className="text-gray-300">—</span>}</td>
                    </tr>
                    {isOpen && (() => {
                      const d = details[t.id];
                      return (
                        <tr><td colSpan={4} className="px-4 pb-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Detail · GET /timetables/{t.id}</p>
                          {d === 'loading' && <p className="text-[11px] text-gray-400">Reading…</p>}
                          {d && typeof d === 'object' && 'error' in d && <p className="text-[11px] text-red-600 break-words">{(d as { error: string }).error}</p>}
                          {d && typeof d === 'object' && !('error' in d) && (
                            <>
                              <p className="text-[11px] text-gray-600 mb-1">{rep.summary}</p>
                              {eventsForTimetable(t, config).map(e => <p key={e.id} className={`text-[11px] ${isClosing(e) ? 'text-red-600 font-bold' : 'text-amber-700'}`}>📅 {eventLabel(e)}</p>)}
                              {rep.exceptions.length > 0 && <div className="mb-2">{rep.exceptions.slice(0, 50).map((x, i) => <p key={i} className="text-[10px] text-gray-500">{x}</p>)}</div>}
                              <pre className="max-h-72 overflow-auto bg-gray-900 text-gray-100 p-3 rounded-lg text-[10px]">{JSON.stringify(d, null, 2)}</pre>
                            </>
                          )}
                        </td></tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TimetablesView;
