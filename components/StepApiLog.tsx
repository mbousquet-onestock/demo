import React, { useMemo, useState } from 'react';
import { apiLogStore, apiLogEnabledStore, clearApiLog, ApiLogEntry } from '../services/apiLog';
import { downloadJson } from '../services/payloadStore';

type StatusFilter = 'all' | 'errors' | 'ok';

const statusColor = (entry: ApiLogEntry) =>
  entry.error || entry.status === null ? 'bg-red-100 text-red-700'
    : entry.status < 300 ? 'bg-green-100 text-green-700'
    : entry.status < 500 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';

const pretty = (value: unknown) =>
  value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

// Equivalent cURL command (token / password stay masked) to replay a call outside the app.
const toCurl = (entry: ApiLogEntry) => {
  const hasBody = entry.request !== undefined && entry.request !== null;
  const override = entry.transportMethod && entry.transportMethod !== entry.method;
  return [
    `curl --request ${entry.transportMethod || entry.method} '${entry.url}'`,
    `  --header 'Content-Type: application/json'`,
    ...(override ? [`  --header 'X-HTTP-Method-Override: ${entry.method}'`] : []),
    ...(hasBody ? [`  --data '${JSON.stringify(entry.request).replace(/'/g, "'\\''")}'`] : []),
  ].join(' \\\n');
};

const StepApiLog: React.FC = () => {
  const entries = apiLogStore.use();
  const enabled = apiLogEnabledStore.use();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const visible = useMemo(() => entries.filter(e => {
    const failed = !!e.error || !e.ok;
    if (statusFilter === 'errors' && !failed) return false;
    if (statusFilter === 'ok' && failed) return false;
    const q = search.trim().toLowerCase();
    return !q || e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q) || String(e.status).includes(q)
      || (e.requestId || '').toLowerCase().includes(q);
  }), [entries, search, statusFilter]);

  const errorCount = entries.filter(e => e.error || !e.ok).length;

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const smallBtn = 'px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">API Logs</h2>
          <p className="text-gray-500 text-sm mt-1">
            Every OneStock call made by the app (login, explorer, /items, stock, imports…): payload sent and result received.
            Tokens and passwords are masked. Last 100 calls, kept in this browser only.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 shrink-0 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => apiLogEnabledStore.set(e.target.checked)} />
          Logging {enabled ? 'on' : 'paused'}
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 flex flex-wrap gap-2 items-center border-b border-gray-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by URL, method, status, Request-Id…"
            className="flex-1 min-w-[220px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
          />
          <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-bold">
            {([['all', `All (${entries.length})`], ['errors', `Errors (${errorCount})`], ['ok', 'Success']] as [StatusFilter, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} className={`px-3 py-1.5 rounded-md ${statusFilter === key ? 'bg-white text-[#002D72] shadow-sm' : 'text-gray-500'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => downloadJson(visible, `onestock_api_log_${Date.now()}`)} disabled={visible.length === 0} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Download</button>
          <button onClick={() => window.confirm('Clear the API log?') && clearApiLog()} disabled={entries.length === 0} className="px-3 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40">Clear</button>
        </div>

        {visible.length === 0 ? (
          <p className="p-12 text-center text-sm text-gray-400">{entries.length === 0 ? 'No API call logged yet.' : 'No call matches the filter.'}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map(e => {
              const isOpen = openId === e.id;
              return (
                <li key={e.id}>
                  <button onClick={() => setOpenId(isOpen ? null : e.id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${isOpen ? 'bg-blue-50/40' : ''}`}>
                    <span className="text-[10px] text-gray-400 font-mono w-20 shrink-0">{new Date(e.at).toLocaleTimeString()}</span>
                    <span className="text-[10px] font-bold w-14 shrink-0 text-[#002D72]">{e.method}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-12 text-center shrink-0 ${statusColor(e)}`}>{e.status ?? 'ERR'}</span>
                    <span className="font-mono text-xs text-gray-700 truncate flex-1">{e.url}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{e.durationMs} ms</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span>{new Date(e.at).toLocaleString()}</span>
                        {e.transportMethod && e.transportMethod !== e.method && <span>· sent as {e.transportMethod} + X-HTTP-Method-Override</span>}
                        {e.requestId && <span className="font-mono">· Request-Id: {e.requestId}</span>}
                        {e.truncated && <span className="text-amber-600">· large body truncated</span>}
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => copy(`curl-${e.id}`, toCurl(e))} className={smallBtn}>{copied === `curl-${e.id}` ? 'Copied!' : 'Copy cURL'}</button>
                          <button onClick={() => downloadJson(e, `onestock_call_${e.id}`)} className={smallBtn}>Download</button>
                        </div>
                      </div>
                      {e.error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 break-words">{e.error}</p>}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {([['Request payload', e.request, 'req'], ['Result', e.response, 'res']] as [string, unknown, string][]).map(([title, value, key]) => (
                          <div key={key} className="min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">{title}</p>
                              <button onClick={() => copy(`${key}-${e.id}`, pretty(value))} className="text-[10px] font-bold text-onestock-blue hover:underline">{copied === `${key}-${e.id}` ? 'Copied!' : 'Copy'}</button>
                            </div>
                            <pre className="max-h-96 overflow-auto bg-[#001F4D] text-blue-100 font-mono text-[11px] p-3 rounded-lg whitespace-pre-wrap break-all">{pretty(value)}</pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StepApiLog;
