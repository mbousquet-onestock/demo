
import React from 'react';

interface StepSuccessProps {
  onReset: () => void;
  url: string;
}

const StepSuccess: React.FC<StepSuccessProps> = ({ onReset, url }) => {
  const hostname = new URL(url).hostname;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center max-w-2xl mx-auto mt-12 animate-in fade-in zoom-in duration-500">
      <div className="mb-8">
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4 font-display">Test Import Complete</h2>
        <p className="text-gray-500 mb-8 leading-relaxed">
          The product record has been successfully mirrored and stored. The image is now local to your OneStock hosting environment at <strong>{hostname}</strong>.
        </p>
      </div>

      <div className="p-6 bg-blue-50/30 border border-blue-100 rounded-xl text-left mb-8">
        <h4 className="text-[11px] font-bold text-onestock-blue mb-4 uppercase tracking-widest border-b border-blue-100 pb-2 flex items-center gap-2">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 7v10c0 1.105 4.477 2 10 2s10-.895 10-2V7M4 7c0 1.105 4.477 2 10 2s10-.895 10-2M4 7c0-1.105 4.477-2 10-2s10 .895 10 2" /></svg>
           Database Status: Synchronized (Test Mode)
        </h4>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 text-xs text-gray-600">
            <div className="w-4 h-4 mt-0.5 bg-green-500 rounded-full flex items-center justify-center shrink-0">
               <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>
            </div>
            <span><strong>1 SKU</strong> registered in the primary product index.</span>
          </li>
          <li className="flex items-start gap-3 text-xs text-gray-600">
             <div className="w-4 h-4 mt-0.5 bg-green-500 rounded-full flex items-center justify-center shrink-0">
               <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>
            </div>
            <span><strong>1 High-Res Asset</strong> mirrored to the secure hosting partition.</span>
          </li>
          <li className="flex items-start gap-3 text-xs text-gray-600">
             <div className="w-4 h-4 mt-0.5 bg-green-500 rounded-full flex items-center justify-center shrink-0">
               <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>
            </div>
            <span><strong>Full Taxonomy</strong> mapped to OneStock attributes.</span>
          </li>
        </ul>
      </div>

      <button 
        onClick={onReset}
        className="px-10 py-4 bg-[#002D72] text-white rounded-xl font-bold hover:bg-[#001F4D] transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 mx-auto"
      >
        Back to History
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
      </button>
    </div>
  );
};

export default StepSuccess;
