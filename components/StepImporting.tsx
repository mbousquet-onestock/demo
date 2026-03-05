
import React, { useEffect, useState } from 'react';
import { Product } from '../types';

interface StepImportingProps {
  products: Product[];
  url: string;
  onComplete: () => void;
}

const StepImporting: React.FC<StepImportingProps> = ({ products, url, onComplete }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const hostname = new URL(url).hostname;
  const path = `onestock-tools-hosting-hwn8eubny/mbousquet/Import/${hostname.replace('www.', '')}`;

  useEffect(() => {
    // Faster interval for tests
    const timer = setInterval(() => {
      setCurrentIdx(prev => {
        if (prev >= products.length - 1) {
          clearInterval(timer);
          setTimeout(onComplete, 1200);
          return prev;
        }
        return prev + 1;
      });
    }, 200);

    return () => clearInterval(timer);
  }, [products.length, onComplete]);

  const progress = Math.round((currentIdx / (products.length || 1)) * 100);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center max-w-2xl mx-auto mt-12">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center p-4 bg-blue-50 rounded-2xl text-onestock-blue mb-4">
          <svg className="w-12 h-12 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 1.105 4.477 2 10 2s10-.895 10-2V7M4 7c0 1.105 4.477 2 10 2s10-.895 10-2M4 7c0-1.105 4.477-2 10-2s10 .895 10 2m-10 10v4" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 font-display">Production Deployment</h2>
        <p className="text-gray-500 text-sm mb-6">Moving mirrored asset and data record to the final hosting repository.</p>
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-6">
           <span className="text-[10px] font-mono text-gray-400 block mb-1 uppercase tracking-tighter">Remote Hosting Destination</span>
           <p className="text-xs font-mono break-all text-onestock-blue font-semibold">{path}/</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-gray-500">
          <span>Transferring...</span>
          <span className="text-onestock-blue">{currentIdx + 1} / {products.length}</span>
        </div>
        
        <div className="w-full bg-gray-100 rounded-full h-3 relative overflow-hidden">
          <div 
            className="bg-[#002D72] h-full rounded-full transition-all duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="flex flex-col gap-1.5 mt-8 border-t border-gray-100 pt-6">
          <div className="text-[10px] text-left px-3 py-1.5 bg-gray-50 rounded font-mono text-gray-400 opacity-60 truncate">
            {`> DB_COMMIT: product_sku="${products[currentIdx]?.sku}"`}
          </div>
          <div className="text-[10px] text-left px-3 py-1.5 bg-gray-50 rounded font-mono text-onestock-blue font-bold truncate">
            {`> ASSET_SYNC: mirroring image to /Import/${hostname.replace('www.', '')}/assets/${products[currentIdx]?.sku}.png`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepImporting;
