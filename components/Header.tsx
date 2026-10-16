import React from 'react';
import { AppSettings } from '../types';
import { activeProfiles, selectSite, selectUrl } from '../services/apiProfiles';
import { getApiTarget, isProductionTarget, missingTargetFields } from '../services/onestockClient';

interface HeaderProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  // Opens API Settings (sites and URLs are defined there).
  onManage: () => void;
}

const selectClass = 'h-9 pl-3 pr-8 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#002D72] max-w-[260px] truncate';

// Top bar: OneStock site and API URL used by every call of the app.
const Header: React.FC<HeaderProps> = ({ settings, onChange, onManage }) => {
  const { sites, urls, site, url } = activeProfiles(settings);
  const target = getApiTarget(settings);
  const missing = missingTargetFields(target);
  const prod = !!target.baseUrl && isProductionTarget(target);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between gap-4 px-8 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Site</span>
          <select
            value={site?.id || ''}
            onChange={e => e.target.value === '__manage__' ? onManage() : onChange(selectSite(settings, e.target.value))}
            className={selectClass}
            title={site ? `${site.label} — ${site.siteId}` : 'Select a site'}
          >
            {!site && <option value="">{settings.siteId ? `${settings.siteId} (not in the list)` : 'Select a site…'}</option>}
            {sites.map(s => <option key={s.id} value={s.id}>{s.label}{s.label !== s.siteId ? ` — ${s.siteId}` : ''}</option>)}
            <option value="__manage__">Manage sites…</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">API</span>
          <select
            value={url?.id || ''}
            onChange={e => e.target.value === '__manage__' ? onManage() : onChange(selectUrl(settings, e.target.value))}
            className={selectClass}
            title={target.baseUrl || 'Select an API URL'}
          >
            {!url && <option value="">{settings.apiUrl ? `${settings.apiUrl} (not in the list)` : 'Select a URL…'}</option>}
            {urls.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            <option value="__manage__">Manage URLs…</option>
          </select>
        </label>
        {missing ? (
          <button onClick={onManage} className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md">Missing: {missing}</button>
        ) : (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${prod ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`} title={target.baseUrl}>
            {prod ? 'PROD' : 'QUALIF'} · {target.version}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-semibold text-gray-900 leading-tight">M. Bousquet</div>
          <div className="text-xs text-gray-500 leading-tight">Admin User</div>
        </div>
        <div className="w-9 h-9 bg-[#002D72] rounded-full flex items-center justify-center text-white font-bold">MB</div>
      </div>
    </header>
  );
};

export default Header;
