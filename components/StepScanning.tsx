
import React, { useEffect, useState } from 'react';
import { Product, GroundingSource } from '../types';
import { scanWebsiteForProducts } from '../services/geminiService';
import { fetchImageAsBase64 } from '../utils/imageUtils';

interface StepScanningProps {
  url: string;
  limit: number;
  onComplete: (products: Product[], sources: GroundingSource[]) => void;
  onError: (msg: string) => void;
}

const StepScanning: React.FC<StepScanningProps> = ({ url, limit, onComplete, onError }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Starting Visual Crawler...');
  const [mirrorProgress, setMirrorProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    let isMounted = true;

    const runScan = async () => {
      try {
        setStatus(`Analyzing catalog (${limit} target items)...`);
        setProgress(5);
        
        const scanResult = await scanWebsiteForProducts(url, limit);
        const results = scanResult.products;
        const sources = scanResult.sources;
        
        if (!isMounted) return;
        
        if (results.length === 0) {
          onError("AI could not identify valid products. Please check the URL.");
          return;
        }

        setProgress(25);
        setStatus(`${results.length} products detected. Capturing visuals...`);
        
        setMirrorProgress({ current: 0, total: results.length });
        
        const mirroredProducts = [];
        for (let i = 0; i < results.length; i++) {
          const product = results[i];
          setStatus(`Processing: [${i + 1}/${results.length}] ${product.name.substring(0, 20)}...`);
          
          try {
            const base64Image = await fetchImageAsBase64(product.imageUrl);
            mirroredProducts.push({
              ...product,
              imageUrl: base64Image
            });
          } catch (e) {
            console.warn(`Mirroring failed for ${product.sku}, using direct link fallback.`);
            mirroredProducts.push(product);
          }
          
          setMirrorProgress({ current: i + 1, total: results.length });
          setProgress(25 + Math.floor(((i + 1) / results.length) * 75));
        }

        if (!isMounted) return;
        
        setStatus('OneStock synchronization complete.');
        setProgress(100);
        setTimeout(() => onComplete(mirroredProducts, sources), 500);
      } catch (err: any) {
        console.error("Scan error catch:", err);
        if (isMounted) onError(`Scan failed: ${err.message || 'Unknown API Error'}`);
      }
    };

    runScan();
    return () => { isMounted = false; };
  }, [url, limit, onComplete, onError]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center h-full flex flex-col items-center justify-center">
      <div className="relative w-28 h-28 mb-8">
        <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-[#002D72] rounded-full border-t-transparent animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-[#002D72]">
          {progress}%
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2 font-display">Smart Catalog Capture</h2>
      <p className="text-gray-500 mb-8 max-w-md mx-auto h-12 flex items-center justify-center text-sm leading-relaxed italic">
        {status}
      </p>

      <div className="w-full max-w-md space-y-3">
        <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div 
            className="bg-[#002D72] h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        
        {mirrorProgress.total > 0 && (
          <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <span>Asset Mirroring Status</span>
            <span className="text-onestock-blue">{mirrorProgress.current} / {mirrorProgress.total}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StepScanning;
