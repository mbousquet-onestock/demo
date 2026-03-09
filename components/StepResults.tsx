
import React, { useState, useMemo } from 'react';
import { Product, AppSettings, GroundingSource } from '../types';
import ImageModal from './ImageModal';
import EditAssetModal from './EditAssetModal';
import ProductEditModal from './ProductEditModal';

interface StepResultsProps {
  products: Product[];
  url: string;
  settings: AppSettings;
  sources?: GroundingSource[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onCancel: () => void;
  onGenerateJson: (selectedProducts: Product[]) => void;
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  isHistoryView?: boolean;
}

const StepResults: React.FC<StepResultsProps> = ({ 
  products, 
  url, 
  settings,
  sources = [],
  selectedIds,
  onSelectionChange,
  onCancel, 
  onGenerateJson, 
  onUpdateProduct,
  onAddProduct,
  onDeleteProduct,
  isHistoryView = false 
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingAsset, setEditingAsset] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null | 'new'>(null);
  const [isMassEditOpen, setIsMassEditOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [massEditField, setMassEditField] = useState<keyof Product>('name');
  const [massEditValue, setMassEditValue] = useState('');

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const lowSearch = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lowSearch) ||
      p.sku.toLowerCase().includes(lowSearch) ||
      p.parentSku.toLowerCase().includes(lowSearch) ||
      p.category.toLowerCase().includes(lowSearch) ||
      p.color.toLowerCase().includes(lowSearch) ||
      p.department.toLowerCase().includes(lowSearch) ||
      p.description.toLowerCase().includes(lowSearch)
    );
  }, [products, searchTerm]);

  const toggleSelectAll = () => {
    const allFilteredSelected = filteredProducts.every(p => selectedIds.has(p.id));
    const newSelected = new Set(selectedIds);
    
    if (allFilteredSelected) {
      filteredProducts.forEach(p => newSelected.delete(p.id));
    } else {
      filteredProducts.forEach(p => newSelected.add(p.id));
    }
    onSelectionChange(newSelected);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onSelectionChange(newSelected);
  };

  const handleFieldChange = (product: Product, field: keyof Product, value: string | number) => {
    onUpdateProduct({ ...product, [field]: value });
  };

  const handleDuplicate = (product: Product) => {
    const duplicatedProduct: Product = {
      ...product,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      sku: `${product.sku}-copy`,
      name: `${product.name} (Copy)`
    };
    onAddProduct(duplicatedProduct);
  };

  const applyMassEdit = () => {
    if (selectedIds.size === 0) return;
    
    products.forEach(p => {
      if (selectedIds.has(p.id)) {
        let value: any = massEditValue;
        if (['weight', 'length', 'width', 'height'].includes(massEditField)) {
          value = parseFloat(massEditValue) || 0;
        }
        onUpdateProduct({ ...p, [massEditField]: value });
      }
    });
    
    setIsMassEditOpen(false);
    setMassEditValue('');
  };

  const handleDownloadJson = () => {
    const selected = products.filter(p => selectedIds.has(p.id));
    if (selected.length === 0) {
      return;
    }

    const items = selected.map(p => ({
      id: p.sku,
      category_ids: [p.category],
      is_default: true,
      product_id: p.parentSku,
      features: {
        en: {
          color: [p.color],
          departement: [p.department],
          subdepartement: [p.subdepartment],
          image: [p.imageUrl],
          images_big: [p.imageUrl],
          long_description: [p.description],
          name: [p.name],
          price: [p.price],
          size: [p.size],
          weight: [p.weight]
        },
        fr: {
          color: [p.color],
          departement: [p.department],
          subdepartement: [p.subdepartment],
          image: [p.imageUrl],
          images_big: [p.imageUrl],
          long_description: [p.description],
          name: [p.name],
          price: [p.price],
          size: [p.size],
          weight: [p.weight]
        }
      },
      sales_channels_features: {
        [settings.salesChannel]: {
          compare_at_price: parseFloat(p.comparePrice || "0"),
          currency: p.currency,
          price: parseFloat(p.price)
        }
      },
      length: p.length,
      width: p.width,
      height: p.height,
      weight: p.weight
    }));

    const jsonContent = JSON.stringify({ items }, null, 4);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `onestock_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const editableInputClass = "w-full bg-transparent border-none focus:ring-1 focus:ring-onestock-blue rounded px-1 py-0.5 text-inherit font-sans transition-all hover:bg-gray-50 focus:bg-white";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-full relative pb-10">
      {selectedProduct && (
        <ImageModal 
          imageUrl={selectedProduct.imageUrl} 
          productName={selectedProduct.name} 
          onClose={() => setSelectedProduct(null)} 
        />
      )}

      {editingAsset && (
        <EditAssetModal
          product={editingAsset}
          onSave={(newUrl) => handleFieldChange(editingAsset, 'imageUrl', newUrl)}
          onClose={() => setEditingAsset(null)}
        />
      )}

      {editingProduct && (
        <ProductEditModal
          product={editingProduct === 'new' ? null : editingProduct}
          onSave={(p) => editingProduct === 'new' ? onAddProduct(p) : onUpdateProduct(p)}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {isMassEditOpen && (
        <div className="fixed inset-0 z-[110] flex justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsMassEditOpen(false)}></div>
          <div className="relative w-96 bg-white shadow-2xl h-full p-8 animate-in slide-in-from-right duration-300 border-l border-gray-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-[#002D72]">Mass Edit Selection</h3>
              <button onClick={() => setIsMassEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <p className="text-sm text-gray-500">Apply a new value to all <strong>{selectedIds.size}</strong> selected items.</p>
              
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Target Field</label>
                <select 
                  value={massEditField}
                  onChange={(e) => setMassEditField(e.target.value as keyof Product)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-onestock-blue"
                >
                  <option value="name">Product Name (name)</option>
                  <option value="parentSku">Mother ID (product_id)</option>
                  <option value="description">Description (long_description)</option>
                  <option value="imageUrl">Image URL (image)</option>
                  <option value="category">Category (category_ids)</option>
                  <option value="department">Department (departement)</option>
                  <option value="subdepartment">Sub-Department (subdepartement)</option>
                  <option value="color">Color (color)</option>
                  <option value="size">Size (size)</option>
                  <option value="price">Price (price)</option>
                  <option value="comparePrice">Compare Price (compare_at_price)</option>
                  <option value="weight">Weight (weight)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">New Value</label>
                <input 
                  type="text"
                  value={massEditValue}
                  onChange={(e) => setMassEditValue(e.target.value)}
                  placeholder="Enter value..."
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue"
                />
              </div>

              <button 
                onClick={applyMassEdit}
                disabled={selectedIds.size === 0}
                className="w-full py-4 bg-[#002D72] text-white font-bold rounded-xl hover:bg-[#001F4D] transition-all shadow-lg flex items-center justify-center gap-2"
              >
                Apply to {selectedIds.size} items
              </button>
            </div>
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="bg-white px-6 py-4 rounded-xl border border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-onestock-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            <h3 className="text-xs font-bold text-onestock-blue uppercase tracking-widest">Grounding Sources (Search Results)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((source, i) => (
              <a 
                key={i} 
                href={source.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-2 py-1 bg-blue-50 text-onestock-blue text-[10px] font-medium rounded border border-blue-200 hover:bg-blue-100 transition-colors"
              >
                {source.title.length > 30 ? source.title.substring(0, 30) + '...' : source.title}
                <svg className="w-3 h-3 ml-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-[#002D72]">Step 2: Hierarchy Verification</h2>
          <p className="text-sm text-gray-500">Edit cells directly. Only selected items ({selectedIds.size}) are used in subsequent tools.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group min-w-[200px]">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-onestock-blue focus:bg-white outline-none transition-all"
            />
          </div>

          <button 
            onClick={() => setEditingProduct('new')}
            className="px-3 py-2 text-xs font-bold text-emerald-600 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Add Product
          </button>

          <button 
            onClick={() => setIsMassEditOpen(true)}
            disabled={selectedIds.size === 0}
            className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2 disabled:opacity-30"
          >
            Mass Edit
          </button>

          <button 
            onClick={() => onGenerateJson(products.filter(p => selectedIds.has(p.id)))}
            className="px-3 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all flex items-center gap-2"
          >
            Review JSON
          </button>

          <button 
            onClick={handleDownloadJson}
            className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            Download
          </button>
          
          {/* Validate & Import button removed per user request */}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 w-12 text-center sticky left-0 bg-gray-50 z-10">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-onestock-blue focus:ring-onestock-blue"
                    checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-20 text-center">Actions</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-32 text-center">Asset</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-32">Unique SKU</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-48">Name</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-64">Description</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-24 text-right">Price</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-20 text-center">Size</th>
                <th className="px-4 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-24 text-center">Weight(kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((product) => (
                <tr key={product.id} className={`hover:bg-blue-50/20 transition-colors ${selectedIds.has(product.id) ? 'bg-blue-50/10' : ''}`}>
                  <td className="px-6 py-4 text-center sticky left-0 bg-inherit z-10 border-r border-gray-50">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-onestock-blue focus:ring-onestock-blue"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                    />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={() => setEditingProduct(product)}
                        className="p-1.5 text-onestock-blue hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Product Details"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M18.364 5.636l-3.536 3.536m3.536-3.536L15.232 3.732a2.5 2.5 0 00-3.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button 
                        onClick={() => handleDuplicate(product)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Duplicate Product"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                      </button>
                      <button 
                        onClick={() => onDeleteProduct(product.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Product"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-center gap-1">
                      <div 
                        className="group/asset relative w-10 h-10 rounded border border-gray-200 bg-gray-50 overflow-hidden shrink-0"
                      >
                        <img 
                          src={product.imageUrl} 
                          alt="" 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/002D72/white?text=Err'; }}
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/asset:opacity-100 transition-opacity gap-1.5">
                          <button 
                            onClick={() => setSelectedProduct(product)}
                            className="p-1 bg-white rounded shadow-sm text-onestock-blue hover:bg-blue-50"
                            title="View Image"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                          <button 
                            onClick={() => setEditingAsset(product)}
                            className="p-1 bg-white rounded shadow-sm text-onestock-blue hover:bg-blue-50"
                            title="Edit URL"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <input 
                      className={`${editableInputClass} font-bold text-[#002D72] text-xs`}
                      value={product.sku}
                      onChange={(e) => handleFieldChange(product, 'sku', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <input 
                      className={`${editableInputClass} text-sm font-bold text-gray-900`}
                      value={product.name}
                      onChange={(e) => handleFieldChange(product, 'name', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <textarea 
                      className={`${editableInputClass} text-[10px] text-gray-500 min-h-[40px] resize-none`}
                      value={product.description}
                      onChange={(e) => handleFieldChange(product, 'description', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input 
                        className={`${editableInputClass} text-sm font-bold text-gray-900 text-right w-16`}
                        value={product.price}
                        onChange={(e) => handleFieldChange(product, 'price', e.target.value)}
                      />
                      <span className="text-xs text-gray-400">{product.currency}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <input 
                      className={`${editableInputClass} text-[10px] font-bold text-center w-12 bg-gray-900 text-white rounded`}
                      value={product.size}
                      onChange={(e) => handleFieldChange(product, 'size', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <input 
                      type="number"
                      step="0.1"
                      className={`${editableInputClass} text-xs text-gray-500 text-center w-16`}
                      value={product.weight}
                      onChange={(e) => handleFieldChange(product, 'weight', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StepResults;
