import React, { useState } from 'react';
import { hostImages, isLocalOrigin, needsHosting, HostingReport } from '../services/imageHosting';

interface Props {
  // Image URLs to copy (already hosted ones are skipped).
  urls: string[];
  // Applies original URL → hosted URL to the products.
  onDone: (map: Map<string, string>) => void;
  // Project the copied images are filed under (to find / delete them in Projects).
  project?: string;
  label?: string;
  className?: string;
}

// Copies the images to the app database and swaps the product image URLs for <app>/img/<id>.<ext>.
const HostImagesButton: React.FC<Props> = ({ urls, onDone, project = '', label = 'Copy images as PNG', className }) => {
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<HostingReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setReport(null);
    setError(null);
    if (isLocalOrigin() && !window.confirm('This app runs on localhost: the image URLs will not be reachable by OneStock. Copy anyway?')) return;
    setProgress('…');
    try {
      const { map, report } = await hostImages(urls, project.trim(), (d, t) => setProgress(`${d} / ${t}`));
      if (map.size) onDone(map);
      setReport(report);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setProgress(null);
    }
  };

  const pending = new Set(urls.filter(needsHosting)).size;
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        onClick={run}
        disabled={!!progress || pending === 0}
        title={`${pending ? `${pending} image(s) not yet copied as PNG` : 'All images are already hosted as PNG'} · project: ${project.trim() || 'none'}`}
        className={className || 'px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all disabled:opacity-40'}
      >
        {progress ? `Copying images ${progress}` : `${label}${pending ? ` (${pending})` : ''}`}
      </button>
      {report && (
        <span className={`text-[10px] ${report.failed.length ? 'text-amber-700' : 'text-emerald-700'}`} title={report.failed.map(f => `${f.url}: ${f.error}`).join('\n')}>
          {report.copied} image(s) copied as PNG{project.trim() ? ` to ${project.trim()}` : ''}{report.failed.length ? ` · ${report.failed.length} failed (hover for details)` : ''}
        </span>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
};

export default HostImagesButton;
