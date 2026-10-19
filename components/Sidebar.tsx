
import React from 'react';
import { AppStep } from '../types';
import { useApiTarget, missingTargetFields } from '../services/onestockClient';
import { dbStatusStore } from '../services/dbSync';
import { DB_STATUS_LABELS } from './DatabaseSync';

interface SidebarProps {
  currentStep: AppStep;
  onReset: () => void;
  onGoToSettings: () => void;
  onGoToStock: () => void;
  onGoToOrders: () => void;
  onGoToResults: () => void;
  onNavigate: (step: AppStep) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentStep, 
  onReset, 
  onGoToSettings, 
  onGoToStock,
  onGoToOrders,
  onGoToResults,
  onNavigate,
}) => {
  const apiTarget = useApiTarget();
  const apiMissing = missingTargetFields(apiTarget);
  const dbStatus = dbStatusStore.use();
  const steps: { id: AppStep; label: string; icon: string; parent?: AppStep }[] = [
    { id: AppStep.PROJECTS, label: 'Projects', icon: 'M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z' },
    { id: AppStep.STOCK_POINTS, label: 'Stock Points', icon: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z' },
    { id: AppStep.RESULTS, label: 'Product Manager', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25a2.25 2.25 0 01-2.25 2.25h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z' },
    { id: AppStep.STOCK_UPDATE, label: 'Stock Manager', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
    { id: AppStep.ORDER_GENERATION, label: 'Order Generator', icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z' },
    { id: AppStep.DELIVERY_ROUTES, label: 'Delivery Routes', icon: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12' },
    { id: AppStep.DELIVERY_CREATE, label: 'Create (AI)', parent: AppStep.DELIVERY_ROUTES, icon: 'M12 4.5v15m7.5-7.5h-15' },
    { id: AppStep.DELIVERY_METRICS, label: 'Metrics', parent: AppStep.DELIVERY_ROUTES, icon: 'M3 13.125h3.75v7.125H3v-7.125Zm6.75-4.5h3.75v11.625H9.75V8.625Zm6.75-4.5h3.75v16.125H16.5V4.125Z' },
    { id: AppStep.MANUAL_STEPS, label: 'Manual Steps', icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
    { id: AppStep.API_EXPLORER, label: 'API Explorer', icon: 'M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5' },
    { id: AppStep.API_LOG, label: 'API Logs', icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z' },
    { id: AppStep.SETTINGS, label: 'API Settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z' },
  ];

  const handleStepClick = (stepId: AppStep) => {
    if (stepId === AppStep.SETTINGS) onGoToSettings();
    if (stepId === AppStep.STOCK_UPDATE) onGoToStock();
    if (stepId === AppStep.ORDER_GENERATION) onGoToOrders();
    if (stepId === AppStep.RESULTS) onGoToResults();
    if (stepId === AppStep.API_EXPLORER || stepId === AppStep.API_LOG || stepId === AppStep.STOCK_POINTS || stepId === AppStep.MANUAL_STEPS || stepId === AppStep.PROJECTS || stepId === AppStep.DELIVERY_ROUTES || stepId === AppStep.DELIVERY_CREATE || stepId === AppStep.DELIVERY_METRICS) onNavigate(stepId);
  };

  return (
    <aside className="w-64 bg-[#001F4D] text-white flex flex-col shrink-0">
      <div className="p-6 border-b border-white/10 flex items-center gap-3 cursor-pointer" onClick={onReset}>
        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center">
            <div className="w-5 h-5 bg-[#002D72] rounded-sm transform rotate-45"></div>
        </div>
        <span className="font-bold text-lg tracking-tight">OneStock</span>
      </div>
      
      <nav className="flex-1 py-8 px-4">
        <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-6 px-4">
          Data Import Pipeline
        </div>
        <ul className="space-y-2">
          {steps.map((step) => {
            const isActive = currentStep === step.id;
            // Every menu entry stays available, even without selected products.
            const isClickable = true;

            return (
              <li key={step.id}>
                <div 
                  onClick={() => isClickable && handleStepClick(step.id)}
                  className={`flex items-center gap-4 rounded-lg transition-colors ${step.parent ? 'pl-12 pr-4 py-2 text-[13px]' : 'px-4 py-3'} ${
                    isActive ? 'bg-white/10 text-white shadow-sm' : 'text-white/60'
                  } ${isClickable ? 'cursor-pointer hover:bg-white/5 hover:text-white' : 'cursor-not-allowed opacity-30'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={step.parent ? 'w-4 h-4' : 'w-5 h-5'}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                  </svg>
                  <span className="text-sm font-medium">{step.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className="mx-4 mb-4 px-4 py-3 rounded-lg bg-white/5 text-xs cursor-pointer hover:bg-white/10"
        onClick={onGoToSettings}
        title={apiMissing ? `Missing in API Settings: ${apiMissing}` : apiTarget.baseUrl}
      >
        <div className="text-white/40 uppercase tracking-widest text-[9px] font-bold mb-1">OneStock API</div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${apiMissing ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
          <span className="truncate">{apiMissing ? 'Token / site to set' : apiTarget.siteId}</span>
          {!apiMissing && <span className="text-white/40 ml-auto">{apiTarget.version}</span>}
        </div>
      </div>

      <div
        className="mx-4 mb-4 px-4 py-2 rounded-lg bg-white/5 text-xs cursor-pointer hover:bg-white/10 flex items-center gap-2"
        onClick={onGoToSettings}
        title={dbStatus.message || 'Database sync'}
      >
        <span className={`w-2 h-2 rounded-full ${DB_STATUS_LABELS[dbStatus.state].dot}`}></span>
        <span className="text-white/70">{DB_STATUS_LABELS[dbStatus.state].label}</span>
      </div>

      <div className="p-6 text-white/30 text-xs border-t border-white/10">
        Hosting HWN8EUBNY<br/>
        User: mbousquet
      </div>
    </aside>
  );
};

export default Sidebar;
