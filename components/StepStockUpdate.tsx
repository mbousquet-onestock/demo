
import React, { useState, useMemo } from 'react';
import { Product, AppSettings } from '../types';
import StockExportModal from './StockExportModal';

interface StepStockUpdateProps {
  products: Product[];
  settings: AppSettings;
  onCancel: () => void;
}

const StepStockUpdate: React.FC<StepStockUpdateProps> = ({ products, settings, onCancel }) => {
  const [viewMode, setViewMode] = useState<'table' | 'payload'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExportingApi, setIsExportingApi] = useState(false);
  const [stockLevels, setStockLevels] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    products.forEach(p => {
      initial[p.sku] = {};
      settings.stockEndpoints.forEach(ep => {
        initial[p.sku][ep] = 0;
      });
    });
    return initial;
  });

  const [payloadContent, setPayloadContent] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const lowSearch = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lowSearch) ||
      p.sku.toLowerCase().includes(lowSearch)
    );
  }, [products, searchTerm]);

  const handleStockChange = (sku: string, endpoint: string, val: string) => {
    const numVal = parseInt(val) || 0;
    setStockLevels(prev => ({
      ...prev,
      [sku]: {
        ...prev[sku],
        [endpoint]: numVal
      }
    }));
  };

  const applyToColumn = (endpoint: string) => {
    const valStr = prompt(`Enter stock quantity to apply to all visible rows for "${endpoint}":`, "0");
    if (valStr === null) return;
    const val = parseInt(valStr) || 0;

    setStockLevels(prev => {
      const updated = { ...prev };
      filteredProducts.forEach(p => {
        if (!updated[p.sku]) updated[p.sku] = {};
        updated[p.sku][endpoint] = val;
      });
      return updated;
    });
  };

  const fillRandom = () => {
    setStockLevels(prev => {
      const updated = { ...prev };
      products.forEach(p => {
        settings.stockEndpoints.forEach(ep => {
          const isZero = Math.random() < 0.5;
          updated[p.sku][ep] = isZero ? 0 : Math.floor(Math.random() * 25) + 1;
        });
      });
      return updated;
    });
  };

  const clearAll = () => {
    setStockLevels(prev => {
      const updated = { ...prev };
      products.forEach(p => {
        settings.stockEndpoints.forEach(ep => {
          updated[p.sku][ep] = 0;
        });
      });
      return updated;
    });
  };

  const getStockDataArray = () => {
    const formattedStocks: { item_id: string; endpoint_id: string; quantity: number }[] = [];
    Object.entries(stockLevels).forEach(([sku, endpoints]) => {
      Object.entries(endpoints).forEach(([ep, qty]) => {
        formattedStocks.push({
          item_id: sku,
          endpoint_id: ep,
          quantity: qty
        });
      });
    });
    return formattedStocks;
  };

  const generatePayload = () => {
    const formattedStocks = getStockDataArray();
    const payload = {
      token: settings.token,
      site_id: settings.siteId,
      import: {
        incremental: false
      },
      stocks: formattedStocks
    };

    const json = JSON.stringify(payload, null, 4);
    setPayloadContent(json);
    setViewMode('payload');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadContent);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(payloadContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `onestock_stock_payload_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  if (viewMode === 'payload') {
    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-[#002D72]">Stock Payload Generation</h2>
            <p className="text-sm text-gray-500">Technical body for inventory synchronization across <strong>{settings.stockEndpoints.length}</strong> endpoints.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setViewMode('table')}
              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to Table
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
              className="px-6 py-2 text-sm font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] shadow-lg transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download .json
            </button>
          </div>
        </div>

        <div className="bg-[#001F4D] rounded-2xl shadow-2xl p-6 border border-white/10 relative overflow-hidden group">
          <div className="absolute top-4 right-4 text-white/20 font-mono text-xs uppercase tracking-widest font-bold">STOCK PAYLOAD STRUCTURE</div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-4">
            <pre className="text-blue-100 font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {payloadContent}
            </pre>
          </div>
        </div>

        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-onestock-blue shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="text-xs text-blue-900/70 leading-relaxed">
            <strong>Integration Tip:</strong> This payload follows the standard OneStock stock import format. Ensure your <code>endpoint_id</code> values match your project's configuration.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {isExportingApi && (
        <StockExportModal 
          stockData={getStockDataArray()} 
          settings={settings} 
          onClose={() => setIsExportingApi(false)} 
        />
      )}

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between bg-white px-8 py-6 rounded-2xl border border-gray-200 shadow-sm gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#002D72]">Inventory Management</h2>
          <p className="text-sm text-gray-500 mt-1">Assign stock quantities per <strong>Endpoint ID</strong> across {products.length} items.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px]">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text"
              placeholder="Search SKU or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-onestock-blue transition-all"
            />
          </div>

          <button onClick={onCancel} className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-red-500 transition-colors">Cancel</button>
          <button onClick={fillRandom} className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all">Randomize (50% zeroes)</button>
          
          <button 
            onClick={generatePayload}
            className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all"
          >
            Review JSON
          </button>

          <button 
            onClick={() => setIsExportingApi(true)}
            disabled={!settings.token || !settings.siteId}
            className="px-6 py-2 bg-[#002D72] text-white font-bold rounded-lg hover:bg-[#001F4D] shadow-lg flex items-center gap-2 transition-all text-sm disabled:opacity-30"
          >
            API Synchronize
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-64">Item Identifier (SKU)</th>
              {settings.stockEndpoints.map(ep => (
                <th key={ep} className="px-4 py-4 text-[10px] font-bold text-[#002D72] uppercase tracking-widest text-center border-l border-gray-100">
                  <div className="flex flex-col items-center gap-2">
                    <span>{ep}</span>
                    <button 
                      onClick={() => applyToColumn(ep)}
                      className="text-[9px] bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-400 hover:text-onestock-blue hover:border-onestock-blue transition-all"
                      title="Apply value to all visible rows"
                    >
                      Apply to all
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredProducts.map(p => (
              <tr key={p.sku} className="hover:bg-blue-50/10 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded border border-gray-100 overflow-hidden shrink-0">
                      <img 
                        src={p.imageUrl} 
                        alt="" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/002D72/white?text=Err'; }}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 truncate max-w-[150px]" title={p.name}>{p.name}</div>
                      <code className="text-[10px] text-gray-400 font-bold">{p.sku}</code>
                    </div>
                  </div>
                </td>
                {settings.stockEndpoints.map(ep => (
                  <td key={ep} className="px-4 py-4 border-l border-gray-50">
                    <input 
                      type="number"
                      min="0"
                      value={stockLevels[p.sku]?.[ep] ?? 0}
                      onChange={(e) => handleStockChange(p.sku, ep, e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-transparent focus:border-onestock-blue focus:bg-white rounded-lg text-center font-mono font-bold text-onestock-blue outline-none transition-all"
                    />
                  </td>
                ))}
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={settings.stockEndpoints.length + 1} className="px-6 py-12 text-center text-gray-400 italic">
                  No products found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StepStockUpdate;
