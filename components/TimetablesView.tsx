import React, { useEffect, useMemo, useState } from 'react';
import {
  DeliveryConfig, Timetable, fetchAllTimetables, timetableReport, timetableUsages, routeTimetableIds, TIMETABLE_TYPES,
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setList(await fetchAllTimetables(type || undefined)); } catch (err: any) { setError(err?.message || String(err)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [type, config.site]);

  const byId = useMemo(() => Object.fromEntries((list || []).map(t => [t.id, t])), [list]);
  const referenced = useMemo(() => [...new Set([...routeTimetableIds(config.routes), ...(config.executionTimes || []).map(e => e.timetable_id).filter(Boolean) as string[]])], [config]);
  const missing = list && !type ? referenced.filter(id => !byId[id]) : [];
  const q = search.trim().toLowerCase();
  const rows = (list || [])
    .filter(t => !q || `${t.id} ${t.name || ''} ${t.description || ''}`.toLowerCase().includes(q))
    .filter(t => !onlyUsed || referenced.includes(t.id));

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg">
          <option value="">All types</option>
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
          ⚠ {missing.length} timetable(s) referenced by routes / execution times are not returned by GET /timetables: {missing.map(id => `${id} (${timetableUsages(id, config).join(', ')})`).join(' ; ')}
        </p>
      )}
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
                    <tr className="align-top hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(isOpen ? null : t.id)}>
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
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{uses.length ? uses.map(u => <p key={u}>{u}</p>) : <span className="text-gray-300">—</span>}</td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={4} className="px-4 pb-3">
                        <p className="text-[11px] text-gray-600 mb-1">{rep.summary}</p>
                        {rep.exceptions.length > 0 && <div className="mb-2">{rep.exceptions.slice(0, 50).map((x, i) => <p key={i} className="text-[10px] text-gray-500">{x}</p>)}</div>}
                        <pre className="max-h-72 overflow-auto bg-gray-900 text-gray-100 p-3 rounded-lg text-[10px]">{JSON.stringify(t, null, 2)}</pre>
                      </td></tr>
                    )}
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
