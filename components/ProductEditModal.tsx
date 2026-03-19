
import React, { useState, useEffect } from 'react';
import { Product } from '../types';

interface ProductEditModalProps {
  product: Product | null; // null means adding a new product
  onSave: (product: Product) => void;
  onClose: () => void;
}

const ProductEditModal: React.FC<ProductEditModalProps> = ({ product, onSave, onClose }) => {
  const [formData, setFormData] = useState<Product>({
    id: '',
    sku: '',
    parentSku: '',
    name: '',
    description: '',
    imageUrl: '',
    productUrl: '',
    price: '0',
    comparePrice: '',
    currency: 'EUR',
    color: '',
    size: '',
    category: '',
    department: '',
    subdepartment: '',
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    images_big: []
  });

  const [activeLang, setActiveLang] = useState('fr');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (product) {
      setFormData({ 
        ...product,
        features: product.features || { en: {}, fr: {} }
      });
    } else {
      setFormData(prev => ({
        ...prev,
        id: Date.now().toString(),
        features: { en: {}, fr: {} }
      }));
    }
  }, [product]);

  const handleAddFeature = () => {
    if (!newKey.trim()) return;
    
    setFormData(prev => {
      const features = prev.features ? { ...prev.features } : { en: {}, fr: {} };
      const langFeatures = features[activeLang] ? { ...features[activeLang] } : {};
      
      // Add or append to array
      const currentValues = (langFeatures[newKey] as any[]) || [];
      langFeatures[newKey] = [...currentValues, newValue];
      
      features[activeLang] = langFeatures as any;
      return { ...prev, features };
    });
    
    setNewKey('');
    setNewValue('');
  };

  const handleRemoveFeature = (key: string, index: number) => {
    setFormData(prev => {
      const features = prev.features ? { ...prev.features } : { en: {}, fr: {} };
      const langFeatures = features[activeLang] ? { ...features[activeLang] } : {};
      
      const currentValues = [...((langFeatures[key] as any[]) || [])];
      currentValues.splice(index, 1);
      
      if (currentValues.length === 0) {
        delete langFeatures[key];
      } else {
        langFeatures[key] = currentValues;
      }
      
      features[activeLang] = langFeatures as any;
      return { ...prev, features };
    });
  };

  const handleUpdateFeatureValue = (key: string, index: number, val: string) => {
    setFormData(prev => {
      const features = prev.features ? { ...prev.features } : { en: {}, fr: {} };
      const langFeatures = features[activeLang] ? { ...features[activeLang] } : {};
      
      const currentValues = [...((langFeatures[key] as any[]) || [])];
      currentValues[index] = val;
      
      langFeatures[key] = currentValues;
      features[activeLang] = langFeatures as any;
      return { ...prev, features };
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'weight' || name === 'length' || name === 'width' || name === 'height' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-white shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-[#002D72] px-6 py-4 flex justify-between items-center text-white">
          <h3 className="text-lg font-bold">{product ? 'Edit Product' : 'Add New Product'}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[80vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Product Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">SKU (Unique ID)</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  required
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Parent SKU (Mother ID)</label>
                <input
                  type="text"
                  name="parentSku"
                  value={formData.parentSku}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue resize-none"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Price</label>
                  <input
                    type="text"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Currency</label>
                  <input
                    type="text"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Color</label>
                  <input
                    type="text"
                    name="color"
                    value={formData.color}
                    onChange={handleChange}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Size</label>
                  <input
                    type="text"
                    name="size"
                    value={formData.size}
                    onChange={handleChange}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Image URL</label>
                <input
                  type="text"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="weight"
                    value={formData.weight}
                    onChange={handleChange}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Additional Images (URLs, one per line)</label>
            <textarea
              name="images_big"
              value={formData.images_big.join('\n')}
              onChange={(e) => {
                const urls = e.target.value.split('\n').filter(u => u.trim());
                setFormData(prev => ({ ...prev, images_big: urls }));
              }}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-onestock-blue focus:ring-1 focus:ring-onestock-blue min-h-[100px] font-mono"
            />
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Features (Characteristics)</h4>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                {['en', 'fr'].map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setActiveLang(lang)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeLang === lang ? 'bg-white text-[#002D72] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <input
                    type="text"
                    placeholder="Key (e.g. color)"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-onestock-blue"
                  />
                </div>
                <div className="col-span-6">
                  <input
                    type="text"
                    placeholder="Value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-onestock-blue"
                  />
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="w-full h-full bg-[#002D72] text-white text-xs font-bold rounded-lg hover:bg-[#001F4D] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                {formData.features && formData.features[activeLang] && Object.entries(formData.features[activeLang]).map(([key, values]) => (
                  <div key={key} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-onestock-blue uppercase tracking-widest">{key}</span>
                    </div>
                    <div className="space-y-2">
                      {(values as any[]).map((v, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={v.toString()}
                            onChange={(e) => handleUpdateFeatureValue(key, idx, e.target.value)}
                            className="flex-1 p-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-onestock-blue"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveFeature(key, idx)}
                            className="p-1.5 text-red-400 hover:text-red-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 bg-[#002D72] text-white font-bold rounded-xl hover:bg-[#001F4D] shadow-lg transition-all"
            >
              {product ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductEditModal;
