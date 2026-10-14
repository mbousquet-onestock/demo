import React, { useState } from 'react';
import { dbStatusStore, getAccessKey, setAccessKey, syncNow, initDbSync, DbStatus } from '../services/dbSync';

export const DB_STATUS_LABELS: Record<DbStatus['state'], { label: string; dot: string }> = {
  disabled: { label: 'Local only', dot: 'bg-gray-400' },
  loading: { label: 'Loading…', dot: 'bg-blue-400' },
  synced: { label: 'Saved in database', dot: 'bg-emerald-400' },
  pending: { label: 'Changes pending…', dot: 'bg-amber-400' },
  saving: { label: 'Saving…', dot: 'bg-blue-400' },
  error: { label: 'Sync error', dot: 'bg-red-500' },
};

const DatabaseSync: React.FC = () => {
  const status = dbStatusStore.use();
  const [key, setKey] = useState(getAccessKey());
  const [busy, setBusy] = useState(false);
  const meta = DB_STATUS_LABELS[status.state];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3">Database (Vercel Postgres)</h3>
          <p className="text-gray-500 text-sm mt-2 max-w-2xl">
            Import history, products, settings, connection instances (with credentials and tokens) and saved payloads
            are stored in the project database through <code className="text-xs bg-gray-100 px-1 rounded">/api/data</code>.
            Every browser using the same access key shares the same data; this browser keeps a local copy as cache.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`}></span>
          <span className="text-sm font-bold text-gray-700">{meta.label}</span>
        </div>
      </div>

      {status.message && status.state !== 'synced' && (
        <p className={`text-sm mb-4 ${status.state === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{status.message}</p>
      )}
      {status.lastSyncAt && <p className="text-[11px] text-gray-400 mb-4">Last sync: {new Date(status.lastSyncAt).toLocaleString()}</p>}

      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Access key (APP_ACCESS_KEY of the Vercel project)</label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            autoComplete="off"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue"
          />
        </div>
        <button
          onClick={() => run(() => setAccessKey(key))}
          disabled={busy}
          className="px-4 py-3 bg-onestock-blue text-white font-bold text-xs rounded-xl hover:bg-[#001F4D] disabled:opacity-40"
        >
          Save key & connect
        </button>
        <button
          onClick={() => run(syncNow)}
          disabled={busy || status.state === 'disabled'}
          className="px-4 py-3 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-xl hover:bg-blue-50 disabled:opacity-40"
        >
          Sync now
        </button>
        <button
          onClick={() => run(() => initDbSync(true))}
          disabled={busy || status.state === 'disabled'}
          className="px-4 py-3 text-xs font-bold text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-40"
        >
          Reload from database
        </button>
      </div>
    </div>
  );
};

export default DatabaseSync;
