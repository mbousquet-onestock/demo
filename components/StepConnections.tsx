import React, { useState } from 'react';
import { ConnectionInstance, OnestockApiVersion, OnestockEnvironment } from '../types';
import {
  connectionsStore,
  activeConnectionIdStore,
  loginConnection,
  buildUrl,
} from '../services/onestockClient';

const emptyConnection = (): ConnectionInstance => ({
  id: '',
  name: '',
  environment: 'qualif',
  customBaseUrl: '',
  version: 'v3',
  siteId: '',
  userId: '',
  password: '',
});

const inputClass = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue';
const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';

const maskToken = (token?: string) => (token ? `${token.slice(0, 6)}…${token.slice(-4)}` : '—');

const StepConnections: React.FC = () => {
  const connections = connectionsStore.use();
  const activeId = activeConnectionIdStore.use();
  const [draft, setDraft] = useState<ConnectionInstance | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const setField = <K extends keyof ConnectionInstance>(key: K, value: ConnectionInstance[K]) =>
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.siteId.trim()) {
      setMessage({ type: 'error', text: 'Name and Site ID are required.' });
      return;
    }
    if (draft.environment === 'custom' && !draft.customBaseUrl?.trim()) {
      setMessage({ type: 'error', text: 'A custom base URL is required for the "custom" environment.' });
      return;
    }
    if (draft.id) {
      const previous = connections.find(c => c.id === draft.id);
      // Credentials or target changed → the old token is no longer valid.
      const invalidates = previous && (
        previous.siteId !== draft.siteId || previous.userId !== draft.userId || previous.password !== draft.password ||
        previous.environment !== draft.environment || previous.customBaseUrl !== draft.customBaseUrl
      );
      connectionsStore.set(prev => prev.map(c => (c.id === draft.id
        ? { ...draft, ...(invalidates ? { token: undefined, tokenObtainedAt: undefined } : {}) }
        : c)));
    } else {
      const created = { ...draft, id: Date.now().toString(36) };
      connectionsStore.set(prev => [...prev, created]);
      if (!activeId) activeConnectionIdStore.set(created.id);
    }
    setDraft(null);
    setMessage(null);
  };

  const handleDelete = (conn: ConnectionInstance) => {
    if (!window.confirm(`Delete connection "${conn.name}"?`)) return;
    connectionsStore.set(prev => prev.filter(c => c.id !== conn.id));
    if (activeId === conn.id) activeConnectionIdStore.set(null);
  };

  const handleLogin = async (conn: ConnectionInstance) => {
    setBusyId(conn.id);
    setMessage(null);
    try {
      await loginConnection(conn);
      activeConnectionIdStore.set(conn.id);
      setMessage({ type: 'ok', text: `Token retrieved for "${conn.name}". It is now used by every API call of the app.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Login failed for "${conn.name}": ${err?.message || err}` });
    } finally {
      setBusyId(null);
    }
  };

  const handleClearToken = (conn: ConnectionInstance) => {
    connectionsStore.set(prev => prev.map(c => (c.id === conn.id ? { ...c, token: undefined, tokenObtainedAt: undefined } : c)));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Connection Instances</h2>
          <p className="text-gray-500 text-sm mt-1">
            Define OneStock credentials, retrieve a token with <code className="text-xs bg-gray-100 px-1 rounded">POST /login</code> and
            pick the active instance. Its token and site ID are injected in every API call (all routed through the Vercel proxy).
          </p>
        </div>
        <button
          onClick={() => { setDraft(emptyConnection()); setMessage(null); }}
          className="px-4 py-2.5 bg-onestock-blue text-white text-xs font-bold rounded-lg hover:bg-[#001F4D] whitespace-nowrap"
        >
          + New connection
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border text-sm ${message.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {draft && (
        <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-8 space-y-6">
          <h3 className="text-xs font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3">
            {draft.id ? `Edit "${draft.name}"` : 'New connection'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} value={draft.name} onChange={e => setField('name', e.target.value)} placeholder="Demo qualif c500" />
            </div>
            <div>
              <label className={labelClass}>Environment</label>
              <select className={inputClass} value={draft.environment} onChange={e => setField('environment', e.target.value as OnestockEnvironment)}>
                <option value="qualif">Qualification</option>
                <option value="prod">Production</option>
                <option value="custom">Custom base URL</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Default API version</label>
              <select className={inputClass} value={draft.version} onChange={e => setField('version', e.target.value as OnestockApiVersion)}>
                {(['v1', 'v2', 'v3', 'v4'] as OnestockApiVersion[]).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            {draft.environment === 'custom' && (
              <div className="md:col-span-3">
                <label className={labelClass}>Custom base URL</label>
                <input className={inputClass} value={draft.customBaseUrl} onChange={e => setField('customBaseUrl', e.target.value)} placeholder="https://c500.api.qualif.onestock-retail.com" />
              </div>
            )}
            <div>
              <label className={labelClass}>Site ID</label>
              <input className={inputClass} value={draft.siteId} onChange={e => setField('siteId', e.target.value.trim())} placeholder="c500" />
            </div>
            <div>
              <label className={labelClass}>User ID</label>
              <input className={inputClass} value={draft.userId} onChange={e => setField('userId', e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input type="password" className={inputClass} value={draft.password} onChange={e => setField('password', e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Login URL: <span className="font-mono">{draft.siteId || draft.environment === 'custom' ? buildUrl(draft, '/login') : '—'}</span>.
            Credentials are kept in this browser's local storage only.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDraft(null)} className="px-4 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} className="px-6 py-2 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">Save</button>
          </div>
        </div>
      )}

      {connections.length === 0 && !draft ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400 text-sm">
          No connection yet. Create one to retrieve a token.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {connections.map(conn => {
            const isActive = conn.id === activeId;
            return (
              <div key={conn.id} className={`bg-white rounded-xl border p-6 shadow-sm space-y-4 ${isActive ? 'border-onestock-blue ring-2 ring-blue-100' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 truncate">{conn.name}</h3>
                      {isActive && <span className="text-[9px] font-bold uppercase bg-onestock-blue text-white px-2 py-0.5 rounded">Active</span>}
                    </div>
                    <p className="text-[11px] font-mono text-gray-500 truncate">{buildUrl(conn, '')}</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${conn.environment === 'prod' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                    {conn.environment}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-400 block text-[10px] uppercase font-bold">Site</span>{conn.siteId}</div>
                  <div><span className="text-gray-400 block text-[10px] uppercase font-bold">User</span>{conn.userId || '—'}</div>
                  <div><span className="text-gray-400 block text-[10px] uppercase font-bold">Token</span><span className="font-mono">{maskToken(conn.token)}</span></div>
                </div>
                {conn.tokenObtainedAt && (
                  <p className="text-[10px] text-gray-400">Token obtained {new Date(conn.tokenObtainedAt).toLocaleString()}</p>
                )}
                {conn.lastError && <p className="text-[11px] text-red-600 break-words">{conn.lastError}</p>}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleLogin(conn)}
                    disabled={busyId === conn.id || !conn.userId || !conn.password}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D] disabled:opacity-40"
                  >
                    {busyId === conn.id ? 'Logging in…' : conn.token ? 'Refresh token' : 'Get token'}
                  </button>
                  {!isActive && (
                    <button onClick={() => activeConnectionIdStore.set(conn.id)} className="px-3 py-1.5 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50">
                      Set active
                    </button>
                  )}
                  {conn.token && (
                    <button onClick={() => navigator.clipboard.writeText(conn.token!)} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Copy token
                    </button>
                  )}
                  {conn.token && (
                    <button onClick={() => handleClearToken(conn)} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Clear token
                    </button>
                  )}
                  <button onClick={() => { setDraft({ ...conn }); setMessage(null); }} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(conn)} className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 ml-auto">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StepConnections;
