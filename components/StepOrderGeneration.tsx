
import React, { useState } from 'react';
import { Product, AppSettings } from '../types';
import { generateOrderPayloads, OrderGenerationRequest } from '../services/orderService';
import { generateAIIdentities } from '../services/geminiService';
import JSZip from 'jszip';

interface StepOrderGenerationProps {
  products: Product[];
  settings: AppSettings;
  onCancel: () => void;
}

const StepOrderGeneration: React.FC<StepOrderGenerationProps> = ({ products, settings, onCancel }) => {
  const getDefaultParentId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}${month}000001`;
  };

  const [request, setRequest] = useState<OrderGenerationRequest>({
    type: 'sfs',
    count: 3,
    productsPerOrder: 2,
    countryCode: settings.deliveryCountries[0]?.code || 'FR',
    salesChannel: settings.orderSalesChannels[0] || '',
    parentOrderId: getDefaultParentId(),
    orderIdPrefix: 'SFS-',
    startIndex: 1,
    endpointId: settings.stockEndpoints[0] || ''
  });

  const [generatedData, setGeneratedData] = useState<{ parent: any, subOrders: any[] } | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const handleStrategyChange = (t: 'sfs' | 'ckc' | 'ropis') => {
    const prefix = `${t.toUpperCase()}-`;
    setRequest(prev => ({ 
      ...prev, 
      type: t,
      orderIdPrefix: prefix
    }));
  };

  const incrementParentId = (current: string): string => {
    if (current.length < 7) return current;
    const prefix = current.substring(0, 6);
    const suffix = current.substring(6);
    const incrementedSuffix = (parseInt(suffix) + 1).toString().padStart(suffix.length, '0');
    return `${prefix}${incrementedSuffix}`;
  };

  const handleGenerate = async () => {
    if (products.length === 0) {
      alert("No products selected. Please go back and select items in Step 2.");
      return;
    }

    setIsGeneratingAI(true);
    try {
      const aiIdentities = await generateAIIdentities(request.countryCode || 'FR', request.count);
      const data = generateOrderPayloads(request, products, settings, aiIdentities);
      setGeneratedData(data);

      setRequest(prev => ({
        ...prev,
        startIndex: prev.startIndex + prev.count,
        parentOrderId: incrementParentId(prev.parentOrderId)
      }));

    } catch (err) {
      console.error("Failed to generate with AI:", err);
      const data = generateOrderPayloads(request, products, settings);
      setGeneratedData(data);
      
      setRequest(prev => ({
        ...prev,
        startIndex: prev.startIndex + prev.count,
        parentOrderId: incrementParentId(prev.parentOrderId)
      }));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleCopy = (content: any, label: string) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 4));
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleDownloadZip = async () => {
    if (!generatedData) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      zip.file("parent_order.json", JSON.stringify(generatedData.parent, null, 4));
      const ordersFolder = zip.folder("orders");
      generatedData.subOrders.forEach((order) => {
        const orderId = order.order.id;
        ordersFolder?.file(`${orderId}.json`, JSON.stringify(order, null, 4));
      });
      
      const content = await zip.generateAsync({ type: "blob" });
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", URL.createObjectURL(content));
      downloadAnchorNode.setAttribute("download", `onestock_orders_package_${Date.now()}.zip`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to generate ZIP archive.");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-[#002D72]">Customer Order Generation</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-green-100 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  AI-AUGMENTED
                </span>
                <span className="text-[10px] font-bold text-onestock-blue bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-blue-100">
                  {products.length} Items Selected
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-1">Simulate real customer traffic using AI-generated identities and technical payloads.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button 
              onClick={handleGenerate}
              disabled={isGeneratingAI || products.length === 0}
              className="px-6 py-2 bg-[#002D72] text-white font-bold rounded-lg hover:bg-[#001F4D] shadow-lg flex items-center gap-2 transition-all text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isGeneratingAI ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  AI Generating...
                </>
              ) : (
                <>
                  Generate Batch & Auto-Increment
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Order Strategy</label>
            <div className="grid grid-cols-3 gap-2">
              {(['sfs', 'ckc', 'ropis'] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => handleStrategyChange(t)}
                  className={`py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all border ${
                    request.type === t ? 'bg-[#002D72] border-[#002D72] text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Destination Country (AI Target)</label>
            <select 
              value={request.countryCode}
              onChange={e => setRequest(prev => ({ ...prev, countryCode: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
            >
              {settings.deliveryCountries.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sales Channel</label>
            <select 
              value={request.salesChannel}
              onChange={e => setRequest(prev => ({ ...prev, salesChannel: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
            >
              {settings.orderSalesChannels.map(sc => (
                <option key={sc} value={sc}>{sc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Parent Order ID (Auto-Incs)</label>
            <input 
              type="text"
              value={request.parentOrderId}
              onChange={e => setRequest(prev => ({ ...prev, parentOrderId: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 border-l-4 border-l-green-500 rounded-lg text-sm font-mono font-bold text-onestock-blue outline-none"
              placeholder="202503000001"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sub-Order ID Prefix</label>
            <input 
              type="text"
              value={request.orderIdPrefix}
              onChange={e => setRequest(prev => ({ ...prev, orderIdPrefix: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono font-bold text-onestock-blue outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Start Counter at (Auto-Incs)</label>
            <input 
              type="number" min="0"
              value={request.startIndex}
              onChange={e => setRequest(prev => ({ ...prev, startIndex: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 border-l-4 border-l-green-500 rounded-lg text-sm font-mono font-bold text-onestock-blue outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Batch Order Count</label>
            <input 
              type="number" min="1" max="50"
              value={request.count}
              onChange={e => setRequest(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Items per Order</label>
            <input 
              type="number" min="1" max="10"
              value={request.productsPerOrder}
              onChange={e => setRequest(prev => ({ ...prev, productsPerOrder: parseInt(e.target.value) || 1 }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Delivery Endpoint (CKC/ROPIS)</label>
            <select 
              value={request.endpointId}
              disabled={request.type === 'sfs'}
              onChange={e => setRequest(prev => ({ ...prev, endpointId: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue disabled:opacity-50 disabled:bg-gray-100"
            >
              {settings.stockEndpoints.map(ep => (
                <option key={ep} value={ep}>{ep}</option>
              ))}
            </select>
          </div>

          <div className="col-span-full mt-4">
             <div className="w-full p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center gap-2">
               <svg className="w-4 h-4 text-onestock-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               <span className="text-xs text-onestock-blue font-medium">Preview ID: <strong className="uppercase">{request.orderIdPrefix}{request.startIndex.toString().padStart(3, '0')}</strong></span>
             </div>
          </div>
        </div>
      </div>

      {generatedData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#002D72] flex items-center gap-2">
              Generated Order Package
              <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                1 Parent + {generatedData.subOrders.length} Sub-Orders
              </span>
            </h3>
            <button 
              onClick={handleDownloadZip}
              className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download ZIP Package
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-[#001F4D] rounded-xl overflow-hidden shadow-xl border border-white/10">
              <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
                <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Parent Order</span>
                <button 
                  onClick={() => handleCopy(generatedData.parent, 'parent')}
                  className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                >
                  {copyStatus === 'parent' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
              <div className="p-4 max-h-48 overflow-y-auto text-[11px] font-mono text-blue-100">
                <pre>{JSON.stringify(generatedData.parent, null, 2)}</pre>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedData.subOrders.map((order, idx) => (
                <div key={idx} className="bg-[#001F4D] rounded-xl overflow-hidden shadow-xl border border-white/10">
                  <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">{order.order.id}</span>
                    <button 
                      onClick={() => handleCopy(order, `sub-${idx}`)}
                      className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                    >
                      {copyStatus === `sub-${idx}` ? 'COPIED!' : 'COPY'}
                    </button>
                  </div>
                  <div className="p-4 max-h-60 overflow-y-auto text-[11px] font-mono text-blue-100">
                    <pre>{JSON.stringify(order, null, 2)}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepOrderGeneration;
