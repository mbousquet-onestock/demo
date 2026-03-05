
import React, { useState, useEffect } from 'react';
import { ProcessedSite, AppSettings } from '../types';
import { exportToOnestockApi } from '../services/apiService';

interface ExportModalProps {
  site: ProcessedSite;
  settings: AppSettings;
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ site, settings, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    const runExport = async () => {
      setStatus('running');
      addLog(`Starting export for ${site.hostname}...`);
      
      try {
        await exportToOnestockApi(site.products, settings, addLog);
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setError(err.message || 'Unknown error during export.');
        addLog(`ERROR: ${err.message}`);
      }
    };

    runExport();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001F4D]/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-900">OneStock API Dispatcher</h3>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mt-0.5">Pushing {site.products.length} articles</p>
          </div>
          {status !== 'running' && (
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              status === 'running' ? 'bg-blue-50 text-blue-600 animate-pulse' :
              status === 'success' ? 'bg-green-50 text-green-600' :
              status === 'error' ? 'bg-red-50 text-red-600' : 'bg-gray-100'
            }`}>
              {status === 'running' && <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              {status === 'success' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
              {status === 'error' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>}
            </div>
            <div>
              <p className="font-bold text-gray-900">
                {status === 'running' ? 'Synchronizing with Core API...' :
                 status === 'success' ? 'Integration successful' :
                 status === 'error' ? 'Export encountered an issue' : 'Initializing...'}
              </p>
              <p className="text-xs text-gray-500 italic">Target Site: {settings.siteId}</p>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 font-mono text-[10px] text-green-400 overflow-y-auto h-48 border border-gray-700 shadow-inner">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 leading-relaxed">
                <span className="opacity-50">&gt;</span> {log}
              </div>
            ))}
            {status === 'running' && <div className="inline-block w-2 h-3 bg-green-400 animate-pulse ml-1"></div>}
          </div>

          {status === 'error' && (
            <div className="p-3 bg-red-50 border border-red-100 rounded text-red-700 text-xs flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose}
            disabled={status === 'running'}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${
              status === 'success' ? 'bg-green-600 text-white hover:bg-green-700' :
              'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50'
            }`}
          >
            {status === 'success' ? 'Close and Return' : 'Back to History'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
