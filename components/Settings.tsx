
import React, { useState, useRef } from 'react';
import { AppSettings, Product } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onSave }) => {
  const [newEndpoint, setNewEndpoint] = useState('');
  const [newOrderChannel, setNewOrderChannel] = useState('');
  const [newRuleset, setNewRuleset] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');
  const [newCountryName, setNewCountryName] = useState('');
  const businessRulesFileRef = useRef<HTMLInputElement>(null);
  
  // Specific refs for individual imports
  const endpointFileRef = useRef<HTMLInputElement>(null);
  const channelFileRef = useRef<HTMLInputElement>(null);
  const rulesetFileRef = useRef<HTMLInputElement>(null);
  const countryFileRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    onSave({
      ...settings,
      [name]: type === 'number' ? parseFloat(value) : value,
    });
  };

  const handleMappingChange = (onestockField: string, productField: string) => {
    onSave({
      ...settings,
      fieldMapping: {
        ...settings.fieldMapping,
        [onestockField]: productField as keyof Product | 'none'
      }
    });
  };

  const addItem = (field: keyof AppSettings, value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    if (value.trim()) {
      const currentList = settings[field] as string[];
      if (!currentList.includes(value.trim())) {
        onSave({ ...settings, [field]: [...currentList, value.trim()] });
        setter('');
      }
    }
  };

  const addCountry = () => {
    if (newCountryCode.trim() && newCountryName.trim()) {
      if (!settings.deliveryCountries.some(c => c.code === newCountryCode.trim())) {
        onSave({
          ...settings,
          deliveryCountries: [...settings.deliveryCountries, { code: newCountryCode.trim().toUpperCase(), name: newCountryName.trim() }]
        });
        setNewCountryCode('');
        setNewCountryName('');
      }
    }
  };

  const removeItem = (field: keyof AppSettings, value: string) => {
    const currentList = settings[field] as string[];
    onSave({ ...settings, [field]: currentList.filter(v => v !== value) });
  };

  const removeCountry = (code: string) => {
    onSave({
      ...settings,
      deliveryCountries: settings.deliveryCountries.filter(c => c.code !== code)
    });
  };

  const handleExportFile = (data: any, fileName: string) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${fileName}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportRules = () => {
    handleExportFile({
      stockEndpoints: settings.stockEndpoints,
      orderSalesChannels: settings.orderSalesChannels,
      rulesets: settings.rulesets,
      deliveryCountries: settings.deliveryCountries
    }, 'onestock_business_rules');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>, field?: keyof AppSettings) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (field) {
          // Specific field import
          const importedList = Array.isArray(data) ? data : data[field];
          if (Array.isArray(importedList)) {
            onSave({ ...settings, [field]: importedList });
            alert(`${field} imported successfully.`);
          } else {
            alert(`Invalid format for ${field}. Expected an array.`);
          }
        } else {
          // Global import
          if (data.stockEndpoints || data.orderSalesChannels || data.rulesets || data.deliveryCountries) {
            onSave({
              ...settings,
              stockEndpoints: Array.isArray(data.stockEndpoints) ? data.stockEndpoints : settings.stockEndpoints,
              orderSalesChannels: Array.isArray(data.orderSalesChannels) ? data.orderSalesChannels : settings.orderSalesChannels,
              rulesets: Array.isArray(data.rulesets) ? data.rulesets : settings.rulesets,
              deliveryCountries: Array.isArray(data.deliveryCountries) ? data.deliveryCountries : settings.deliveryCountries
            });
            alert("Business rules imported successfully.");
          }
        }
      } catch (err) {
        alert("Failed to parse the JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderListManager = (
    label: string, 
    field: keyof AppSettings, 
    value: string, 
    setter: React.Dispatch<React.SetStateAction<string>>,
    placeholder: string,
    importRef: React.RefObject<HTMLInputElement | null>
  ) => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</label>
        <div className="flex gap-1.5">
          <input type="file" ref={importRef} onChange={(e) => handleImportJson(e, field)} accept=".json" className="hidden" />
          <button onClick={() => importRef.current?.click()} className="p-1 text-gray-400 hover:text-onestock-blue" title="Import JSON">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </button>
          <button onClick={() => handleExportFile(settings[field], `onestock_${field}`)} className="p-1 text-gray-400 hover:text-onestock-blue" title="Export JSON">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <input 
          value={value} 
          onChange={(e) => setter(e.target.value)} 
          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" 
          placeholder={placeholder}
        />
        <button 
          onClick={() => addItem(field, value, setter)}
          className="px-4 py-2 bg-onestock-blue text-white font-bold text-xs rounded-lg hover:bg-[#001F4D]"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(settings[field] as string[]).map(v => (
          <div key={v} className="bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-onestock-blue">{v}</span>
            <button onClick={() => removeItem(field, v)} className="text-blue-300 hover:text-red-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const productFields: (keyof Product | 'none')[] = [
    'none', 'sku', 'parentSku', 'name', 'description', 'price', 'color', 'size', 'imageUrl'
  ];

  const coreFields = [
    { key: 'id', label: 'Item ID (Unique SKU)', required: true, desc: 'Primary identifier for the article.' },
    { key: 'product_id', label: 'Product ID (Mother ID)', required: true, desc: 'Groups multiple variants under one product.' },
    { key: 'name', label: 'Label / Name', required: true, desc: 'Public display name of the item.' },
  ];

  const featureFields = [
    { key: 'price', label: 'Unit Price', desc: 'Base price used if sales channel price is empty.' },
    { key: 'description', label: 'Description', desc: 'Long text detailing the product.' },
    { key: 'color', label: 'Color Variant', desc: 'The specific color of this SKU.' },
    { key: 'size', label: 'Size Variant', desc: 'The specific size of this SKU.' },
    { key: 'image', label: 'Main Image URL', desc: 'Direct link to the primary visual.' },
    { key: 'brand', label: 'Brand Name', desc: 'Manufacturer or label name.' },
    { key: 'category', label: 'Category Path', desc: 'Breadcrumb or category identifier.' },
  ];

  const renderMappingRow = (field: { key: string, label: string, required?: boolean, desc: string }) => {
    const currentMapping = (settings.fieldMapping as any)[field.key];
    const isMapped = currentMapping && currentMapping !== 'none';

    return (
      <div 
        key={field.key} 
        className={`grid grid-cols-12 gap-4 items-center p-4 rounded-xl transition-all border ${
          isMapped ? 'bg-blue-50/40 border-blue-100' : 'bg-white border-transparent hover:bg-gray-50'
        }`}
      >
        <div className="col-span-5">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isMapped ? 'text-[#002D72]' : 'text-gray-700'}`}>{field.label}</span>
            {field.required && (
              <span className="text-[8px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Required</span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{field.desc}</p>
        </div>
        <div className="col-span-2 flex items-center justify-center">
          <div className={`w-10 h-px ${isMapped ? 'bg-blue-300' : 'bg-gray-200'}`}></div>
        </div>
        <div className="col-span-5">
          <select 
            value={currentMapping || 'none'}
            onChange={(e) => handleMappingChange(field.key, e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm font-medium outline-none transition-all ${
              isMapped ? 'bg-white border-blue-300 text-[#002D72]' : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            {productFields.map(pf => (
              <option key={pf} value={pf}>{pf === 'none' ? '-- Unmapped --' : pf}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <input 
        type="file" 
        ref={businessRulesFileRef} 
        onChange={(e) => handleImportJson(e)} 
        accept=".json" 
        className="hidden" 
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="border-b border-gray-100 pb-6 mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">API Gateway Configuration</h2>
            <p className="text-gray-500 text-sm mt-1">Connectivity details for the <strong>{settings.apiName}</strong>.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h3 className="text-xs font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3">Connection Identity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Custom API Label</label>
                <input name="apiName" value={settings.apiName} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-bold text-gray-800" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Base API URL</label>
                <input name="apiUrl" value={settings.apiUrl} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3">Security & Context</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Site Context ID</label>
                <input name="siteId" value={settings.siteId} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Import Sales Channel</label>
                <input name="salesChannel" value={settings.salesChannel} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">OAuth 2.0 Bearer Token</label>
                <input type="password" name="token" value={settings.token} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h3 className="text-sm font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3">Business Rule Configuration</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => businessRulesFileRef.current?.click()}
              className="px-3 py-1.5 text-[10px] font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Import All
            </button>
            <button 
              onClick={handleExportRules}
              className="px-3 py-1.5 text-[10px] font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export All
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {renderListManager('Inventory Endpoints', 'stockEndpoints', newEndpoint, setNewEndpoint, 'e.g. Store_01', endpointFileRef)}
          {renderListManager('Order Sales Channels', 'orderSalesChannels', newOrderChannel, setNewOrderChannel, 'e.g. TikTok_ES', channelFileRef)}
          {renderListManager('Available Rulesets', 'rulesets', newRuleset, setNewRuleset, 'e.g. standard_ffs', rulesetFileRef)}
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Countries</label>
              <div className="flex gap-1.5">
                <input type="file" ref={countryFileRef} onChange={(e) => handleImportJson(e, 'deliveryCountries')} accept=".json" className="hidden" />
                <button onClick={() => countryFileRef.current?.click()} className="p-1 text-gray-400 hover:text-onestock-blue" title="Import JSON">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </button>
                <button onClick={() => handleExportFile(settings.deliveryCountries, 'onestock_deliveryCountries')} className="p-1 text-gray-400 hover:text-onestock-blue" title="Export JSON">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <input 
                value={newCountryCode} 
                onChange={(e) => setNewCountryCode(e.target.value.toUpperCase())} 
                className="w-16 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" 
                placeholder="FR"
                maxLength={2}
              />
              <input 
                value={newCountryName} 
                onChange={(e) => setNewCountryName(e.target.value)} 
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" 
                placeholder="France"
              />
              <button 
                onClick={addCountry}
                className="px-4 py-2 bg-onestock-blue text-white font-bold text-xs rounded-lg hover:bg-[#001F4D]"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.deliveryCountries.map(c => (
                <div key={c.code} className="bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-onestock-blue">{c.code}</span>
                  <span className="text-[10px] text-gray-500">{c.name}</span>
                  <button onClick={() => removeCountry(c.code)} className="text-blue-300 hover:text-red-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="border-b border-gray-100 pb-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Structural Field Mapping</h2>
          <p className="text-gray-500 text-sm mt-1">Map AI extraction fields to the complete OneStock API schema.</p>
        </div>

        <div className="space-y-10">
          <div>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-50 pb-2">Core Article Parameters</h4>
            <div className="space-y-1">
              {coreFields.map(renderMappingRow)}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-50 pb-2">Extended Localized Features</h4>
            <div className="space-y-1">
              {featureFields.map(renderMappingRow)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
