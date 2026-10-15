import React, { useEffect, useState } from 'react';
import { listImages, deleteImages, HostedImage } from '../services/imageHosting';

interface Props {
  // Project path ("" = images copied without a project).
  folder: string;
  includeSubfolders: boolean;
  // Called after a deletion (refreshes the counts of the project tree).
  onChanged: () => void;
}

const formatSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

// Images copied to the database for a project: view, open, delete one by one or in bulk.
const ProjectImages: React.FC<Props> = ({ folder, includeSubfolders, onChanged }) => {
  const [images, setImages] = useState<HostedImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const all = await listImages(folder);
      setImages(includeSubfolders ? all : all.filter(i => i.projects.includes(folder)));
    } catch (err: any) {
      setImages(null);
      setError(err?.message || String(err));
    }
  };
  useEffect(() => { setSelected(new Set()); setNotice(null); setImages(null); load(); }, [folder, includeSubfolders]);

  if (error) return <p className="text-[11px] text-gray-400 px-1">Images: {error}</p>;
  if (!images || images.length === 0) return null;

  const total = images.reduce((n, i) => n + i.size, 0);
  const title = folder || 'No project';
  const remove = async (ids?: string[]) => {
    const count = ids ? ids.length : images.length;
    if (!window.confirm(`Delete ${count} image(s) of "${title}"${includeSubfolders && !ids && images.some(i => !i.projects.includes(folder)) ? ' and its sub-folders' : ''}?\n\nPayloads already sent to OneStock with these URLs will show a broken image. An image also used by another project is only removed from this one.`)) return;
    setBusy(true);
    try {
      const r = await deleteImages(folder, ids, includeSubfolders);
      setNotice(`${r.deleted} image(s) deleted${r.detached > r.deleted ? `, ${r.detached - r.deleted} kept for other projects` : ''}.`);
      setSelected(new Set());
      await load();
      onChanged();
    } catch (err: any) {
      setNotice(`Error: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(!open)} className="flex-1 text-left">
          <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">Images in database</span>
          <span className="text-[11px] text-gray-400 ml-2">{images.length} image(s) · {formatSize(total)} {open ? '▾' : '▸'}</span>
        </button>
        {open && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
              <input type="checkbox" checked={selected.size === images.length} onChange={e => setSelected(e.target.checked ? new Set(images.map(i => i.id)) : new Set())} />
              All
            </label>
            <button onClick={() => remove([...selected])} disabled={busy || selected.size === 0} className="px-3 py-1.5 text-[11px] font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40">
              Delete selected ({selected.size})
            </button>
          </>
        )}
        <button onClick={() => remove()} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
          {busy ? 'Deleting…' : 'Delete all'}
        </button>
      </div>
      {notice && <p className="px-4 pt-2 text-[11px] text-gray-600">{notice}</p>}
      {open && (
        <ul className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {images.map(img => {
            const url = `${window.location.origin}${img.path}`;
            const other = img.projects.filter(p => p !== folder);
            return (
              <li key={img.id} className={`rounded-xl border p-2 text-[10px] ${selected.has(img.id) ? 'border-[#002D72] bg-blue-50/50' : 'border-gray-200'}`}>
                <label className="block cursor-pointer">
                  <input
                    type="checkbox"
                    className="mb-1"
                    checked={selected.has(img.id)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(img.id) : n.delete(img.id); return n; })}
                  />
                  <img src={img.path} alt="" loading="lazy" className="w-full h-24 object-contain bg-white rounded" />
                </label>
                <p className="mt-1 text-gray-500">{formatSize(img.size)} · {img.contentType.replace('image/', '')}</p>
                {other.length > 0 && <p className="text-gray-400 truncate" title={other.join(', ')}>also: {other.map(p => p || 'no project').join(', ')}</p>}
                <div className="flex gap-2 mt-1">
                  <a href={url} target="_blank" rel="noreferrer noopener" className="text-blue-700 hover:underline">Open</a>
                  <button onClick={() => navigator.clipboard?.writeText(url)} className="text-gray-600 hover:underline">Copy URL</button>
                  {img.sourceUrl && <a href={img.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-gray-400 hover:underline">Source</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ProjectImages;
