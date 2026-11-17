import React, { useState } from 'react';
import { Drawer } from './ProductApiTools';
import { settingsStore } from '../services/appStores';
import { activeProfiles, tokenOf } from '../services/apiProfiles';
import { hasCredentials } from '../services/loginService';
import { hasRealValue } from '../services/onestockClient';
import { fetchSiteItems } from '../services/siteItemsService';

interface Props {
  hasProducts: boolean;
  onOpen: (items: any[], label: string, mode: 'replace' | 'append') => void;
  onClose: () => void;
}

const inputClass = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-onestock-blue';
const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1';
const list = (text: string) => text.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);

// Product Manager → items of another site of API Settings (GET /items on that site).
const SiteItemsImporter: React.FC<Props> = ({ hasProducts, onOpen, onClose }) => {
  const settings = settingsStore.use();
  const { sites, tokens, site: current } = activeProfiles(settings);
  const others = sites.filter(s => hasRealValue(s.siteId));
  const [siteId, setSiteId] = useState(others.find(s => s.id !== current?.id)?.id || others[0]?.id || '');
  const [itemIds, setItemIds] = useState('');
  const [productIds, setProductIds] = useState('');
  const [pattern, setPattern] = useState('');
  const [lang, setLang] = useState('');
  const [max, setMax] = useState(200);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[] | null>(null);

  const site = others.find(s => s.id === siteId);
  const canAuth = site && (hasRealValue(tokenOf(site, tokens)) || hasCredentials(site));

  const run = async () => {
    setError(null);
    setItems(null);
    setLoading('GET /items…');
    try {
      const res = await fetchSiteItems(siteId, { itemIds: list(itemIds), productIds: list(productIds), pattern, lang, max }, n => setLoading(`GET /items… ${n} item(s)`));
      setItems(res);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(null);
    }
  };
  const label = `GET /items · ${site?.label || site?.siteId}`;

  return (
    <Drawer title="Import items from another site" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Reads the items of a site of API Settings with <code className="text-xs bg-gray-100 px-1 rounded">GET /items</code>, with its own token
          (renewed with its user / password when refused), on the API URL selected in the top bar.
        </p>
        {others.length === 0 ? (
          <p className="text-sm text-amber-700">No site in API Settings: add the source site there first.</p>
        ) : (
          <>
            <div>
              <label className={labelClass}>Source site</label>
              <select value={siteId} onChange={e => { setSiteId(e.target.value); setItems(null); }} className={inputClass}>
                {others.map(s => <option key={s.id} value={s.id}>{s.label || s.siteId} — {s.siteId}{s.id === current?.id ? ' (selected site)' : ''}</option>)}
              </select>
              {site && !canAuth && <p className="text-[11px] text-red-600 mt-1">No token nor user / password for this site in API Settings.</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Item ids (optional)</label>
                <textarea value={itemIds} onChange={e => setItemIds(e.target.value)} rows={3} placeholder="0016, 0017…" className={inputClass + ' font-mono'} />
              </div>
              <div>
                <label className={labelClass}>Product ids (optional)</label>
                <textarea value={productIds} onChange={e => setProductIds(e.target.value)} rows={3} placeholder="Parent product ids" className={inputClass + ' font-mono'} />
              </div>
              <div>
                <label className={labelClass}>Search (pattern)</label>
                <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="Text in the items" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Language</label>
                  <input value={lang} onChange={e => setLang(e.target.value)} placeholder="fr" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Max items</label>
                  <input type="number" min={1} max={5000} value={max} onChange={e => setMax(Math.max(1, Math.min(5000, parseInt(e.target.value) || 1)))} className={inputClass} />
                </div>
              </div>
            </div>
            <button onClick={run} disabled={!site || !canAuth || !!loading} className="px-4 py-2 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
              {loading || `GET /items on ${site?.siteId || '…'}`}
            </button>
            {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
            {items && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <p className="text-sm text-gray-700"><strong>{items.length}</strong> item(s) from <strong>{site?.siteId}</strong>
                  {items.length > 0 && <span className="text-gray-400 font-mono text-xs"> · {items.slice(0, 8).map(i => i.id).join(', ')}{items.length > 8 ? '…' : ''}</span>}</p>
                {items.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={() => { onOpen(items, label, 'replace'); onClose(); }} className="px-3 py-1.5 text-xs font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D]">{hasProducts ? 'Replace list' : 'Open'}</button>
                    {hasProducts && <button onClick={() => { onOpen(items, label, 'append'); onClose(); }} className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Add to list</button>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
};

export default SiteItemsImporter;
