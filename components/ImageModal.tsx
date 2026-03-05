
import React from 'react';

interface ImageModalProps {
  imageUrl: string;
  productName: string;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, productName, onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001F4D]/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-4 right-4 z-10">
          <button 
            onClick={onClose}
            className="p-2 bg-white/90 hover:bg-white rounded-full shadow-md text-gray-500 hover:text-onestock-blue transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col">
          <div className="bg-gray-50 flex items-center justify-center p-4 min-h-[400px]">
            <img 
              src={imageUrl} 
              alt={productName} 
              className="max-h-[70vh] w-auto object-contain rounded-lg"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="p-6 bg-white border-t border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">{productName}</h3>
            <p className="text-sm text-gray-500 mt-1 uppercase tracking-widest font-semibold">Mirror Asset Preview</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;
