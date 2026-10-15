import React, { useMemo, useRef, useState } from 'react';
import { OnestockApiVersion, OnestockGetEndpoint, SavedPayload } from '../types';
import endpointsCatalog from '../data/onestockGetEndpoints.json';
import {
  onestockRequest,
  useApiTarget,
  missingTargetFields,
  SITE_ID_VAR,
  TOKEN_VAR,
  ProxyResponseEnvelope,
} from '../services/onestockClient';
import {
  savedPayloadsStore, savePayload, deleteSavedPayload, downloadJson,
  updateSavedPayload, listProjects, getLastProject, setLastProject, SOURCE_LABELS,
} from '../services/payloadStore';
import { extractOnestockItems } from '../utils/payloadUtils';

const ENDPOINTS = endpointsCatalog as OnestockGetEndpoint[];
const TAGS = Array.from(new Set(ENDPOINTS.map(e => e.tag))).sort();

// Puts the {{site_id}} / {{token}} variables first; their values come from API Settings at call time.
const withAuthVariables = (body: Record<string, unknown>) => {
  const { site_id, token, ...rest } = body;
  return {
    site_id: typeof site_id === 'string' && site_id.startsWith('{{') ? site_id : SITE_ID_VAR,
    token: TOKEN_VAR,
    ...rest,
  };
};

const defaultBodyFor = (endpoint: OnestockGetEndpoint): string =>
  JSON.stringify(withAuthVariables({ ...(endpoint.exampleBody || {}) }), null, 2);

const pickVersion = (endpoint: OnestockGetEndpoint, preferred?: OnestockApiVersion): OnestockApiVersion | undefined => {
  if (endpoint.versions.length === 0) return preferred;
  if (preferred && endpoint.versions.includes(preferred)) return preferred;
  return endpoint.versions[endpoint.versions.length - 1];
};

const fillPath = (path: string, params: Record<string, string>) =>
  path.replace(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(params[name] || `{${name}}`));

interface StepApiExplorerProps {
  // Opens the items of a GET /items result (or an /items payload) in the Product Manager.
  onOpenItems: (items: any[], label: string) => void;
}

const NO_PROJECT_FILTER = '__none__';

const StepApiExplorer: React.FC<StepApiExplorerProps> = ({ onOpenItems }) => {
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);
  const savedPayloads = savedPayloadsStore.use();

  const [tab, setTab] = useState<'explorer' | 'saved'>('explorer');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [showInternal, setShowInternal] = useState(false);

  const [selected, setSelected] = useState<OnestockGetEndpoint | null>(null);
  const [version, setVersion] = useState<OnestockApiVersion | undefined>();
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState('{}');
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [lastCall, setLastCall] = useState<{ url: string; path: string; request: unknown; envelope: ProxyResponseEnvelope } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveProject, setSaveProject] = useState(getLastProject());
  const [notice, setNotice] = useState<string | null>(null);

  const [savedFilter, setSavedFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; project: string } | null>(null);
  const projects = useMemo(() => listProjects(savedPayloads), [savedPayloads]);
  const [expandedSavedId, setExpandedSavedId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ENDPOINTS.filter(e =>
      (showInternal || !e.internal) &&
      (!tag || e.tag === tag) &&
      (!q || e.path.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q))
    );
  }, [search, tag, showInternal]);

  const selectEndpoint = (endpoint: OnestockGetEndpoint, body?: string, params?: Record<string, string>) => {
    setSelected(endpoint);
    setVersion(pickVersion(endpoint, target.version));
    setPathParams(params || Object.fromEntries(endpoint.pathParams.map(p => [p, ''])));
    setBodyText(body ?? defaultBodyFor(endpoint));
    setBodyError(null);
    setLastCall(null);
    setCallError(null);
    setNotice(null);
    setSaveName('');
  };

  const parseBody = (): Record<string, unknown> | null | undefined => {
    if (!bodyText.trim()) return null;
    try {
      const parsed = JSON.parse(bodyText);
      setBodyError(null);
      return parsed;
    } catch (e: any) {
      setBodyError(`Invalid JSON: ${e.message}`);
      return undefined;
    }
  };

  const handleSend = async () => {
    if (!selected) return;
    const body = parseBody();
    if (body === undefined) return;
    const missing = selected.pathParams.filter(p => !pathParams[p]?.trim());
    if (missing.length) {
      setCallError(`Missing path parameter(s): ${missing.join(', ')}`);
      return;
    }
    setLoading(true);
    setCallError(null);
    setNotice(null);
    const path = fillPath(selected.path, pathParams);
    try {
      const result = await onestockRequest({ method: 'GET', path, body, version });
      setLastCall({ url: result.url, path, request: result.requestTemplate, envelope: result.envelope });
    } catch (err: any) {
      setCallError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = (what: 'both' | 'request' | 'response') => {
    if (!selected) return;
    if (!saveName.trim()) {
      setNotice('Give the payload a name before saving it.');
      return;
    }
    const body = parseBody();
    if (body === undefined) return;
    // "Save request" stores the editor content; the other modes store what was actually sent.
    const fromLastCall = what !== 'request' && lastCall;
    const path = fromLastCall ? lastCall.path : fillPath(selected.path, pathParams);
    const entry: Omit<SavedPayload, 'id' | 'createdAt'> = {
      name: saveName.trim(),
      project: saveProject.trim() || undefined,
      source: 'explorer',
      method: 'GET',
      path,
      url: fromLastCall ? lastCall.url : undefined,
      connectionName: target.siteId || undefined,
      request: what === 'response' ? undefined : fromLastCall ? lastCall.request : (body || {}),
      response: what === 'request' ? undefined : lastCall?.envelope.body,
      status: what === 'request' ? undefined : lastCall?.envelope.status,
      durationMs: what === 'request' ? undefined : lastCall?.envelope.durationMs,
    };
    savePayload(entry);
    setLastProject(saveProject.trim());
    setNotice(`Saved "${entry.name}"${entry.project ? ` in project "${entry.project}"` : ''}.`);
  };

  const loadSaved = (entry: SavedPayload) => {
    const templatePath = ENDPOINTS.find(e => e.path === entry.path)
      ? entry.path
      : ENDPOINTS.find(e => new RegExp(`^${e.path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(entry.path))?.path;
    const endpoint = ENDPOINTS.find(e => e.path === templatePath);
    if (!endpoint) {
      setNotice(`Endpoint ${entry.path} is not in the GET catalog.`);
      return;
    }
    const params: Record<string, string> = {};
    const names = endpoint.pathParams;
    const re = new RegExp(`^${endpoint.path.replace(/\{[^}]+\}/g, '([^/]+)')}$`);
    const match = entry.path.match(re);
    names.forEach((n, i) => { params[n] = match?.[i + 1] ? decodeURIComponent(match[i + 1]) : ''; });
    // Older saves hold the real site / a masked token: switch them back to the variables.
    const request = withAuthVariables({ ...((entry.request as any) || {}) });
    if (endpoint.internal) setShowInternal(true);
    selectEndpoint(endpoint, JSON.stringify(request, null, 2), params);
    setTab('explorer');
  };

  const handleImportSaved = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const list: SavedPayload[] = Array.isArray(data) ? data : [data];
        const valid = list.filter(p => p && p.id && p.path && p.method);
        savedPayloadsStore.set(prev => [...valid.filter(v => !prev.some(p => p.id === v.id)), ...prev]);
        setNotice(`Imported ${valid.length} saved payload(s).`);
      } catch (err: any) {
        setNotice(`Import failed: ${err?.message || err}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredSaved = savedPayloads.filter(p => {
    const q = savedFilter.trim().toLowerCase();
    const project = (p.project || '').trim();
    if (projectFilter === NO_PROJECT_FILTER ? project !== '' : projectFilter && project !== projectFilter) return false;
    return !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || project.toLowerCase().includes(q);
  });

  // Saved payloads grouped by project (payloads without project last).
  const savedGroups = useMemo(() => {
    const groups = new Map<string, SavedPayload[]>();
    filteredSaved.forEach(p => {
      const key = (p.project || '').trim();
      groups.set(key, [...(groups.get(key) || []), p]);
    });
    return [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [filteredSaved]);

  const saveEdit = () => {
    if (!editing || !editing.name.trim()) return;
    updateSavedPayload(editing.id, { name: editing.name.trim(), project: editing.project.trim() || undefined });
    setEditing(null);
  };

  const lastCallItems = lastCall?.path === '/items' ? extractOnestockItems(lastCall.envelope.body) : null;

  const statusColor = (status?: number) =>
    !status ? 'bg-gray-100 text-gray-600' : status < 300 ? 'bg-green-100 text-green-700' : status < 500 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">OneStock GET Explorer</h2>
          <p className="text-gray-500 text-sm mt-1">
            {ENDPOINTS.length} GET routes from the OneStock API spec. Calls go through the Vercel proxy with the API Settings target
            {targetMissing ? <span className="text-red-600 font-semibold"> — missing in API Settings: {targetMissing}</span> : <> (<strong>{target.siteId}</strong> · {target.baseUrl})</>}.
          </p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-bold shrink-0">
          <button onClick={() => setTab('explorer')} className={`px-4 py-2 rounded-md ${tab === 'explorer' ? 'bg-white text-[#002D72] shadow-sm' : 'text-gray-500'}`}>Explorer</button>
          <button onClick={() => setTab('saved')} className={`px-4 py-2 rounded-md ${tab === 'saved' ? 'bg-white text-[#002D72] shadow-sm' : 'text-gray-500'}`}>Saved payloads ({savedPayloads.length})</button>
        </div>
      </div>

      <datalist id="saved-payload-projects">
        {projects.map(p => <option key={p} value={p} />)}
      </datalist>

      {notice && <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-900">{notice}</div>}

      {tab === 'explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col max-h-[75vh]">
            <div className="p-4 space-y-2 border-b border-gray-100">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search path or description…"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-onestock-blue"
              />
              <select value={tag} onChange={e => setTag(e.target.value)} className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none">
                <option value="">All categories</option>
                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input type="checkbox" checked={showInternal} onChange={e => setShowInternal(e.target.checked)} />
                Show [internal] routes
              </label>
              <p className="text-[10px] text-gray-400">{filteredEndpoints.length} route(s)</p>
            </div>
            <ul className="overflow-y-auto divide-y divide-gray-50">
              {filteredEndpoints.map(e => (
                <li key={e.path}>
                  <button
                    onClick={() => selectEndpoint(e)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-blue-50/50 ${selected?.path === e.path ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 rounded">GET</span>
                      <span className="font-mono text-xs text-gray-800 truncate">{e.path}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{e.tag} · {e.summary}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4 min-w-0">
            {!selected ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400 text-sm">
                Select a GET route on the left.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">GET</span>
                      <span className="font-mono text-sm font-bold text-[#002D72] break-all">{selected.path}</span>
                      <span className="text-[10px] text-gray-400">{selected.tag}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{selected.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Version</label>
                      <select value={version || ''} onChange={e => setVersion(e.target.value as OnestockApiVersion)} className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none">
                        {(selected.versions.length ? selected.versions : (['v1', 'v2', 'v3', 'v4'] as OnestockApiVersion[])).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {selected.pathParams.map(p => (
                      <div key={p}>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{p}</label>
                        <input
                          value={pathParams[p] || ''}
                          onChange={e => setPathParams(prev => ({ ...prev, [p]: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-onestock-blue"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{'Request body — {{site_id}} and {{token}} are replaced by the API Settings values at call time'}</label>
                      <button onClick={() => setBodyText(defaultBodyFor(selected))} className="text-[10px] font-bold text-onestock-blue hover:underline">Reset to example</button>
                    </div>
                    <textarea
                      value={bodyText}
                      onChange={e => setBodyText(e.target.value)}
                      spellCheck={false}
                      className="w-full h-56 font-mono text-xs p-3 bg-[#001F4D] text-blue-100 rounded-lg outline-none"
                    />
                    {selected.bodyFields.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">Accepted fields: {selected.bodyFields.join(', ')}</p>
                    )}
                    {bodyError && <p className="text-xs text-red-600 mt-1">{bodyError}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleSend}
                      disabled={loading || !!targetMissing}
                      className="px-6 py-2 text-sm font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D] disabled:opacity-40"
                    >
                      {loading ? 'Calling…' : 'Send'}
                    </button>
                    <input
                      value={saveProject}
                      onChange={e => setSaveProject(e.target.value)}
                      list="saved-payload-projects"
                      placeholder="Project"
                      className="w-40 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <input
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      placeholder="Payload name (required to save)"
                      className="flex-1 min-w-[180px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <button onClick={() => handleSave('request')} disabled={!saveName.trim()} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Save request</button>
                    <button onClick={() => handleSave('both')} disabled={!lastCall || !saveName.trim()} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Save request + result</button>
                  </div>
                  {callError && <p className="text-sm text-red-600 break-words">{callError}</p>}
                </div>

                {lastCall && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${statusColor(lastCall.envelope.status)}`}>
                        {lastCall.envelope.status} {lastCall.envelope.statusText}
                      </span>
                      <span className="text-xs text-gray-400">{lastCall.envelope.durationMs} ms</span>
                      {lastCall.envelope.headers['request-id'] && (
                        <span className="text-[10px] font-mono text-gray-400">Request-Id: {lastCall.envelope.headers['request-id']}</span>
                      )}
                      <div className="ml-auto flex gap-2">
                        {lastCallItems && (
                          <button onClick={() => onOpenItems(lastCallItems, saveName.trim() || `GET ${lastCall.path}`)} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                            Open {lastCallItems.length} item(s) in Product Manager
                          </button>
                        )}
                        <button onClick={() => handleSave('response')} disabled={!saveName.trim()} title={saveName.trim() ? '' : 'Name the payload first'} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Save result</button>
                        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(lastCall.envelope.body, null, 2))} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Copy</button>
                        <button onClick={() => downloadJson({ request: lastCall.request, response: lastCall.envelope.body, status: lastCall.envelope.status, url: lastCall.url }, `onestock_GET${lastCall.path.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}`)} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Download</button>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-gray-400 break-all">{lastCall.url}</p>
                    <pre className="max-h-[50vh] overflow-auto bg-[#001F4D] text-blue-100 font-mono text-xs p-4 rounded-lg whitespace-pre-wrap break-all">
                      {typeof lastCall.envelope.body === 'string' ? lastCall.envelope.body : JSON.stringify(lastCall.envelope.body, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'saved' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 flex flex-wrap gap-2 items-center border-b border-gray-100">
            <input
              value={savedFilter}
              onChange={e => setSavedFilter(e.target.value)}
              placeholder="Filter saved payloads…"
              className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
            />
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none">
              <option value="">All projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
              <option value={NO_PROJECT_FILTER}>No project</option>
            </select>
            <input type="file" ref={importRef} accept=".json" className="hidden" onChange={handleImportSaved} />
            <button onClick={() => importRef.current?.click()} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Import</button>
            <button onClick={() => downloadJson(savedPayloads, `onestock_saved_payloads_${Date.now()}`)} disabled={savedPayloads.length === 0} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Export all</button>
          </div>
          {filteredSaved.length === 0 ? (
            <p className="p-12 text-center text-sm text-gray-400">No saved payload.</p>
          ) : (
            <div>
              {savedGroups.map(([project, entries]) => (
              <div key={project || NO_PROJECT_FILTER}>
              <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">{project || 'No project'}</span>
                <span className="text-[10px] text-gray-400">{entries.length} payload(s)</span>
              </div>
              <ul className="divide-y divide-gray-100">
              {entries.map(p => (
                <li key={p.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 rounded ${p.method === 'GET' ? 'text-emerald-700 bg-emerald-50' : 'text-orange-700 bg-orange-50'}`}>{p.method}</span>
                    {editing?.id === p.id ? (
                      <>
                        <input value={editing.project} onChange={e => setEditing({ ...editing, project: e.target.value })} list="saved-payload-projects" placeholder="Project" className="w-32 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded outline-none" />
                        <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} placeholder="Name" className="w-56 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded outline-none" />
                        <button onClick={saveEdit} disabled={!editing.name.trim()} className="px-2 py-1 text-[11px] font-bold text-white bg-onestock-blue rounded disabled:opacity-40">OK</button>
                        <button onClick={() => setEditing(null)} className="px-2 py-1 text-[11px] font-bold text-gray-500">Cancel</button>
                      </>
                    ) : (
                      <span className="font-bold text-sm text-gray-900">{p.name}</span>
                    )}
                    <span className="font-mono text-[11px] text-gray-500">{p.path}</span>
                    {p.status !== undefined && <span className={`text-[10px] font-bold px-1.5 rounded ${statusColor(p.status)}`}>{p.status}</span>}
                    <span className="text-[10px] text-gray-400">{SOURCE_LABELS[p.source] || p.source} · {p.connectionName || '—'} · {new Date(p.createdAt).toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400">{p.request !== undefined ? 'request' : ''}{p.request !== undefined && p.response !== undefined ? ' + ' : ''}{p.response !== undefined ? 'result' : ''}</span>
                    <div className="ml-auto flex gap-2">
                      {(extractOnestockItems(p.response) || extractOnestockItems(p.request)) && (
                        <button onClick={() => onOpenItems((extractOnestockItems(p.response) || extractOnestockItems(p.request))!, p.name)} className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded hover:bg-emerald-700">Open in Product Manager</button>
                      )}
                      <button onClick={() => setEditing({ id: p.id, name: p.name, project: p.project || '' })} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Rename</button>
                      <button onClick={() => setExpandedSavedId(expandedSavedId === p.id ? null : p.id)} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50">{expandedSavedId === p.id ? 'Hide' : 'View'}</button>
                      {p.method === 'GET' && <button onClick={() => loadSaved(p)} className="px-2 py-1 text-[11px] font-bold text-onestock-blue border border-onestock-blue rounded hover:bg-blue-50">Load in explorer</button>}
                      <button onClick={() => downloadJson(p, `${p.name.replace(/[^a-z0-9]+/gi, '_')}_${p.id}`)} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Download</button>
                      <button onClick={() => deleteSavedPayload(p.id)} className="px-2 py-1 text-[11px] font-bold text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                  {expandedSavedId === p.id && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Request</p>
                        <pre className="max-h-80 overflow-auto bg-[#001F4D] text-blue-100 font-mono text-[11px] p-3 rounded-lg whitespace-pre-wrap break-all">{p.request === undefined ? '—' : JSON.stringify(p.request, null, 2)}</pre>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Result</p>
                        <pre className="max-h-80 overflow-auto bg-[#001F4D] text-blue-100 font-mono text-[11px] p-3 rounded-lg whitespace-pre-wrap break-all">{p.response === undefined ? '—' : JSON.stringify(p.response, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              </ul>
              </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StepApiExplorer;
