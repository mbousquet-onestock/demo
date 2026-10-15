import React, { useMemo, useRef, useState } from 'react';
import { savedPayloadsStore } from '../services/payloadStore';
import { stockPointSetsStore, orderBatchesStore, manualStepsStore } from '../services/appStores';
import { useApiTarget, missingTargetFields, isProductionTarget } from '../services/onestockClient';
import {
  savedPayloadItems, stockPointSetItems, orderBatchItems, replayItem, ReplayItem, ReplayResult,
} from '../services/replayService';

const NO_PROJECT = '__none__';
const keyOf = (project?: string) => (project || '').trim() || NO_PROJECT;
const titleOf = (key: string) => (key === NO_PROJECT ? 'No project' : key);

const methodColor = (m: string) =>
  m === 'GET' ? 'text-emerald-700 bg-emerald-50' : m === 'POST' ? 'text-blue-700 bg-blue-50' : m === 'PATCH' ? 'text-orange-700 bg-orange-50' : 'text-gray-700 bg-gray-100';

const statusBadge = (status: number | null | undefined, ok?: boolean, title?: string) => {
  if (status === undefined) return null;
  const good = ok ?? (status !== null && status < 300);
  return <span title={title} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${good ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{status ?? 'ERR'}</span>;
};

// Projects overview: every saved payload / stock point set / order batch / manual step of a project, with unit or
// mass replay of the API calls.
const StepProjects: React.FC = () => {
  const payloads = savedPayloadsStore.use();
  const sets = stockPointSetsStore.use();
  const batches = orderBatchesStore.use();
  const steps = manualStepsStore.use();
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);

  const projects = useMemo(() => {
    const map = new Map<string, { payloads: number; sets: number; points: number; batches: number; orders: number; steps: number; stepsDone: number; updated: string }>();
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, { payloads: 0, sets: 0, points: 0, batches: 0, orders: 0, steps: 0, stepsDone: 0, updated: '' });
      return map.get(k)!;
    };
    const touch = (e: { updated: string }, date?: string) => { if (date && date > e.updated) e.updated = date; };
    payloads.forEach(p => { const e = get(keyOf(p.project)); e.payloads++; touch(e, p.createdAt); });
    sets.forEach(s => { const e = get(keyOf(s.project)); e.sets++; e.points += s.endpoints.length; touch(e, s.updatedAt); });
    batches.forEach(b => { const e = get(keyOf(b.project)); e.batches++; e.orders += b.packages.reduce((n, p) => n + p.subOrders.length, 0); touch(e, b.updatedAt); });
    steps.forEach(s => { const e = get(keyOf(s.project)); e.steps++; if (s.status === 'done') e.stepsDone++; touch(e, s.updatedAt); });
    return [...map.entries()].sort(([a], [b]) => (a === NO_PROJECT ? 1 : b === NO_PROJECT ? -1 : a.localeCompare(b)));
  }, [payloads, sets, batches, steps]);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const current = selectedProject && projects.some(([k]) => k === selectedProject) ? selectedProject : projects[0]?.[0] || null;
  const [projectSearch, setProjectSearch] = useState('');

  const items = useMemo<ReplayItem[]>(() => {
    if (!current) return [];
    const inProject = <T extends { project?: string }>(list: T[]) => list.filter(x => keyOf(x.project) === current);
    return [
      ...savedPayloadItems(inProject(payloads)),
      ...stockPointSetItems(inProject(sets)),
      ...orderBatchItems(inProject(batches)),
    ];
  }, [current, payloads, sets, batches]);

  const projectSteps = steps.filter(s => keyOf(s.project) === current).sort((a, b) => a.order - b.order);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, ReplayResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const stopRef = useRef(false);

  const q = search.trim().toLowerCase();
  const visible = items.filter(i => !q || i.label.toLowerCase().includes(q) || i.path.toLowerCase().includes(q) || i.method.toLowerCase().includes(q));
  const groups = useMemo(() => {
    const map = new Map<string, ReplayItem[]>();
    visible.forEach(i => map.set(i.group, [...(map.get(i.group) || []), i]));
    return [...map.entries()];
  }, [visible]);

  const selectProject = (k: string) => {
    setSelectedProject(k);
    setSelected(new Set());
    setOpenKey(null);
    setSearch('');
  };

  const toggle = (keys: string[], on: boolean) => setSelected(prev => {
    const next = new Set(prev);
    keys.forEach(k => (on ? next.add(k) : next.delete(k)));
    return next;
  });

  const confirmProd = (count: number, writes: boolean) =>
    !writes || !isProductionTarget(target)
    || window.confirm(`Replay ${count} call(s) on ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`);

  const runOne = async (item: ReplayItem) => {
    if (targetMissing || !confirmProd(1, item.method !== 'GET')) return;
    setRunning(item.key);
    const r = await replayItem(item);
    setResults(prev => ({ ...prev, [item.key]: r }));
    setRunning(null);
  };

  const runSelected = async () => {
    const list = items.filter(i => selected.has(i.key)).map((i, idx) => ({ i, idx }))
      .sort((a, b) => a.i.priority - b.i.priority || a.idx - b.idx).map(x => x.i);
    if (list.length === 0 || targetMissing || !confirmProd(list.length, list.some(i => i.method !== 'GET'))) return;
    stopRef.current = false;
    for (const [n, item] of list.entries()) {
      if (stopRef.current) break;
      setRunning(`${n + 1} / ${list.length}`);
      const r = await replayItem(item);
      setResults(prev => ({ ...prev, [item.key]: r }));
    }
    setRunning(null);
  };

  const replayed = items.filter(i => results[i.key]);
  const okCount = replayed.filter(i => results[i.key].ok).length;
  const stats = projects.find(([k]) => k === current)?.[1];
  const filteredProjects = projects.filter(([k]) => !projectSearch.trim() || titleOf(k).toLowerCase().includes(projectSearch.trim().toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div>
        <h2 className="text-2xl font-bold text-[#002D72]">Projects</h2>
        <p className="text-sm text-gray-500 mt-1">Everything saved per project, and replay of the API calls one by one or in bulk.</p>
      </div>

      {projects.length === 0 ? (
        <p className="p-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          No project yet: save payloads, stock points, order batches or manual steps with a project name.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* Project list */}
          <aside className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden lg:sticky lg:top-4">
            <div className="p-3 border-b border-gray-100">
              <input value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Search projects…" className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
            </div>
            <ul className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {filteredProjects.map(([k, s]) => (
                <li key={k}>
                  <button onClick={() => selectProject(k)} className={`w-full text-left px-4 py-3 hover:bg-blue-50/50 ${k === current ? 'bg-blue-50 border-l-4 border-[#002D72]' : 'border-l-4 border-transparent'}`}>
                    <p className={`text-sm font-bold ${k === NO_PROJECT ? 'text-gray-500 italic' : 'text-gray-900'}`}>{titleOf(k)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {[s.payloads && `${s.payloads} payload(s)`, s.sets && `${s.points} stock point(s)`, s.batches && `${s.orders} order(s)`, s.steps && `${s.stepsDone}/${s.steps} step(s)`].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Project detail */}
          {current && stats && (
            <div className="space-y-4 min-w-0">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-xl font-bold text-gray-900">{titleOf(current)}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  {[
                    ['Saved payloads', stats.payloads],
                    ['Stock points', `${stats.points}`, `${stats.sets} set(s)`],
                    ['Orders', `${stats.orders}`, `${stats.batches} batch(es)`],
                    ['Manual steps', `${stats.stepsDone} / ${stats.steps}`, 'done'],
                  ].map(([label, value, sub]) => (
                    <div key={String(label)} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
                      <p className="text-xl font-bold text-[#002D72] mt-1">{value}</p>
                      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
                    </div>
                  ))}
                </div>
                {projectSteps.some(s => s.status !== 'done') && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Open manual steps</p>
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {projectSteps.filter(s => s.status !== 'done').slice(0, 6).map(s => (
                        <li key={s.id}>• {s.title}{s.status === 'in_progress' && <span className="text-amber-600"> (in progress)</span>}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Replay toolbar */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-2 sticky top-0 z-10">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && visible.every(i => selected.has(i.key))}
                    onChange={e => toggle(visible.map(i => i.key), e.target.checked)}
                  />
                  All ({visible.length})
                </label>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter calls…" className="flex-1 min-w-[160px] px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                {running ? (
                  <button onClick={() => { stopRef.current = true; }} className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Stop ({running})</button>
                ) : (
                  <button onClick={runSelected} disabled={selected.size === 0 || !!targetMissing} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                    Replay selected ({selected.size})
                  </button>
                )}
                {replayed.length > 0 && !running && (
                  <button onClick={() => setResults({})} className="px-3 py-2 text-xs font-bold text-gray-500">Clear results</button>
                )}
                <span className="w-full text-[11px] text-gray-500">
                  {replayed.length > 0 && <><strong>{okCount}</strong> OK · <strong>{replayed.length - okCount}</strong> failed in this session · </>}
                  {targetMissing ? <span className="text-red-600">Missing in API Settings: {targetMissing}</span> : <>target <strong>{target.siteId}</strong> · {target.baseUrl}</>}
                  {' '}· parent orders are always replayed before their orders.
                </span>
              </div>

              {groups.length === 0 ? (
                <p className="p-10 text-center text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">No replayable payload in this project.</p>
              ) : groups.map(([group, list]) => {
                const isCollapsed = collapsed.has(group);
                const allSelected = list.every(i => selected.has(i.key));
                return (
                  <section key={group} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                      <input type="checkbox" checked={allSelected} onChange={e => toggle(list.map(i => i.key), e.target.checked)} title="Select the group" />
                      <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(group) ? n.delete(group) : n.add(group); return n; })} className="flex-1 text-left">
                        <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">{group}</span>
                        <span className="text-[11px] text-gray-400 ml-2">{list.length} call(s) {isCollapsed ? '▸' : '▾'}</span>
                      </button>
                    </div>
                    {!isCollapsed && (
                      <ul className="divide-y divide-gray-100">
                        {list.map(item => {
                          const r = results[item.key];
                          const isOpen = openKey === item.key;
                          return (
                            <li key={item.key}>
                              <div className="px-4 py-2.5 flex items-center gap-3">
                                <input type="checkbox" checked={selected.has(item.key)} onChange={e => toggle([item.key], e.target.checked)} />
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded w-12 text-center shrink-0 ${methodColor(item.method)}`}>{item.method}</span>
                                <span className="font-mono text-[11px] text-gray-500 shrink-0">{item.path}</span>
                                <span className="text-xs text-gray-800 truncate flex-1">{item.label}</span>
                                {item.lastStatus !== undefined && <span className="text-[10px] text-gray-400 shrink-0">saved {statusBadge(item.lastStatus)}</span>}
                                {r && <span className="text-[10px] text-gray-400 shrink-0">replay {statusBadge(r.status, r.ok, r.message)}{r.durationMs !== undefined ? ` ${r.durationMs} ms` : ''}</span>}
                                <button onClick={() => setOpenKey(isOpen ? null : item.key)} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50 shrink-0">{isOpen ? 'Hide' : 'View'}</button>
                                <button onClick={() => runOne(item)} disabled={!!running || !!targetMissing} className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-40 shrink-0">
                                  {running === item.key ? '…' : 'Replay'}
                                </button>
                              </div>
                              {r && !r.ok && <p className="px-4 pb-2 text-[11px] text-red-600 break-words">{r.message}{r.requestId ? ` · Request-Id ${r.requestId}` : ''}</p>}
                              {isOpen && (
                                <div className="px-4 pb-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Request ({'{{site_id}}'} / {'{{token}}'} resolved at replay)</p>
                                    <pre className="max-h-80 overflow-auto bg-[#001F4D] text-blue-100 font-mono text-[11px] p-3 rounded-lg whitespace-pre-wrap break-all">{JSON.stringify(item.body, null, 2)}</pre>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{r ? `Replay result · ${new Date(r.at).toLocaleTimeString()}` : 'Saved result'}</p>
                                    <pre className="max-h-80 overflow-auto bg-gray-900 text-gray-100 font-mono text-[11px] p-3 rounded-lg whitespace-pre-wrap break-all">
                                      {JSON.stringify(r ? r.response ?? null : item.lastResponse ?? '—', null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StepProjects;
