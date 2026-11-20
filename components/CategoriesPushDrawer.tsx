import React, { useMemo, useState } from 'react';
import { Product } from '../types';
import { Drawer } from './ProductApiTools';
import { onestockRequest, useApiTarget, missingTargetFields, isProductionTarget, describeCallError, ProxyResponseEnvelope, SITE_ID_VAR, TOKEN_VAR } from '../services/onestockClient';
import { savePayload, savedPayloadsStore, listProjects, getLastProject, setLastProject } from '../services/payloadStore';
import { createPersistedStore } from '../services/persistedStore';
import { hostImages } from '../services/imageHosting';

interface Props {
  products: Product[];
  onClose: () => void;
}

interface CategoryRow { id: string; name: string; image: string; count: number }

// Name / image typed for each category id, reused by the next payloads (this browser).
const categoryInfoStore = createPersistedStore<Record<string, { name?: string; image?: string }>>('onestock_category_info', {});

const labelClass = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';
const inputClass = 'w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue';
const cellInput = 'w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-onestock-blue';

// Product Manager → PUT /categories: a root category whose sub-categories are the categories of the selected
// articles (the items reference them with category_ids).
const CategoriesPushDrawer: React.FC<Props> = ({ products, onClose }) => {
  const target = useApiTarget();
  const targetMissing = missingTargetFields(target);
  const known = categoryInfoStore.use();
  const [rootId, setRootId] = useState(getLastProject().split('/')[0].trim());
  const [lang, setLang] = useState('fr');
  const [rows, setRows] = useState<CategoryRow[]>(() => {
    const byId = new Map<string, CategoryRow>();
    products.forEach(p => {
      const id = (p.category || '').trim();
      if (!id) return;
      const row = byId.get(id) || { id, name: known[id]?.name || id, image: known[id]?.image || p.imageUrl || '', count: 0 };
      row.count++;
      byId.set(id, row);
    });
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  });
  const withoutCategory = products.filter(p => !(p.category || '').trim()).length;
  const [name, setName] = useState('');
  const [project, setProject] = useState(getLastProject());
  const projects = listProjects(savedPayloadsStore.use());
  const [sending, setSending] = useState(false);
  const [hosting, setHosting] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; request: unknown; envelope: ProxyResponseEnvelope } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setRow = (id: string, patch: Partial<CategoryRow>) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const row = rows.find(r => r.id === id);
    if (row) categoryInfoStore.set(prev => ({ ...prev, [id]: { name: patch.name ?? row.name, image: patch.image ?? row.image } }));
  };

  const payload = useMemo(() => ({
    site_id: SITE_ID_VAR,
    token: TOKEN_VAR,
    category: {
      id: rootId.trim(),
      sub_category: rows.map(r => ({
        id: r.id,
        display_info: { [lang.trim() || 'fr']: { name: r.name.trim() || r.id, ...(r.image.trim() ? { image: r.image.trim() } : {}) } },
      })),
    },
  }), [rootId, rows, lang]);
  const blocking = !rootId.trim() ? 'Root category id required' : rows.length === 0 ? 'No category on the selected articles' : '';

  // Images copied as PNG to the database (public /img/… URL), like the article images.
  const hostAll = async () => {
    setHosting('Copying…');
    try {
      const { map, report } = await hostImages(rows.map(r => r.image).filter(Boolean), project.trim() || rootId.trim(), (d, t) => setHosting(`Copying ${d}/${t}…`));
      rows.forEach(r => { if (map.has(r.image)) setRow(r.id, { image: map.get(r.image)! }); });
      setNotice(`${report.copied} image(s) copied${report.failed.length ? `, ${report.failed.length} failed` : ''}.`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setHosting(null);
    }
  };

  const send = async () => {
    if (targetMissing || blocking) return;
    if (isProductionTarget(target) && !window.confirm(`PUT /categories on ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`)) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await onestockRequest({ method: 'PUT', path: '/categories', body: payload });
      setResult({ url: res.url, request: res.requestTemplate, envelope: res.envelope });
      if (!res.envelope.ok) setError(describeCallError(res.envelope));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  const save = (withResult: boolean) => {
    const label = name.trim() || `Categories ${rootId.trim()}`;
    setLastProject(project.trim());
    savePayload({
      name: label,
      project: project.trim() || undefined,
      source: 'products',
      method: 'PUT',
      path: '/categories',
      url: withResult ? result?.url : undefined,
      connectionName: target.siteId || undefined,
      request: withResult && result ? result.request : payload,
      response: withResult ? result?.envelope.body : undefined,
      status: withResult ? result?.envelope.status : undefined,
      durationMs: withResult ? result?.envelope.durationMs : undefined,
    });
    setNotice(`Saved as "${label}"${project.trim() ? ` in ${project.trim()}` : ''} (Projects / API Explorer → Saved payloads).`);
  };

  return (
    <Drawer title="Categories payload (PUT /categories)" onClose={onClose} wide>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          A root category whose sub-categories are the categories of the <strong>{products.length}</strong> selected article(s)
          (their <span className="font-mono">category_ids</span> in the /items payload).
          {withoutCategory > 0 && <span className="text-amber-700"> {withoutCategory} article(s) without category are left out.</span>}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Root category id</label>
            <input value={rootId} onChange={e => setRootId(e.target.value)} placeholder="Fnac-Darty" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Language (display_info)</label>
            <input value={lang} onChange={e => setLang(e.target.value)} placeholder="fr" className={inputClass} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={labelClass + ' mb-0'}>Sub-categories ({rows.length})</label>
            <button onClick={hostAll} disabled={!!hosting || rows.every(r => !r.image)} className="text-[11px] font-bold text-onestock-blue hover:underline disabled:opacity-40" title="Copy the images as PNG in the database (public URLs)">
              {hosting || 'Images → PNG'}
            </button>
          </div>
          {rows.length === 0 && <p className="text-xs text-amber-700">The selected articles have no category: set it in the table (Category column) or with Mass edit.</p>}
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[48px_1fr_1fr_2fr] gap-2 items-center p-2 bg-gray-50 rounded-lg border border-gray-100">
              {r.image ? <img src={r.image} alt="" className="w-12 h-12 object-contain bg-white rounded border border-gray-200" /> : <div className="w-12 h-12 rounded bg-white border border-dashed border-gray-300" />}
              <div>
                <p className="text-xs font-mono font-bold text-gray-800 break-all">{r.id}</p>
                <p className="text-[10px] text-gray-400">{r.count} article(s)</p>
              </div>
              <input value={r.name} onChange={e => setRow(r.id, { name: e.target.value })} placeholder="Name" className={cellInput} />
              <input value={r.image} onChange={e => setRow(r.id, { image: e.target.value.trim() })} placeholder="Image URL" className={cellInput + ' font-mono'} />
            </div>
          ))}
          <p className="text-[10px] text-gray-400">The image is the first article image of the category until another URL is typed; names and images are remembered for the next payloads.</p>
        </div>

        <div className="bg-[#001F4D] rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">PUT /categories</span>
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-[10px] font-bold text-white/50 hover:text-white">{copied ? 'COPIED!' : 'COPY'}</button>
          </div>
          <pre className="p-4 max-h-72 overflow-auto text-[11px] font-mono text-blue-100">{JSON.stringify(payload, null, 2)}</pre>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Payload name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={`Categories ${rootId.trim()}`} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Project</label>
            <input value={project} onChange={e => setProject(e.target.value)} list="categories-projects" placeholder="Client / Phase 1" className={inputClass} />
            <datalist id="categories-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
          </div>
        </div>

        {blocking && <p className="text-xs text-red-600">{blocking}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={send} disabled={!!targetMissing || !!blocking || sending} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
            {sending ? 'Sending…' : `PUT /categories${target.siteId ? ` → ${target.siteId}` : ''}`}
          </button>
          <button onClick={() => save(false)} disabled={!!blocking} className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 disabled:opacity-40">Save payload</button>
          {result && <button onClick={() => save(true)} className="px-4 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Save with the result</button>}
        </div>
        {targetMissing && <p className="text-xs text-amber-700">Missing in API Settings: {targetMissing}</p>}
        {result && result.envelope.ok && <p className="text-sm text-green-700">HTTP {result.envelope.status} — categories sent to {target.siteId}.</p>}
        {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
        {notice && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">{notice}</p>}
      </div>
    </Drawer>
  );
};

export default CategoriesPushDrawer;
