import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CapturedProduct, Product } from '../types';
import { Drawer } from './ProductApiTools';
import { captureInboxStore, productCapturesStore } from '../services/appStores';
import { savedPayloadsStore, listProjects, getLastProject, setLastProject, downloadJson } from '../services/payloadStore';
import { buildBookmarklet, parseCaptureInput, capturedToProducts, mergeCaptured } from '../utils/productCapture';

interface Props {
  defaultCurrency: string;
  onAdd: (products: Product[], label: string, mode: 'replace' | 'append', project?: string) => void;
  onClose: () => void;
}

const inputClass = 'w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#002D72]';
const keyOf = (p: CapturedProduct, i: number) => `${i}:${p.sku || p.url || p.name}`;

// Product sheets read on a client website: bookmarklet run by the user in their own browser (no server-side robot),
// or a pasted page source. Captures can be saved per project (database) and added to the Product Manager.
const ProductCaptureDrawer: React.FC<Props> = ({ defaultCurrency, onAdd, onClose }) => {
  const inbox = captureInboxStore.use();
  const saved = productCapturesStore.use();
  const payloads = savedPayloadsStore.use();
  const projects = useMemo(() => listProjects([...saved, ...payloads]), [saved, payloads]);

  const bookmarklet = useMemo(() => buildBookmarklet(window.location.origin), []);
  const linkRef = useRef<HTMLAnchorElement>(null);
  // React refuses javascript: URLs in href: set it on the element directly.
  useEffect(() => { linkRef.current?.setAttribute('href', bookmarklet); }, [bookmarklet]);
  const [copied, setCopied] = useState(false);

  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteNotice, setPasteNotice] = useState<{ ok: boolean; text: string; links?: string[] } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [project, setProject] = useState(getLastProject());
  const [notice, setNotice] = useState<string | null>(null);

  const keys = inbox.map(keyOf);
  const selectedProducts = inbox.filter((p, i) => selected.has(keys[i]));
  const target = selectedProducts.length ? selectedProducts : inbox;

  const parsePaste = () => {
    try {
      const { products, links } = parseCaptureInput(pasteText, pasteUrl.trim());
      if (products.length) {
        captureInboxStore.set(prev => mergeCaptured(prev, products));
        setPasteText('');
        setPasteNotice({ ok: true, text: `${products.length} product(s) added to the captured list.` });
      } else {
        setPasteNotice({ ok: false, text: links.length ? `No product sheet in this source, but ${links.length} product link(s): open them and capture each page.` : 'No product found (no schema.org / OpenGraph product data in this source).', links });
      }
    } catch (err: any) {
      setPasteNotice({ ok: false, text: `Unreadable content: ${err?.message || err}` });
    }
  };

  const remove = () => {
    captureInboxStore.set(prev => prev.filter((p, i) => !selected.has(keyOf(p, i))));
    setSelected(new Set());
  };

  const save = () => {
    const now = new Date().toISOString();
    const set = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim() || `Capture ${new Date().toLocaleString()}`,
      project: project.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      products: target,
    };
    productCapturesStore.set(prev => [set, ...prev]);
    if (project.trim()) setLastProject(project.trim());
    setNotice(`Saved "${set.name}" (${target.length} product(s)).`);
    setName('');
  };

  const add = (mode: 'replace' | 'append', list = target, label = 'Website capture', proj = project.trim() || undefined) => {
    const products = capturedToProducts(list, defaultCurrency);
    onAdd(products, label, mode, proj);
  };

  return (
    <Drawer title="Capture product sheets from a website" onClose={onClose} wide>
      <div className="space-y-6">
        {/* 1. Bookmarklet */}
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-[#002D72] uppercase tracking-widest">1. From your browser (recommended)</h4>
          <p className="text-xs text-gray-600">
            The capture runs in <strong>your own browser</strong>, on the page you are viewing like any visitor: no robot, so no bot blocking.
            It reads the product data published by the site (schema.org, OpenGraph), the specification tables and the gallery images.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              ref={linkRef}
              onClick={e => { e.preventDefault(); setNotice('Drag the button to your bookmarks bar, then click the bookmark on the client website.'); }}
              className="px-4 py-2 text-sm font-bold text-white bg-[#002D72] rounded-lg cursor-grab select-none"
              title="Drag me to the bookmarks bar"
            >⇪ OneStock capture</a>
            <button
              onClick={async () => { try { await navigator.clipboard.writeText(bookmarklet); setCopied(true); } catch { /* ignore */ } }}
              className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >{copied ? 'Copied' : 'Copy the bookmark code'}</button>
          </div>
          <ol className="text-xs text-gray-500 list-decimal ml-5 space-y-0.5">
            <li>Drag <strong>⇪ OneStock capture</strong> to the bookmarks bar (or create a bookmark and paste the copied code as its URL).</li>
            <li>On the client website, open a <strong>product sheet</strong> or a <strong>category page</strong>, then click the bookmark.</li>
            <li>On a category page, it offers to read the product pages one after another (max 50, one every 0.8 s), in your session.</li>
            <li>The products open here, in the captured list below (a tool tab named "onestock_capture" is used).</li>
          </ol>
        </section>

        {/* 2. Paste */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-[#002D72] uppercase tracking-widest">2. Or paste the page source</h4>
          <p className="text-xs text-gray-500">On the product page: <span className="font-mono">Ctrl+U</span> (view source) → select all → copy, and paste it here. The JSON shown by the bookmark when the tool did not answer can be pasted here too.</p>
          <input value={pasteUrl} onChange={e => setPasteUrl(e.target.value)} placeholder="Page URL (for the relative links / images)" className={inputClass} />
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="<html>… or {&quot;products&quot;: …}" className={inputClass + ' h-28 font-mono text-[11px]'} />
          <div className="flex items-center gap-3">
            <button onClick={parsePaste} disabled={!pasteText.trim()} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">Read the products</button>
            {pasteNotice && <span className={`text-xs ${pasteNotice.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{pasteNotice.text}</span>}
          </div>
          {pasteNotice?.links && pasteNotice.links.length > 0 && (
            <ul className="max-h-32 overflow-y-auto text-[11px] font-mono bg-gray-50 border border-gray-100 rounded-lg p-2">
              {pasteNotice.links.slice(0, 100).map(l => <li key={l}><a href={l} target="_blank" rel="noreferrer noopener" className="text-blue-700 hover:underline break-all">{l}</a></li>)}
            </ul>
          )}
        </section>

        {/* 3. Captured list */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h4 className="text-xs font-bold text-[#002D72] uppercase tracking-widest flex-1">3. Captured products ({inbox.length})</h4>
            {inbox.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={selected.size === inbox.length} onChange={e => setSelected(e.target.checked ? new Set(keys) : new Set())} />
                All
              </label>
            )}
          </div>
          {inbox.length === 0 ? (
            <p className="p-6 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">Nothing captured yet.</p>
          ) : (
            <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
              {inbox.map((p, i) => {
                const k = keys[i];
                const isOpen = open === k;
                return (
                  <li key={k} className="p-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selected.has(k)} onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(k) : n.delete(k); return n; })} />
                      {p.images[0]
                        ? <img src={p.images[0]} alt="" referrerPolicy="no-referrer" className="w-12 h-12 object-contain rounded border border-gray-100 bg-white shrink-0" />
                        : <div className="w-12 h-12 rounded bg-gray-100 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{p.name || p.sku}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {[p.brand, p.sku && `SKU ${p.sku}`, p.gtin && `EAN ${p.gtin}`, p.price && `${p.price} ${p.currency}`].filter(Boolean).join(' · ')}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {p.images.length} image(s) · {p.characteristics.length} characteristic(s) · {p.variants.length} variant(s) · {p.source}
                        </p>
                      </div>
                      <button onClick={() => setOpen(isOpen ? null : k)} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50 shrink-0">{isOpen ? 'Hide' : 'View'}</button>
                    </div>
                    {isOpen && (
                      <div className="mt-3 space-y-3 text-xs">
                        {(p.url || p.page) && <a href={p.url || p.page} target="_blank" rel="noreferrer noopener" className="text-blue-700 hover:underline break-all">{p.url || p.page}</a>}
                        {p.category && <p className="text-gray-500">Category: {p.category}</p>}
                        {p.description && <p className="text-gray-700 whitespace-pre-line max-h-40 overflow-y-auto">{p.description}</p>}
                        {p.images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {p.images.map(src => <a key={src} href={src} target="_blank" rel="noreferrer noopener"><img src={src} alt="" referrerPolicy="no-referrer" className="w-20 h-20 object-contain rounded border border-gray-100 bg-white" /></a>)}
                          </div>
                        )}
                        {p.characteristics.length > 0 && (
                          <table className="w-full text-[11px]">
                            <tbody>
                              {p.characteristics.map((c, j) => (
                                <tr key={j} className="border-b border-gray-50"><td className="py-1 pr-3 font-bold text-gray-600 w-1/3">{c.name}</td><td className="py-1 text-gray-800">{c.value}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {p.variants.length > 0 && (
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-left text-gray-400"><th>SKU</th><th>EAN</th><th>Color</th><th>Size</th><th>Price</th></tr></thead>
                            <tbody>
                              {p.variants.map((v, j) => (
                                <tr key={j} className="border-b border-gray-50 font-mono"><td>{v.sku}</td><td>{v.gtin}</td><td>{v.color}</td><td>{v.size}</td><td>{v.price} {v.currency}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {inbox.length > 0 && (
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
              <p className="text-[11px] text-gray-500">{selectedProducts.length ? `${selectedProducts.length} selected product(s)` : `All ${inbox.length} product(s)`} — a product with variants gives one article per variant (same product_id).</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => add('append')} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D]">Add to Product Manager</button>
                <button onClick={() => add('replace')} className="px-3 py-2 text-xs font-bold text-[#002D72] border border-[#002D72]/30 rounded-lg hover:bg-blue-50">Replace the Product Manager list</button>
                <button onClick={() => downloadJson({ products: target }, `capture_${Date.now()}.json`)} className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-white">Download JSON</button>
                {selectedProducts.length > 0 && <button onClick={remove} className="px-3 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Remove</button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Capture name" className={inputClass} />
                <input value={project} onChange={e => setProject(e.target.value)} list="capture-projects" placeholder="Project (e.g. Client/Phase 1)" className={inputClass} />
                <button onClick={save} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save</button>
                <datalist id="capture-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
              </div>
              {notice && <p className="text-xs text-emerald-700">{notice}</p>}
            </div>
          )}
        </section>

        {/* 4. Saved captures */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-[#002D72] uppercase tracking-widest">4. Saved captures ({saved.length})</h4>
          {saved.length === 0 ? (
            <p className="text-xs text-gray-400">Saved captures are stored in the database, per project.</p>
          ) : (
            <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              {saved.map(s => (
                <li key={s.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{s.project || 'No project'} · {s.products.length} product(s) · {new Date(s.updatedAt).toLocaleString()}</p>
                  </div>
                  <button onClick={() => captureInboxStore.set(prev => mergeCaptured(prev, s.products))} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded hover:bg-gray-50">To the list</button>
                  <button onClick={() => add('append', s.products, s.name, s.project)} className="px-2 py-1 text-[11px] font-bold text-white bg-[#002D72] rounded hover:bg-[#001F4D]">Add to Product Manager</button>
                  <button onClick={() => window.confirm(`Delete the capture "${s.name}"?`) && productCapturesStore.set(prev => prev.filter(x => x.id !== s.id))} className="px-2 py-1 text-[11px] font-bold text-red-600">Delete</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
};

export default ProductCaptureDrawer;
