
import React, { useState } from 'react';

interface StepInputProps {
  onStart: (url: string, limit: number) => void;
}

const StepInput: React.FC<StepInputProps> = ({ onStart }) => {
  const [url, setUrl] = useState('');
  const [limit, setLimit] = useState(10);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onStart(url.trim(), limit);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-10 lg:p-16 text-center animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-3xl w-full mx-auto">
        <div className="mb-12 max-w-xl mx-auto">
          <div className="w-20 h-20 bg-[#002D72]/5 text-[#002D72] rounded-[24px] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Step 1: Catalog Sourcing</h2>
          <p className="text-gray-500 text-lg">Enter a website URL and the number of articles to import into the OneStock hierarchy.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className={`flex flex-col md:flex-row items-stretch gap-0 border rounded-2xl overflow-hidden transition-all duration-300 ${isFocused ? 'border-[#002D72] shadow-[0_0_0_4px_rgba(0,45,114,0.1)]' : 'border-gray-200 shadow-sm hover:border-gray-300'}`}>
            <div className="flex-1 flex flex-col items-start bg-white p-5 lg:p-6">
              <label className="text-[11px] font-bold text-[#002D72] uppercase tracking-[0.15em] mb-2">Target E-commerce URL</label>
              <div className="relative w-full">
                <input
                  type="url"
                  required
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  className="block w-full py-2 text-gray-900 placeholder-gray-300 outline-none bg-transparent text-xl font-medium"
                  placeholder="https://www.example.com/collection"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>
            
            <div className="w-px bg-gray-100 hidden md:block my-6"></div>

            <div className="w-full md:w-44 flex flex-col items-start bg-[#F8FAFC] p-5 lg:p-6 border-t md:border-t-0 border-gray-100">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Item Count</label>
              <input
                type="number"
                min="1"
                max="100"
                required
                className="block w-full py-2 text-[#002D72] font-bold outline-none bg-transparent text-xl"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!url}
            className="w-full bg-[#002D72] hover:bg-[#001F4D] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed text-white font-bold py-6 px-8 rounded-2xl shadow-xl shadow-blue-900/10 transition-all flex items-center justify-center gap-4 transform hover:-translate-y-1 active:scale-[0.98]"
          >
            <span className="text-lg">Extract {limit} unique items</span>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>

        <div className="mt-16 pt-8 border-t border-gray-50 flex items-center justify-center gap-10 opacity-30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-900">OneStock AI Engine v3.0</span>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Production Ready</span>
        </div>
      </div>
    </div>
  );
};

export default StepInput;
