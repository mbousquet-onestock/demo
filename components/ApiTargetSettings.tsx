import React, { useState } from 'react';
import { AppSettings, OnestockApiVersion } from '../types';
import {
  getApiTarget, missingTargetFields, buildUrl, onestockRequest, describeCallError,
  QUALIF_URL_TEMPLATE, PROD_URL_TEMPLATE, hasRealValue,
} from '../services/onestockClient';

interface ApiTargetSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';
const inputClass = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue';

// The single place where the OneStock target of every API call is set: URL, version, site and token.
const ApiTargetSettings: React.FC<ApiTargetSettingsProps> = ({ settings, onSave }) => {
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const target = getApiTarget(settings);
  const missing = missingTargetFields(target);
  const set = (patch: Partial<AppSettings>) => {
    setTestResult(null);
    onSave({ ...settings, ...patch });
  };
  // Placeholders such as {{site_id}} from older versions are shown as empty fields.
  const display = (value: string) => (hasRealValue(value) ? value : '');

  const fillUrl = (template: string) =>
    set({ apiUrl: template.replace('{site_id}', hasRealValue(settings.siteId) ? settings.siteId.trim() : '{site_id}') });

  const testToken = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { envelope } = await onestockRequest({ method: 'GET', path: '/sales_channels', body: {} });
      setTestResult(envelope.ok
        ? { ok: true, text: `Token OK — HTTP ${envelope.status} in ${envelope.durationMs} ms.` }
        : { ok: false, text: describeCallError(envelope) });
    } catch (err: any) {
      setTestResult({ ok: false, text: err?.message || String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <div className="border-b border-gray-100 pb-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">OneStock API access</h2>
          <p className="text-gray-500 text-sm mt-1">
            Every API call of the app (explorer, /items, stock, imports) uses this URL, site ID and token,
            through the Vercel proxy. In payloads they appear as <code className="text-xs bg-gray-100 px-1 rounded">{'{{site_id}}'}</code> and <code className="text-xs bg-gray-100 px-1 rounded">{'{{token}}'}</code>.
          </p>
        </div>
        <div className={`text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 ${missing ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
          {missing ? `Missing: ${missing}` : 'Ready'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">API URL</label>
            <div className="flex gap-2">
              <button onClick={() => fillUrl(QUALIF_URL_TEMPLATE)} className="text-[10px] font-bold text-onestock-blue hover:underline">Qualif URL</button>
              <button onClick={() => fillUrl(PROD_URL_TEMPLATE)} className="text-[10px] font-bold text-onestock-blue hover:underline">Prod URL</button>
            </div>
          </div>
          <input
            value={settings.apiUrl}
            onChange={e => set({ apiUrl: e.target.value })}
            placeholder="https://c500.api.qualif.onestock-retail.com"
            className={inputClass + ' font-mono'}
          />
        </div>
        <div>
          <label className={labelClass}>API version</label>
          <select value={settings.apiVersion || 'v3'} onChange={e => set({ apiVersion: e.target.value as OnestockApiVersion })} className={inputClass}>
            {(['v1', 'v2', 'v3', 'v4'] as OnestockApiVersion[]).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Site ID</label>
          <input value={display(settings.siteId)} onChange={e => set({ siteId: e.target.value.trim() })} placeholder="c500" className={inputClass} />
        </div>
        <div className="md:col-span-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Token</label>
            <button onClick={() => setShowToken(v => !v)} className="text-[10px] font-bold text-onestock-blue hover:underline">{showToken ? 'Hide' : 'Show'}</button>
          </div>
          <input
            type={showToken ? 'text' : 'password'}
            value={display(settings.token)}
            onChange={e => set({ token: e.target.value.trim() })}
            placeholder="Paste the token returned by POST /login"
            autoComplete="off"
            className={inputClass + ' font-mono'}
          />
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Import sales channel</label>
          <input value={settings.salesChannel} onChange={e => set({ salesChannel: e.target.value })} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Label</label>
          <input value={settings.apiName} onChange={e => set({ apiName: e.target.value })} className={inputClass} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={testToken}
          disabled={!!missing || testing}
          className="px-4 py-2.5 bg-onestock-blue text-white font-bold text-xs rounded-xl hover:bg-[#001F4D] disabled:opacity-40"
        >
          {testing ? 'Testing…' : 'Test token'}
        </button>
        {!missing && <span className="text-[11px] font-mono text-gray-400 break-all">{buildUrl(target, '/sales_channels')}</span>}
        {testResult && (
          <span className={`text-sm ${testResult.ok ? 'text-green-700' : 'text-red-600'} break-words`}>{testResult.text}</span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-4">
        The token is stored encrypted in the database (when the database is configured) and kept in this browser.
        When it expires, paste a new one here.
      </p>
    </div>
  );
};

export default ApiTargetSettings;
