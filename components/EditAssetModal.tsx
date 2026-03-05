
import React, { useState, useEffect } from 'react';
import { Product } from '../types';

interface EditAssetModalProps {
  product: Product;
  onSave: (newUrl: string) => void;
  onClose: () => void;
}

const EditAssetModal: React.FC<EditAssetModalProps> = ({ product, onSave, onClose }) => {
  const [url, setUrl] = useState(product.imageUrl);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setPreviewError(false);
  }, [url]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#001F4D]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-4 bg-[#002D72] text-white flex justify-between items-center">
          <h3 className="font-bold">Edit Product Asset</h3>
          <button onClick={onClose} className="hover:opacity-70 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center">
            <div className="w-48 h-48 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden shadow-inner flex items-center justify-center">
              {!previewError ? (
                <img 
                  src={url} 
                  alt="Preview" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <div className="text-center p-4 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <p className="text-[10px] font-bold uppercase tracking-widest">Invalid Image URL</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mirror Image Source URL</label>
            <textarea 
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:border-onestock-blue h-24 resize-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => { onSave(url); onClose(); }}
              className="flex-1 py-3 bg-[#002D72] text-white text-sm font-bold rounded-xl hover:bg-[#001F4D] shadow-lg transition-all"
            >
              Update Asset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditAssetModal;
