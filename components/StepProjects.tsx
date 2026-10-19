import React, { useEffect, useMemo, useRef, useState } from 'react';
import { savedPayloadsStore } from '../services/payloadStore';
import { stockPointSetsStore, orderBatchesStore, manualStepsStore, deliveryScriptsStore } from '../services/appStores';
import { useApiTarget, missingTargetFields, isProductionTarget } from '../services/onestockClient';
import {
  savedPayloadItems, stockPointSetItems, orderBatchItems, deliveryScriptItems, replayItem, deleteReplayItems, ReplayItem, ReplayResult,
} from '../services/replayService';
import { listImageProjects, renameImageProject } from '../services/imageHosting';
import ProjectImages from './ProjectImages';

const NO_PROJECT = '__none__';
// Projects are folder paths: "Client/Phase 1/Run A" is the sub-folder "Run A" of "Client/Phase 1".
const normPath = (project?: string) => (project || '').split('/').map(x => x.trim()).filter(Boolean).join('/');
const keyOf = (project?: string) => normPath(project) || NO_PROJECT;
const titleOf = (key: string) => (key === NO_PROJECT ? 'No project' : key);
const leafOf = (key: string) => (key === NO_PROJECT ? 'No project' : key.split('/').pop()!);
const depthOf = (key: string) => (key === NO_PROJECT ? 0 : key.split('/').length - 1);
const parentsOf = (key: string) => (key === NO_PROJECT ? [] : key.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/')));
// The folder itself or one of its sub-folders.
const inFolder = (key: string, folder: string) => key === folder || (folder !== NO_PROJECT && key.startsWith(`${folder}/`));
const compareKeys = (a: string, b: string) => {
  if (a === NO_PROJECT || b === NO_PROJECT) return a === b ? 0 : a === NO_PROJECT ? 1 : -1;
  const x = a.split('/'), y = b.split('/');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = x[i].localeCompare(y[i]);
    if (c) return c;
  }
  return x.length - y.length;
};

// Moves the projects of a folder (and its sub-folders) under a new path, in every store.
const renameFolder = (from: string, to: string) => {
  const move = <T extends { project?: string }>(list: T[], touch: boolean): T[] => list.map(x => {
    const k = keyOf(x.project);
    if (!inFolder(k, from)) return x;
    const next = normPath(to + k.slice(from.length)) || undefined;
    return { ...x, project: next, ...(touch ? { updatedAt: new Date().toISOString() } : {}) };
  });
  savedPayloadsStore.set(prev => move(prev, false));
  stockPointSetsStore.set(prev => move(prev, true));
  orderBatchesStore.set(prev => move(prev, true));
  manualStepsStore.set(prev => move(prev, true));
  deliveryScriptsStore.set(prev => move(prev, true));
};

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
  const scripts = deliveryScriptsStore.use();
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);

  type Stats = { payloads: number; sets: number; points: number; batches: number; orders: number; steps: number; stepsDone: number; images: number; scripts: number };
  // Images copied to the database, per project (server side).
  const [imageCounts, setImageCounts] = useState<{ project: string; count: number }[]>([]);
  const refreshImages = () => listImageProjects().then(setImageCounts).catch(() => setImageCounts([]));
  useEffect(() => { refreshImages(); }, []);
  // Own content of each project path.
  const own = useMemo(() => {
    const map = new Map<string, Stats>();
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, { payloads: 0, sets: 0, points: 0, batches: 0, orders: 0, steps: 0, stepsDone: 0, images: 0, scripts: 0 });
      return map.get(k)!;
    };
    payloads.forEach(p => { get(keyOf(p.project)).payloads++; });
    sets.forEach(s => { const e = get(keyOf(s.project)); e.sets++; e.points += s.endpoints.length; });
    batches.forEach(b => { const e = get(keyOf(b.project)); e.batches++; e.orders += b.packages.reduce((n, p) => n + p.subOrders.length, 0); });
    steps.forEach(s => { const e = get(keyOf(s.project)); e.steps++; if (s.status === 'done') e.stepsDone++; });
    imageCounts.forEach(i => { get(keyOf(i.project)).images += i.count; });
    scripts.forEach(sc => { get(keyOf(sc.project)).scripts++; });
    return map;
  }, [payloads, sets, batches, steps, imageCounts, scripts]);

  // Folder tree: every project path and its parent folders, with the totals of their sub-folders.
  const projects = useMemo(() => {
    const keys = new Set<string>();
    own.forEach((_, k) => { keys.add(k); parentsOf(k).forEach(p => keys.add(p)); });
    return [...keys].sort(compareKeys).map(k => {
      const total: Stats = { payloads: 0, sets: 0, points: 0, batches: 0, orders: 0, steps: 0, stepsDone: 0, images: 0, scripts: 0 };
      own.forEach((s, key) => {
        if (!inFolder(key, k)) return;
        (Object.keys(total) as (keyof Stats)[]).forEach(f => { total[f] += s[f]; });
      });
      return [k, total] as [string, Stats];
    });
  }, [own]);
  const hasChildren = (k: string) => k !== NO_PROJECT && projects.some(([x]) => x.startsWith(`${k}/`));

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const current = selectedProject && projects.some(([k]) => k === selectedProject) ? selectedProject : projects[0]?.[0] || null;
  const [projectSearch, setProjectSearch] = useState('');
  const [foldedTree, setFoldedTree] = useState<Set<string>>(new Set());
  const [withSubfolders, setWithSubfolders] = useState(true);
  const inScope = (project?: string) => !!current && (withSubfolders ? inFolder(keyOf(project), current) : keyOf(project) === current);

  const items = useMemo<ReplayItem[]>(() => {
    if (!current) return [];
    const pick = <T extends { project?: string }>(list: T[]) => list.filter(x => inScope(x.project));
    const all = [
      ...savedPayloadItems(pick(payloads)),
      ...stockPointSetItems(pick(sets)),
      ...orderBatchItems(pick(batches)),
      ...deliveryScriptItems(pick(scripts)),
    ];
    // Calls of sub-folders are grouped under their sub-folder name.
    return all.map(i => {
      const k = keyOf(i.owner.project);
      return k === current ? i : { ...i, group: `${k.slice(current.length + 1)} › ${i.group}` };
    }).sort((a, b) => compareKeys(keyOf(a.owner.project), keyOf(b.owner.project)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, withSubfolders, payloads, sets, batches, scripts]);

  const projectSteps = steps.filter(s => inScope(s.project)).sort((a, b) => compareKeys(keyOf(a.project), keyOf(b.project)) || a.order - b.order);

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
  const stats = withSubfolders ? projects.find(([k]) => k === current)?.[1] : (current && own.get(current)) || (current ? { payloads: 0, sets: 0, points: 0, batches: 0, orders: 0, steps: 0, stepsDone: 0, images: 0, scripts: 0 } : undefined);
  const searching = projectSearch.trim().toLowerCase();
  const filteredProjects = projects.filter(([k]) => searching
    ? titleOf(k).toLowerCase().includes(searching)
    : !parentsOf(k).some(p => foldedTree.has(p)));

  // Moves the documents holding the selected calls (whole payload / stock point set / order batch) to a folder.
  const [moveTarget, setMoveTarget] = useState('');
  const selectedOwners = items.filter(i => selected.has(i.key)).map(i => i.owner);
  const moveSelected = (dest: string) => {
    const to = normPath(dest) || undefined;
    const ids = (kind: string) => new Set(selectedOwners.filter(o => o.kind === kind).map(o => o.id));
    const now = new Date().toISOString();
    const payloadIds = ids('payload'), setIds = ids('set'), batchIds = ids('batch'), scriptIds = ids('script');
    if (scriptIds.size) deliveryScriptsStore.set(prev => prev.map(sc => (scriptIds.has(sc.id) ? { ...sc, project: to, updatedAt: now } : sc)));
    if (payloadIds.size) savedPayloadsStore.set(prev => prev.map(p => (payloadIds.has(p.id) ? { ...p, project: to } : p)));
    if (setIds.size) stockPointSetsStore.set(prev => prev.map(s => (setIds.has(s.id) ? { ...s, project: to, updatedAt: now } : s)));
    if (batchIds.size) orderBatchesStore.set(prev => prev.map(b => (batchIds.has(b.id) ? { ...b, project: to, updatedAt: now } : b)));
    setSelected(new Set());
    setMoveTarget('');
  };
  // Deletes saved calls (a parent order also removes its sub-orders); nothing is deleted in OneStock.
  const deleteCalls = (list: ReplayItem[]) => {
    if (list.length === 0) return;
    const parents = list.filter(i => i.owner.part?.startsWith('parent:')).length;
    const what = list.length === 1 ? `"${list[0].label}"` : `${list.length} saved call(s)`;
    if (!window.confirm(`Delete ${what} from the app?${parents ? `\n${parents} parent order(s): their sub-orders are deleted too.` : ''}\n\nNothing is deleted in OneStock.`)) return;
    deleteReplayItems(list);
    const keys = new Set(list.map(i => i.key));
    setSelected(prev => new Set([...prev].filter(k => !keys.has(k))));
    setResults(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.has(k))));
    if (openKey && keys.has(openKey)) setOpenKey(null);
  };

  const newSubfolder = () => {
    if (!current || current === NO_PROJECT) return;
    const name = window.prompt(`New sub-folder of "${current}" (the selected calls are moved into it):`)?.trim();
    if (name) moveSelected(`${current}/${name}`);
  };
  const renameCurrent = () => {
    if (!current || current === NO_PROJECT) return;
    const to = normPath(window.prompt('Rename / move the folder (use "/" for sub-folders):', current) || '');
    if (!to || to === current) return;
    if (inFolder(to, current)) { window.alert('A folder cannot be moved into itself.'); return; }
    renameFolder(current, to);
    setSelectedProject(to);
    // Images copied to the database follow the folder.
    renameImageProject(current, to).then(refreshImages).catch(() => { /* no database / no image */ });
  };

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
              <p className="text-[10px] text-gray-400 mt-2">Sub-folders: name a project <span className="font-mono">Client/Phase 1</span> anywhere in the app, or move calls below.</p>
            </div>
            <ul className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {filteredProjects.map(([k, s]) => {
                const folded = foldedTree.has(k);
                return (
                  <li key={k} className="flex items-stretch">
                    <button
                      onClick={() => selectProject(k)}
                      style={{ paddingLeft: searching ? 16 : 16 + depthOf(k) * 16 }}
                      className={`flex-1 min-w-0 text-left pr-2 py-3 hover:bg-blue-50/50 ${k === current ? 'bg-blue-50 border-l-4 border-[#002D72]' : 'border-l-4 border-transparent'}`}
                    >
                      <p className={`text-sm font-bold truncate ${k === NO_PROJECT ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                        {depthOf(k) > 0 && !searching && <span className="text-gray-300 font-normal mr-1">└</span>}
                        {searching ? titleOf(k) : leafOf(k)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {[s.payloads && `${s.payloads} payload(s)`, s.sets && `${s.points} stock point(s)`, s.batches && `${s.orders} order(s)`, s.steps && `${s.stepsDone}/${s.steps} step(s)`, s.images && `${s.images} image(s)`, s.scripts && `${s.scripts} delivery script(s)`].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                    {!searching && hasChildren(k) && (
                      <button
                        onClick={() => setFoldedTree(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                        title={folded ? 'Show sub-folders' : 'Hide sub-folders'}
                        className={`px-3 text-xs text-gray-400 hover:text-[#002D72] ${k === current ? 'bg-blue-50' : ''}`}
                      >{folded ? '▸' : '▾'}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Project detail */}
          {current && stats && (
            <div className="space-y-4 min-w-0">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {parentsOf(current).length > 0 && (
                      <p className="text-[11px] text-gray-400">
                        {parentsOf(current).map(pk => (
                          <span key={pk}><button onClick={() => selectProject(pk)} className="hover:text-[#002D72] hover:underline">{leafOf(pk)}</button> / </span>
                        ))}
                      </p>
                    )}
                    <h3 className="text-xl font-bold text-gray-900">{leafOf(current)}</h3>
                  </div>
                  {hasChildren(current) && (
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600 mt-1">
                      <input type="checkbox" checked={withSubfolders} onChange={e => { setWithSubfolders(e.target.checked); setSelected(new Set()); }} />
                      Include sub-folders
                    </label>
                  )}
                  {current !== NO_PROJECT && (
                    <button onClick={renameCurrent} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Rename / move</button>
                  )}
                </div>
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
                        <li key={s.id}>• {keyOf(s.project) !== current && <span className="text-gray-400">{keyOf(s.project).slice(current.length + 1)} › </span>}{s.title}{s.status === 'in_progress' && <span className="text-amber-600"> (in progress)</span>}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <ProjectImages folder={current === NO_PROJECT ? '' : current} includeSubfolders={withSubfolders} onChanged={refreshImages} />

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
                {selected.size > 0 && !running && (
                  <div className="w-full flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                    <span className="text-[11px] text-gray-500">Selection:</span>
                    <span className="text-[11px] text-gray-500">move to</span>
                    <input value={moveTarget} onChange={e => setMoveTarget(e.target.value)} list="projects-folders" placeholder="Folder (e.g. Client/Phase 1)" className="flex-1 min-w-[160px] px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <button onClick={() => moveSelected(moveTarget)} disabled={!normPath(moveTarget)} className="px-3 py-1.5 text-xs font-bold text-[#002D72] border border-[#002D72]/30 rounded-lg hover:bg-blue-50 disabled:opacity-40">Move</button>
                    {current !== NO_PROJECT && (
                      <button onClick={newSubfolder} className="px-3 py-1.5 text-xs font-bold text-[#002D72] border border-[#002D72]/30 rounded-lg hover:bg-blue-50">+ New sub-folder</button>
                    )}
                    <button onClick={() => deleteCalls(items.filter(i => selected.has(i.key)))} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Delete ({selected.size})</button>
                    <span className="w-full text-[10px] text-gray-400">A whole saved payload, stock point set or order batch is moved, even when only some of its calls are selected.</span>
                    <datalist id="projects-folders">{projects.filter(([k]) => k !== NO_PROJECT).map(([k]) => <option key={k} value={k} />)}</datalist>
                  </div>
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
                                <button onClick={() => deleteCalls([item])} disabled={!!running} title="Delete this saved call" className="px-1.5 py-1 text-[11px] font-bold text-gray-400 hover:text-red-600 disabled:opacity-40 shrink-0">✕</button>
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
