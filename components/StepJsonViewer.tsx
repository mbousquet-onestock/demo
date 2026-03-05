import React, { useState } from 'react';
import { Product, AppSettings } from '../types';

interface StepJsonViewerProps {
  selectedProducts: Product[];
  settings: AppSettings;
  onBack: () => void;
}

const StepJsonViewer: React.FC<StepJsonViewerProps> = ({ selectedProducts, settings, onBack }) => {
  const [copySuccess, setCopySuccess] = useState(false);

  const generateJson = () => {
    const items = selectedProducts.map(p => ({
      id: p.sku,
      category_ids: [p.category],
      is_default: true,
      product_id: p.parentSku,
      features: {
        en: {
          color: [p.color],
          departement: [p.department],
          subdepartement: [p.subdepartment],
          image: [p.imageUrl],
          images_big: [p.imageUrl], // Mise à jour : images_big = [imageUrl]
          long_description: [p.description],
          name: [p.name],
          price: [p.price],
          size: [p.size],
          weight: [p.weight]
        },
        fr: {
          color: [p.color],
          departement: [p.department],
          subdepartement: [p.subdepartment],
          image: [p.imageUrl],
          images_big: [p.imageUrl], // Mise à jour : images_big = [imageUrl]
          long_description: [p.description],
          name: [p.name],
          price: [p.price],
          size: [p.size],
          weight: [p.weight]
        }
      },
      sales_channels_features: {
        [settings.salesChannel]: {
          compare_at_price: parseFloat(p.comparePrice || "0"),
          currency: p.currency,
          price: parseFloat(p.price)
        }
      },
      length: p.length,
      width: p.width,
      height: p.height,
      weight: p.weight
    }));

    return JSON.stringify({ items }, null, 4);
  };

  const jsonContent = generateJson();

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonContent);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `onestock_payload_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-[#002D72]">Step 3: JSON Payload Generation</h2>
          <p className="text-sm text-gray-500">Technical body for <strong>{selectedProducts.length}</strong> items using <strong>{settings.salesChannel}</strong> context.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onBack}
            className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Verification
          </button>
          <button 
            onClick={handleCopy}
            className={`px-4 py-2 text-sm font-bold border rounded-lg transition-all flex items-center gap-2 ${
              copySuccess ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-onestock-blue text-onestock-blue hover:bg-blue-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button 
            onClick={handleDownload}
            className="px-6 py-2 text-sm font-bold text-white bg-onestock-blue rounded-lg hover:bg-[#001F4D] shadow-lg transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download .json
          </button>
        </div>
      </div>

      <div className="bg-[#001F4D] rounded-2xl shadow-2xl p-6 border border-white/10 relative overflow-hidden group">
        <div className="absolute top-4 right-4 text-white/20 font-mono text-xs uppercase tracking-widest font-bold">API Payload Structure</div>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-4">
          <pre className="text-blue-100 font-mono text-sm leading-relaxed whitespace-pre-wrap">
            {jsonContent}
          </pre>
        </div>
      </div>

      <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-onestock-blue shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div className="text-xs text-blue-900/70 leading-relaxed">
          <strong>Integration Tip:</strong> The technical payload now correctly sets <code>images_big</code> as a single-element array matching the primary <code>image</code> URL.
        </div>
      </div>
    </div>
  );
};

export default StepJsonViewer;
