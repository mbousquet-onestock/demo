import React, { useMemo, useState } from 'react';
import { SavedPayload, OnestockApiVersion } from '../types';
import { savedPayloadsStore, listProjects, updateSavedPayload, SOURCE_LABELS } from '../services/payloadStore';
import { stockPointSetsStore } from '../services/appStores';
import { onestockRequest, useApiTarget, missingTargetFields, describeCallError, getApiTarget } from '../services/onestockClient';
import { extractEndpointIds, mergeIds } from '../utils/endpointUtils';
import { Drawer } from './ProductApiTools';

interface StockPointsPickerProps {
  hasEndpoints: boolean;
  onLoad: (ids: string[], label: string, mode: 'replace' | 'append') => void;
  onClose: () => void;
}

interface Source {
  key: string;
  name: string;
  detail: string;
  createdAt: string;
  ids: string[];
}

interface ProjectGroup {
  project: string;
  sources: Source[];
  // Saved GET /endpoints requests without result: runnable.
  runnable: SavedPayload[];
}

const isGetEndpoints = (p: SavedPayload) => p.method.toUpperCase() === 'GET' && p.path.split('?')[0] === '/endpoints';

// Stock point lists from saved payloads (GET /endpoints results, POST /endpoints payloads) and from the
// Stock Points tab sets, grouped by project.
const StockPointsPicker: React.FC<StockPointsPickerProps> = ({ hasEndpoints, onLoad, onClose }) => {
  const saved = savedPayloadsStore.use();
  const sets = stockPointSetsStore.use();
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);
  const [project, setProject] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyCreated, setOnlyCreated] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<{ id: string; message: string } | null>(null);

  const projects = listProjects([...saved, ...sets]);
  const q = search.trim().toLowerCase();

  const groups = useMemo<ProjectGroup[]>(() => {
    const map = new Map<string, ProjectGroup>();
    const groupOf = (p?: string) => {
      const key = (p || '').trim();
      if (!map.has(key)) map.set(key, { project: key, sources: [], runnable: [] });
      return map.get(key)!;
    };
    const keep = (name: string, p?: string) =>
      (project === null || (p || '').trim() === project) && (!q || name.toLowerCase().includes(q) || (p || '').toLowerCase().includes(q));

    sets.forEach(s => {
      if (!keep(s.name, s.project)) return;
      const created = s.endpoints.filter(e => s.pushResults?.[e.id]?.ok).map(e => e.id);
      const ids = onlyCreated ? created : s.endpoints.map(e => e.id);
      if (ids.length === 0) return;
      groupOf(s.project).sources.push({
        key: `set-${s.id}`,
        name: s.name,
        detail: `Stock Points set · ${s.endpoints.length} point(s), ${created.length} created`,
        createdAt: s.updatedAt,
        ids,
      });
    });

    if (!onlyCreated) {
      saved.forEach(p => {
        if (!keep(p.name, p.project)) return;
        const fromResult = extractEndpointIds(p.response);
        const ids = fromResult || extractEndpointIds(p.request);
        if (ids) {
          groupOf(p.project).sources.push({
            key: `payload-${p.id}`,
            name: p.name,
            detail: `${p.method} ${p.path} · ${fromResult ? 'result' : 'request'} · ${SOURCE_LABELS[p.source] || p.source}`,
            createdAt: p.createdAt,
            ids,
          });
        } else if (isGetEndpoints(p)) {
          groupOf(p.project).runnable.push(p);
        }
      });
    }

    return [...map.values()]
      .filter(g => g.sources.length > 0 || g.runnable.length > 0)
      .sort((a, b) => (a.project === '' ? 1 : b.project === '' ? -1 : a.project.localeCompare(b.project)));
  }, [saved, sets, project, q, onlyCreated]);

  const load = (ids: string[], label: string, mode: 'replace' | 'append') => {
    onLoad(ids, label, mode);
    onClose();
  };

  // Runs a saved GET /endpoints request, keeps its result with the payload, then loads the ids.
  const runAndLoad = async (payload: SavedPayload, mode: 'replace' | 'append') => {
    setRunning(payload.id);
    setRunError(null);
    try {
      const body = (payload.request && typeof payload.request === 'object' ? payload.request : {}) as Record<string, unknown>;
      // GET /endpoints only exists in v3 / v4.
      const version: OnestockApiVersion = getApiTarget().version === 'v4' ? 'v4' : 'v3';
      const { url, envelope } = await onestockRequest({ method: 'GET', path: '/endpoints', body, version });
      if (!envelope.ok) throw new Error(describeCallError(envelope));
      updateSavedPayload(payload.id, { response: envelope.body, status: envelope.status, durationMs: envelope.durationMs, url });
      const ids = extractEndpointIds(envelope.body);
      if (!ids) throw new Error('GET /endpoints returned no stock point for this request.');
      load(ids, payload.name, mode);
    } catch (err: any) {
      setRunError({ id: payload.id, message: err?.message || String(err) });
    } finally {
      setRunning(null);
    }
  };

  const buttons = (ids: string[], label: string, primary: boolean, whole = false) => (
    <>
      <button
        onClick={() => load(ids, label, 'replace')}
        className={primary
          ? 'px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]'
          : 'px-3 py-1.5 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50'}
      >
        {whole ? (hasEndpoints ? 'Replace with whole project' : 'Use whole project') : (hasEndpoints ? 'Replace list' : 'Use')}
      </button>
      {hasEndpoints && (
        <button onClick={() => load(ids, label, 'append')} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Add</button>
      )}
    </>
  );

  return (
    <Drawer title="Load stock points" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Stock point ids from the <strong>Stock Points</strong> sets and from saved payloads (<code>GET /endpoints</code> results,
          <code> POST /endpoints</code> payloads), grouped by project. A <code>GET /endpoints</code> request saved without result is run first.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or project…" className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none" />
          <select
            value={project === null ? '__all__' : project}
            onChange={e => setProject(e.target.value === '__all__' ? null : e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
          >
            <option value="__all__">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="">No project</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={onlyCreated} onChange={e => setOnlyCreated(e.target.checked)} />
            Only points created in OneStock (Stock Points sets)
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
            No stock point list found. Generate a set in <strong>Stock Points</strong>, or save a <code>GET /endpoints</code> call in the API Explorer.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(group => {
              const merged = mergeIds(...[...group.sources].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(s => s.ids));
              const several = !!group.project && group.sources.length > 1;
              return (
                <div key={group.project || '__none__'} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">{group.project || 'No project'}</span>
                    <span className="text-[11px] text-gray-400">
                      {group.sources.length} list(s) · {merged.length} distinct stock point(s)
                      {group.runnable.length > 0 && ` · ${group.runnable.length} GET /endpoints request(s) to run`}
                    </span>
                    {several && <div className="ml-auto flex gap-2">{buttons(merged, `project ${group.project}`, true, true)}</div>}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {group.sources.map(src => (
                      <li key={src.key} className="p-4 flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-gray-900">{src.name}</span>
                          <p className="text-[11px] text-gray-400 mt-0.5">{src.detail} · {src.ids.length} id(s) · {new Date(src.createdAt).toLocaleString()}</p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5 truncate">{src.ids.slice(0, 8).join(', ')}{src.ids.length > 8 ? ', …' : ''}</p>
                        </div>
                        {buttons(src.ids, src.name, !several)}
                      </li>
                    ))}
                    {group.runnable.map(p => (
                      <li key={p.id} className="p-4 flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-gray-900">{p.name}</span>
                          <p className="text-[11px] text-gray-400 mt-0.5">GET /endpoints · request saved without result · {new Date(p.createdAt).toLocaleString()}</p>
                          {runError?.id === p.id && <p className="text-[11px] text-red-600 mt-1 break-words">{runError.message}</p>}
                          {targetMissing && <p className="text-[11px] text-amber-600 mt-1">Missing in API Settings: {targetMissing}</p>}
                        </div>
                        <button onClick={() => runAndLoad(p, 'replace')} disabled={!!running || !!targetMissing} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                          {running === p.id ? 'Calling GET /endpoints…' : hasEndpoints ? 'Run & replace' : 'Run & use'}
                        </button>
                        {hasEndpoints && (
                          <button onClick={() => runAndLoad(p, 'append')} disabled={!!running || !!targetMissing} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Run & add</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default StockPointsPicker;
