
import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { exportStockToOnestockApi } from '../services/apiService';

interface StockExportModalProps {
  stockData: { item_id: string; endpoint_id: string; quantity: number }[];
  settings: AppSettings;
  onClose: () => void;
}

const StockExportModal: React.FC<StockExportModalProps> = ({ stockData, settings, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    const runExport = async () => {
      setStatus('running');
      addLog(`Starting stock sync for ${stockData.length} records...`);
      
      try {
        await exportStockToOnestockApi(stockData, settings, addLog);
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setError(err.message || 'Unknown error during stock synchronization.');
        addLog(`ERROR: ${err.message}`);
      }
    };

    runExport();
  }, []);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#001F4D]/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh] border border-gray-200">
        <div className="px-6 py-5 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-onestock-blue">Inventory Sync Pipeline</h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Pushing {stockData.length} item-endpoint mapping entries</p>
          </div>
          {status !== 'running' && (
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex items-center gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
              status === 'running' ? 'bg-blue-50 text-blue-600 animate-pulse border border-blue-100' :
              status === 'success' ? 'bg-green-50 text-green-600 border border-green-100' :
              status === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-100'
            }`}>
              {status === 'running' && (
                <svg className="w-7 h-7 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {status === 'success' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>}
              {status === 'error' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">
                {status === 'running' ? 'Broadcasting Inventory Updates...' :
                 status === 'success' ? 'Stock Synchronized' :
                 status === 'error' ? 'Synchronization Failure' : 'Initializing...'}
              </p>
              <p className="text-xs text-gray-500 font-medium">Site ID: <span className="text-onestock-blue">{settings.siteId}</span></p>
            </div>
          </div>

          <div className="bg-[#001F4D] rounded-xl p-5 font-mono text-[11px] text-blue-300 overflow-y-auto h-56 shadow-inner border border-white/10">
            {logs.map((log, i) => (
              <div key={i} className="mb-1.5 leading-relaxed">
                <span className="opacity-30 mr-2">$</span> {log}
              </div>
            ))}
            {status === 'running' && <div className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1 align-middle"></div>}
          </div>

          {status === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-start gap-3 animate-in slide-in-from-top-1">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose}
            disabled={status === 'running'}
            className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
              status === 'success' ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg' :
              'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50'
            }`}
          >
            {status === 'success' ? 'Return to Manager' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockExportModal;
