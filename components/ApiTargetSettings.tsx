import React, { useState } from 'react';
import { AppSettings, OnestockApiVersion, SiteProfile, ApiUrlProfile, ApiTokenProfile } from '../types';
import {
  getApiTarget, missingTargetFields, buildUrl, onestockRequest, describeCallError,
} from '../services/onestockClient';
import { activeProfiles, selectSite, selectUrl, resolveUrl, newProfileId, tokenOf, DEFAULT_API_URLS } from '../services/apiProfiles';

interface ApiTargetSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';
const inputClass = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue';
const cellInput = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue';

// The single place where the OneStock target of every API call is set: URL, version, site and token.
const ApiTargetSettings: React.FC<ApiTargetSettingsProps> = ({ settings, onSave }) => {
    const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const target = getApiTarget(settings);
  const missing = missingTargetFields(target);
  const set = (patch: Partial<AppSettings>) => {
    setTestResult(null);
    onSave({ ...settings, ...patch });
  };
  const { sites, urls, tokens, site: activeSite, url: activeUrl } = activeProfiles(settings);
  const [shown, setShown] = useState<Set<string>>(new Set());

  // Editing the selected site / URL / shared token also updates the values used by the calls.
  const saveSites = (next: SiteProfile[], nextTokens: ApiTokenProfile[] = tokens) => {
    const patch: Partial<AppSettings> = { sites: next, apiUrls: urls, tokens: nextTokens };
    const active = activeSite && next.find(x => x.id === activeSite.id);
    if (active) Object.assign(patch, { siteId: active.siteId, token: tokenOf(active, nextTokens), ...(activeUrl ? { apiUrl: resolveUrl(activeUrl.url, active.siteId) } : {}) });
    set(patch);
  };
  const saveTokens = (next: ApiTokenProfile[]) =>
    // A deleted shared token: its sites keep an empty own token.
    saveSites(sites.map(x => (x.tokenId && !next.some(t => t.id === x.tokenId) ? { ...x, tokenId: undefined, token: '' } : x)), next);
  const editToken = (id: string, field: keyof ApiTokenProfile, value: string) => saveTokens(tokens.map(x => (x.id === id ? { ...x, [field]: value } : x)));
  const saveUrls = (next: ApiUrlProfile[]) => {
    const patch: Partial<AppSettings> = { sites, apiUrls: next, tokens };
    const active = activeUrl && next.find(x => x.id === activeUrl.id);
    if (active) patch.apiUrl = resolveUrl(active.url, settings.siteId);
    set(patch);
  };
  const editSite = (id: string, field: keyof SiteProfile, value: string) => saveSites(sites.map(x => (x.id === id ? { ...x, [field]: value.trim() === value ? value : value.trim() } : x)));
  const editUrl = (id: string, field: keyof ApiUrlProfile, value: string) => saveUrls(urls.map(x => (x.id === id ? { ...x, [field]: value } : x)));
  const missingDefaults = DEFAULT_API_URLS.filter(d => !urls.some(u => u.url === d.url));

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

      {/* Sites */}
      <section className="space-y-3 mb-8">
        <div className="flex items-center justify-between">
          <h3 className={labelClass + ' mb-0'}>Sites (selected in the top bar)</h3>
          <button onClick={() => saveSites([...sites, { id: newProfileId(), label: '', siteId: '', token: '' }])} className="text-xs font-bold text-onestock-blue hover:underline">+ Add a site</button>
        </div>
        {sites.length === 0 && <p className="text-xs text-gray-400">No site yet: add one with its label, site ID and token.</p>}
        {sites.map(x => {
          const isActive = activeSite?.id === x.id;
          return (
            <div key={x.id} className={`grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_2fr_auto] gap-2 items-center p-3 rounded-xl border ${isActive ? 'border-[#002D72] bg-blue-50/40' : 'border-gray-200'}`}>
              <input value={x.label} onChange={e => editSite(x.id, 'label', e.target.value)} placeholder="Label (e.g. Client X qualif)" className={cellInput} />
              <input value={x.siteId} onChange={e => editSite(x.id, 'siteId', e.target.value.trim())} placeholder="Site ID (c500)" className={cellInput + ' font-mono'} />
              <div className="flex gap-1">
                <select
                  value={x.tokenId || ''}
                  onChange={e => saveSites(sites.map(y => (y.id === x.id ? { ...y, tokenId: e.target.value || undefined } : y)))}
                  className={cellInput + (x.tokenId ? '' : ' max-w-[150px]')}
                  title="Own token of this site, or a token shared with other sites"
                >
                  <option value="">Own token</option>
                  {tokens.map(t => <option key={t.id} value={t.id}>Shared: {t.label || 'token'}</option>)}
                </select>
                {!x.tokenId && (
                  <>
                    <input
                      type={shown.has(x.id) ? 'text' : 'password'}
                      value={x.token}
                      onChange={e => editSite(x.id, 'token', e.target.value.trim())}
                      placeholder="Token (POST /login)"
                      autoComplete="off"
                      className={cellInput + ' font-mono'}
                    />
                    <button onClick={() => setShown(prev => { const n = new Set(prev); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })} className="px-2 text-[10px] font-bold text-onestock-blue">{shown.has(x.id) ? 'Hide' : 'Show'}</button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 justify-end">
                {isActive
                  ? <span className="text-[10px] font-bold text-[#002D72] bg-blue-100 px-2 py-1 rounded">SELECTED</span>
                  : <button onClick={() => set(selectSite({ ...settings, sites, apiUrls: urls, tokens }, x.id))} disabled={!x.siteId} className="px-2 py-1 text-[11px] font-bold text-onestock-blue border border-onestock-blue/40 rounded hover:bg-blue-50 disabled:opacity-40">Use</button>}
                <button
                  onClick={() => window.confirm(`Delete the site "${x.label || x.siteId}"?`) && saveSites(sites.filter(y => y.id !== x.id))}
                  className="px-1.5 text-gray-400 hover:text-red-600"
                  title="Delete"
                >✕</button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Shared tokens */}
      <section className="space-y-3 mb-8">
        <div className="flex items-center justify-between">
          <h3 className={labelClass + ' mb-0'}>Shared tokens (one token for several sites)</h3>
          <button onClick={() => saveTokens([...tokens, { id: newProfileId(), label: '', token: '' }])} className="text-xs font-bold text-onestock-blue hover:underline">+ Add a shared token</button>
        </div>
        {tokens.length === 0 && <p className="text-xs text-gray-400">None: each site uses its own token. Add a shared token, then pick it in the sites using it.</p>}
        {tokens.map(t => {
          const users = sites.filter(x => x.tokenId === t.id);
          return (
            <div key={t.id} className="grid grid-cols-1 md:grid-cols-[1fr_2.5fr_auto] gap-2 items-center p-3 rounded-xl border border-gray-200">
              <input value={t.label} onChange={e => editToken(t.id, 'label', e.target.value)} placeholder="Label (e.g. Integration user)" className={cellInput} />
              <div className="flex gap-1">
                <input
                  type={shown.has(t.id) ? 'text' : 'password'}
                  value={t.token}
                  onChange={e => editToken(t.id, 'token', e.target.value.trim())}
                  placeholder="Token (POST /login)"
                  autoComplete="off"
                  className={cellInput + ' font-mono'}
                />
                <button onClick={() => setShown(prev => { const n = new Set(prev); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} className="px-2 text-[10px] font-bold text-onestock-blue">{shown.has(t.id) ? 'Hide' : 'Show'}</button>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-[10px] text-gray-400" title={users.map(u => u.label || u.siteId).join(', ')}>{users.length} site(s)</span>
                <button
                  onClick={() => window.confirm(`Delete the shared token "${t.label || 'token'}"?${users.length ? ` ${users.length} site(s) will have no token.` : ''}`) && saveTokens(tokens.filter(y => y.id !== t.id))}
                  className="px-1.5 text-gray-400 hover:text-red-600"
                  title="Delete"
                >✕</button>
              </div>
            </div>
          );
        })}
      </section>

      {/* URLs */}
      <section className="space-y-3 mb-8">
        <div className="flex items-center justify-between">
          <h3 className={labelClass + ' mb-0'}>API URLs — <span className="normal-case font-mono">{'{site_id}'}</span> is replaced by the selected site</h3>
          <div className="flex gap-3">
            {missingDefaults.map(d => (
              <button key={d.id} onClick={() => saveUrls([...urls, { ...d, id: newProfileId() }])} className="text-xs font-bold text-gray-500 hover:underline">+ {d.label}</button>
            ))}
            <button onClick={() => saveUrls([...urls, { id: newProfileId(), label: '', url: 'https://' }])} className="text-xs font-bold text-onestock-blue hover:underline">+ Add a URL</button>
          </div>
        </div>
        {urls.map(x => {
          const isActive = activeUrl?.id === x.id;
          return (
            <div key={x.id} className={`grid grid-cols-1 md:grid-cols-[1fr_3fr_auto] gap-2 items-center p-3 rounded-xl border ${isActive ? 'border-[#002D72] bg-blue-50/40' : 'border-gray-200'}`}>
              <input value={x.label} onChange={e => editUrl(x.id, 'label', e.target.value)} placeholder="Label (e.g. Qualif)" className={cellInput} />
              <div>
                <input value={x.url} onChange={e => editUrl(x.id, 'url', e.target.value.trim())} placeholder="https://{site_id}.api.qualif.onestock-retail.com" className={cellInput + ' font-mono'} />
                {x.url.includes('{site_id}') && settings.siteId && <p className="text-[10px] text-gray-400 font-mono mt-1">→ {resolveUrl(x.url, settings.siteId)}</p>}
              </div>
              <div className="flex items-center gap-2 justify-end">
                {isActive
                  ? <span className="text-[10px] font-bold text-[#002D72] bg-blue-100 px-2 py-1 rounded">SELECTED</span>
                  : <button onClick={() => set(selectUrl({ ...settings, sites, apiUrls: urls, tokens }, x.id))} disabled={!/^https?:\/\/./.test(x.url)} className="px-2 py-1 text-[11px] font-bold text-onestock-blue border border-onestock-blue/40 rounded hover:bg-blue-50 disabled:opacity-40">Use</button>}
                <button
                  onClick={() => window.confirm(`Delete the URL "${x.label || x.url}"?`) && saveUrls(urls.filter(y => y.id !== x.id))}
                  className="px-1.5 text-gray-400 hover:text-red-600"
                  title="Delete"
                >✕</button>
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>API version</label>
          <select value={settings.apiVersion || 'v3'} onChange={e => set({ apiVersion: e.target.value as OnestockApiVersion })} className={inputClass}>
            {(['v1', 'v2', 'v3', 'v4'] as OnestockApiVersion[]).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className={labelClass}>Import sales channel</label>
          <input value={settings.salesChannel} onChange={e => set({ salesChannel: e.target.value })} className={inputClass} />
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
        Tokens are stored encrypted in the database (when the database is configured) and kept in this browser.
        "Test token" checks the selected site; when a token expires, paste the new one in its site.
      </p>
    </div>
  );
};

export default ApiTargetSettings;
