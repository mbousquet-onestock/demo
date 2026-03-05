
import React from 'react';
import { AppStep } from '../types';

interface SidebarProps {
  currentStep: AppStep;
  onReset: () => void;
  onGoToHistory: () => void;
  onNewImport: () => void;
  onGoToSettings: () => void;
  onGoToStock: () => void;
  onGoToOrders: () => void;
  onGoToResults: () => void;
  hasProducts: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentStep, 
  onReset, 
  onGoToHistory, 
  onNewImport, 
  onGoToSettings, 
  onGoToStock,
  onGoToOrders,
  onGoToResults,
  hasProducts
}) => {
  const steps = [
    { id: AppStep.HISTORY, label: 'Import History', icon: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.25c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25' },
    { id: AppStep.INPUT, label: 'Website Target', icon: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244' },
    { id: AppStep.RESULTS, label: 'Product Manager', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25a2.25 2.25 0 01-2.25 2.25h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z' },
    { id: AppStep.STOCK_UPDATE, label: 'Stock Manager', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
    { id: AppStep.ORDER_GENERATION, label: 'Order Generator', icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z' },
    { id: AppStep.SETTINGS, label: 'API Settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z' },
  ];

  const handleStepClick = (stepId: AppStep) => {
    if (stepId === AppStep.HISTORY) onGoToHistory();
    if (stepId === AppStep.INPUT) onNewImport();
    if (stepId === AppStep.SETTINGS) onGoToSettings();
    if (stepId === AppStep.STOCK_UPDATE) onGoToStock();
    if (stepId === AppStep.ORDER_GENERATION) onGoToOrders();
    if (stepId === AppStep.RESULTS) onGoToResults();
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
            const needsProducts = [AppStep.STOCK_UPDATE, AppStep.ORDER_GENERATION, AppStep.RESULTS].includes(step.id);
            const isClickable = [AppStep.HISTORY, AppStep.INPUT, AppStep.SETTINGS].includes(step.id) || (needsProducts && hasProducts);

            return (
              <li key={step.id}>
                <div 
                  onClick={() => isClickable && handleStepClick(step.id)}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-colors ${
                    isActive ? 'bg-white/10 text-white shadow-sm' : 'text-white/60'
                  } ${isClickable ? 'cursor-pointer hover:bg-white/5 hover:text-white' : 'cursor-not-allowed opacity-30'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                  </svg>
                  <span className="text-sm font-medium">{step.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-6 text-white/30 text-xs border-t border-white/10">
        Hosting HWN8EUBNY<br/>
        User: mbousquet
      </div>
    </aside>
  );
};

export default Sidebar;
