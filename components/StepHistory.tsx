
import React, { useState, useRef } from 'react';
import { ProcessedSite, AppSettings, Product } from '../types';
import ExportModal from './ExportModal';

interface StepHistoryProps {
  history: ProcessedSite[];
  onViewItem: (site: ProcessedSite) => void;
  onNewImport: () => void;
  settings: AppSettings;
  onImportJson: (site: ProcessedSite) => void;
}

const StepHistory: React.FC<StepHistoryProps> = ({ history, onViewItem, onNewImport, settings, onImportJson }) => {
  const [exportSite, setExportSite] = useState<ProcessedSite | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJson = (site: ProcessedSite) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(site, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `onestock_export_${site.hostname}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Detect Standard ProcessedSite format
        if (data.id && data.products && Array.isArray(data.products)) {
          onImportJson(data);
        } 
        // Detect OneStock API Payload format (exported from Step 2)
        else if (data.items && Array.isArray(data.items)) {
          const reconstructedProducts: Product[] = data.items.map((item: any) => {
            const en = item.features?.en || {};
            const scf = item.sales_channels_features || {};
            const channelKey = Object.keys(scf)[0];
            const channelData = channelKey ? scf[channelKey] : {};

            return {
              id: item.id,
              sku: item.id,
              parentSku: item.product_id || '',
              name: en.name?.[0] || 'Imported Product',
              description: en.long_description?.[0] || '',
              imageUrl: en.image?.[0] || '',
              productUrl: '#imported',
              price: en.price?.[0]?.toString() || channelData.price?.toString() || '0',
              comparePrice: channelData.compare_at_price?.toString() || '0',
              currency: channelData.currency || 'EUR',
              color: en.color?.[0] || '',
              size: en.size?.[0] || '',
              category: item.category_ids?.[0] || '',
              department: en.departement?.[0] || '', // match spelling from StepResults export
              subdepartment: en.subdepartement?.[0] || '', // match spelling from StepResults export
              weight: item.weight || 0,
              length: item.length || 0,
              width: item.width || 0,
              height: item.height || 0,
              images_big: en.images_big || []
            };
          });

          const site: ProcessedSite = {
            id: `imported-${Date.now()}`,
            url: 'Imported from OneStock JSON',
            hostname: file.name.replace('.json', ''),
            date: new Date().toLocaleString(),
            products: reconstructedProducts
          };
          onImportJson(site);
        } else {
          alert("Error: Unrecognized JSON format. File must be a OneStock items payload or a previous history export.");
        }
      } catch (err) {
        alert("Critical Error: Failed to parse the JSON file.");
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {exportSite && (
        <ExportModal 
          site={exportSite} 
          settings={settings} 
          onClose={() => setExportSite(null)} 
        />
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".json" 
        className="hidden" 
      />

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Step 0: Data Management</h2>
          <p className="text-gray-500 mt-2">Manage processed catalogs or re-import OneStock technical payloads.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-white border border-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Import JSON Payload
          </button>
          <button 
            onClick={onNewImport}
            className="bg-[#002D72] text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-[#001F4D] transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            New Import
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-20 text-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No sites processed yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-8">Start your first AI catalog scan or import a previously exported .json result.</p>
          <button 
            onClick={onNewImport}
            className="text-onestock-blue font-bold hover:underline"
          >
            Launch my first import →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {history.map((site) => (
            <div 
              key={site.id} 
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all flex items-center group relative overflow-hidden"
            >
              <div 
                onClick={() => onViewItem(site)}
                className="flex items-center flex-1 cursor-pointer"
              >
                <div className="w-12 h-12 bg-blue-50 text-onestock-blue rounded-lg flex items-center justify-center font-bold text-lg group-hover:bg-onestock-blue group-hover:text-white transition-colors shrink-0">
                  {site.hostname.charAt(0).toUpperCase()}
                </div>
                <div className="ml-6 flex-1">
                  <h4 className="font-bold text-gray-900 group-hover:text-onestock-blue transition-colors">{site.hostname}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{site.url}</p>
                </div>
                <div className="px-6 text-right">
                  <div className="text-xs font-bold text-gray-900">{site.products.length} Items</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-tighter mt-1">Extracted on {site.date.split(',')[0]}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExportJson(site);
                  }}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export JSON
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportSite(site);
                  }}
                  disabled={!settings.token || !settings.siteId}
                  className="px-4 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  API Export
                </button>
                <div 
                  onClick={() => onViewItem(site)}
                  className="p-2 text-gray-300 group-hover:text-onestock-blue cursor-pointer transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </div>
              </div>

              {!settings.token && (
                <div className="absolute top-0 right-0 bg-yellow-400 text-[8px] font-bold text-white px-2 py-0.5 uppercase tracking-tighter">
                  API Token Missing
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StepHistory;
