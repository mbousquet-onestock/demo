
import React, { useState } from 'react';
import { AppSettings, Endpoint } from '../types';
import { geocodeAddress } from '../services/geminiService';

interface StepEndpointManagerProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onCancel: () => void;
}

const StepEndpointManager: React.FC<StepEndpointManagerProps> = ({ settings, onUpdateSettings, onCancel }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const [form, setForm] = useState<Endpoint>({
    id: '',
    name: '',
    sales_channel_id: settings.salesChannel || 'sc_ois_1',
    timezone: 'Europe/Paris',
    workflow_id: 'store',
    currency: null,
    locked: {},
    modules: {
      cfs: true,
      ckc: true,
      ffs: true,
      ois: true,
      ropis: true
    },
    address: {
      id: '',
      city: '',
      contact: {
        phone_number: '',
        email: ''
      },
      coordinates: {
        lon: 0,
        lat: 0
      },
      lines: [''],
      regions: {
        country: {
          code: 'FR'
        }
      },
      zip_code: ''
    },
    classification: {
      endpoint_type: ['store'],
      scan_mode: ['input'],
      store_profile: ['store_no_scan']
    },
    open: true,
    opening_hours: {
      id: '',
      type: '',
      timezone: 'Europe/Paris',
      timespans: []
    },
    opening_hours_next_seven_days: {
      opening_hours: []
    },
    execution_times: {},
    configurations: {
      order_in_store: {
        catalog: true,
        immediate_pickup: true,
        delivery: true
      },
      delivery_promise: {
        milestones: true
      }
    }
  });

  const handleGeocode = async () => {
    if (!form.address.city) return;
    setIsGeocoding(true);
    const coords = await geocodeAddress(form.address.city, form.address.regions.country.code);
    if (coords) {
      setForm(prev => ({
        ...prev,
        address: {
          ...prev.address,
          coordinates: {
            lat: coords.latitude,
            lon: coords.longitude
          }
        }
      }));
    }
    setIsGeocoding(false);
  };

  const handleSave = () => {
    if (!form.id || !form.name) return;

    // Cleanup address lines
    const cleanedLines = form.address.lines.filter(l => l.trim() !== '');
    const finalForm = {
      ...form,
      address: {
        ...form.address,
        lines: cleanedLines.length > 0 ? cleanedLines : []
      }
    };

    let newEndpoints: Endpoint[];
    if (editingId) {
      newEndpoints = settings.endpoints.map(e => e.id === editingId ? finalForm : e);
    } else {
      // Check for duplicate ID
      if (settings.endpoints.find(e => e.id === form.id)) {
        alert('An endpoint with this ID already exists.');
        return;
      }
      newEndpoints = [...settings.endpoints, finalForm];
    }

    onUpdateSettings({ ...settings, endpoints: newEndpoints });
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      id: '',
      name: '',
      sales_channel_id: settings.salesChannel || 'sc_ois_1',
      timezone: 'Europe/Paris',
      workflow_id: 'store',
      currency: null,
      locked: {},
      modules: {
        cfs: true,
        ckc: true,
        ffs: true,
        ois: true,
        ropis: true
      },
      address: {
        id: '',
        city: '',
        contact: {
          phone_number: '',
          email: ''
        },
        coordinates: {
          lon: 0,
          lat: 0
        },
        lines: [''],
        regions: {
          country: {
            code: 'FR'
          }
        },
        zip_code: ''
      },
      classification: {
        endpoint_type: ['store'],
        scan_mode: ['input'],
        store_profile: ['store_no_scan']
      },
      open: true,
      opening_hours: {
        id: '',
        type: '',
        timezone: 'Europe/Paris',
        timespans: []
      },
      opening_hours_next_seven_days: {
        opening_hours: []
      },
      execution_times: {},
      configurations: {
        order_in_store: {
          catalog: true,
          immediate_pickup: true,
          delivery: true
        },
        delivery_promise: {
          milestones: true
        }
      }
    });
  };

  const handleEdit = (endpoint: Endpoint) => {
    setForm(endpoint);
    setEditingId(endpoint.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this endpoint?')) {
      const newEndpoints = settings.endpoints.filter(e => e.id !== id);
      onUpdateSettings({ ...settings, endpoints: newEndpoints });
    }
  };

  const handleGeneratePayload = (endpoint: Endpoint) => {
    const payload = {
      site_id: settings.siteId,
      token: settings.token,
      endpoint: endpoint
    };
    setGeneratedPayload(JSON.stringify(payload, null, 4));
  };

  const handleCopy = () => {
    if (!generatedPayload) return;
    navigator.clipboard.writeText(generatedPayload);
    setCopyStatus('COPIED!');
    setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[#002D72]">Endpoint Manager</h2>
            <p className="text-sm text-gray-500 mt-1">Manage your stock locations and generate OneStock payloads.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            {settings.endpoints.length > 0 && !isAdding && (
              <button 
                onClick={() => {
                  const payload = {
                    site_id: settings.siteId,
                    token: settings.token,
                    endpoints: settings.endpoints
                  };
                  setGeneratedPayload(JSON.stringify(payload, null, 4));
                }}
                className="px-4 py-2 text-sm font-semibold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-colors"
              >
                Bulk Export ({settings.endpoints.length})
              </button>
            )}
            {!isAdding && (
              <button 
                onClick={() => { resetForm(); setIsAdding(true); }}
                className="px-6 py-2 bg-[#002D72] text-white font-bold rounded-lg hover:bg-[#001F4D] shadow-lg transition-all text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Add Endpoint
              </button>
            )}
          </div>
        </div>

        {isAdding ? (
          <div className="space-y-6 bg-gray-50 p-8 rounded-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-onestock-blue">{editingId ? 'Edit Endpoint' : 'New Endpoint'}</h3>
              <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2">Basic Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">ID *</label>
                    <input 
                      type="text"
                      value={form.id}
                      onChange={e => setForm(prev => ({ ...prev, id: e.target.value }))}
                      disabled={!!editingId}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Name *</label>
                    <input 
                      type="text"
                      value={form.name}
                      onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Sales Channel ID</label>
                    <input 
                      type="text"
                      value={form.sales_channel_id}
                      onChange={e => setForm(prev => ({ ...prev, sales_channel_id: e.target.value }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Workflow ID</label>
                    <input 
                      type="text"
                      value={form.workflow_id}
                      onChange={e => setForm(prev => ({ ...prev, workflow_id: e.target.value }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Timezone</label>
                    <input 
                      type="text"
                      value={form.timezone}
                      onChange={e => setForm(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Currency</label>
                    <input 
                      type="text"
                      value={form.currency || ''}
                      onChange={e => setForm(prev => ({ ...prev, currency: e.target.value || null }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                      placeholder="e.g. EUR"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="is_open"
                    checked={form.open} 
                    onChange={e => setForm(prev => ({ ...prev, open: e.target.checked }))} 
                    className="rounded text-onestock-blue" 
                  />
                  <label htmlFor="is_open" className="text-[10px] font-bold text-gray-600 uppercase cursor-pointer">Endpoint is Open</label>
                </div>
              </div>

              {/* Address & Coordinates */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2">Address & Location</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">City</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={form.address.city}
                        onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, city: e.target.value } }))}
                        className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                      />
                      <button 
                        onClick={handleGeocode}
                        disabled={isGeocoding}
                        className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-onestock-blue disabled:opacity-50"
                        title="Refresh Coordinates"
                      >
                        {isGeocoding ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Zip Code</label>
                    <input 
                      type="text"
                      value={form.address.zip_code}
                      onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, zip_code: e.target.value } }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lat</label>
                    <input 
                      type="number"
                      step="any"
                      value={form.address.coordinates.lat}
                      onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, coordinates: { ...prev.address.coordinates, lat: parseFloat(e.target.value) } } }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lon</label>
                    <input 
                      type="number"
                      step="any"
                      value={form.address.coordinates.lon}
                      onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, coordinates: { ...prev.address.coordinates, lon: parseFloat(e.target.value) } } }))}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Country Code</label>
                  <select 
                    value={form.address.regions.country.code}
                    onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, regions: { country: { code: e.target.value } } } }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                  >
                    {settings.deliveryCountries.map(c => (
                      <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Address Lines</label>
                  {form.address.lines.map((line, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <input 
                        type="text"
                        value={line}
                        onChange={e => {
                          const newLines = [...form.address.lines];
                          newLines[index] = e.target.value;
                          setForm(prev => ({ ...prev, address: { ...prev.address, lines: newLines } }));
                        }}
                        className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                        placeholder={`Line ${index + 1}`}
                      />
                      {form.address.lines.length > 1 && (
                        <button 
                          onClick={() => {
                            const newLines = form.address.lines.filter((_, i) => i !== index);
                            setForm(prev => ({ ...prev, address: { ...prev.address, lines: newLines } }));
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button 
                    onClick={() => setForm(prev => ({ ...prev, address: { ...prev.address, lines: [...prev.address.lines, ''] } }))}
                    className="text-[10px] font-bold text-onestock-blue hover:underline"
                  >
                    + Add Line
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Email</label>
                  <input 
                    type="email"
                    value={form.address.contact.email}
                    onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, contact: { ...prev.address.contact, email: e.target.value } } }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Phone</label>
                  <input 
                    type="text"
                    value={form.address.contact.phone_number}
                    onChange={e => setForm(prev => ({ ...prev, address: { ...prev.address, contact: { ...prev.address.contact, phone_number: e.target.value } } }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                  />
                </div>
              </div>

              {/* Modules & Classification */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2">Modules & Classification</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(form.modules).map(m => (
                    <label key={m} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                      <input 
                        type="checkbox" 
                        checked={form.modules[m as keyof typeof form.modules]} 
                        onChange={e => setForm(prev => ({ ...prev, modules: { ...prev.modules, [m]: e.target.checked } }))} 
                        className="rounded text-onestock-blue" 
                      />
                      <span className="text-[10px] font-bold text-gray-600 uppercase">{m}</span>
                    </label>
                  ))}
                </div>
                <div className="pt-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Endpoint Type (comma separated)</label>
                  <input 
                    type="text"
                    value={form.classification.endpoint_type.join(', ')}
                    onChange={e => setForm(prev => ({ ...prev, classification: { ...prev.classification, endpoint_type: e.target.value.split(',').map(s => s.trim()) } }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Scan Mode (comma separated)</label>
                  <input 
                    type="text"
                    value={form.classification.scan_mode.join(', ')}
                    onChange={e => setForm(prev => ({ ...prev, classification: { ...prev.classification, scan_mode: e.target.value.split(',').map(s => s.trim()) } }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Store Profile (comma separated)</label>
                  <input 
                    type="text"
                    value={form.classification.store_profile.join(', ')}
                    onChange={e => setForm(prev => ({ ...prev, classification: { ...prev.classification, store_profile: e.target.value.split(',').map(s => s.trim()) } }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                  />
                </div>
              </div>

              {/* Configurations & Advanced */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2">Configurations & Advanced</h4>
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Order In Store</div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex items-center gap-1 p-1 bg-white rounded border border-gray-200 cursor-pointer">
                      <input type="checkbox" checked={form.configurations.order_in_store.catalog} onChange={e => setForm(prev => ({ ...prev, configurations: { ...prev.configurations, order_in_store: { ...prev.configurations.order_in_store, catalog: e.target.checked } } }))} className="rounded text-onestock-blue scale-75" />
                      <span className="text-[8px] font-bold text-gray-600 uppercase">Catalog</span>
                    </label>
                    <label className="flex items-center gap-1 p-1 bg-white rounded border border-gray-200 cursor-pointer">
                      <input type="checkbox" checked={form.configurations.order_in_store.immediate_pickup} onChange={e => setForm(prev => ({ ...prev, configurations: { ...prev.configurations, order_in_store: { ...prev.configurations.order_in_store, immediate_pickup: e.target.checked } } }))} className="rounded text-onestock-blue scale-75" />
                      <span className="text-[8px] font-bold text-gray-600 uppercase">Pickup</span>
                    </label>
                    <label className="flex items-center gap-1 p-1 bg-white rounded border border-gray-200 cursor-pointer">
                      <input type="checkbox" checked={form.configurations.order_in_store.delivery} onChange={e => setForm(prev => ({ ...prev, configurations: { ...prev.configurations, order_in_store: { ...prev.configurations.order_in_store, delivery: e.target.checked } } }))} className="rounded text-onestock-blue scale-75" />
                      <span className="text-[8px] font-bold text-gray-600 uppercase">Delivery</span>
                    </label>
                  </div>
                </div>
                <div className="pt-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Delivery Promise</div>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 cursor-pointer mt-1">
                    <input type="checkbox" checked={form.configurations.delivery_promise.milestones} onChange={e => setForm(prev => ({ ...prev, configurations: { ...prev.configurations, delivery_promise: { milestones: e.target.checked } } }))} className="rounded text-onestock-blue" />
                    <span className="text-[10px] font-bold text-gray-600 uppercase">Milestones</span>
                  </label>
                </div>

                <div className="pt-4 space-y-4">
                  <h5 className="text-[10px] font-bold text-gray-400 uppercase">Execution Times (JSON)</h5>
                  <textarea 
                    value={JSON.stringify(form.execution_times, null, 2)}
                    onChange={e => {
                      try {
                        const val = JSON.parse(e.target.value);
                        setForm(prev => ({ ...prev, execution_times: val }));
                      } catch (err) {
                        // Ignore invalid JSON during typing
                      }
                    }}
                    className="w-full h-24 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-mono text-onestock-blue outline-none focus:border-onestock-blue"
                    placeholder='{ "key": "value" }'
                  />
                  
                  <h5 className="text-[10px] font-bold text-gray-400 uppercase">Locked (JSON)</h5>
                  <textarea 
                    value={JSON.stringify(form.locked, null, 2)}
                    onChange={e => {
                      try {
                        const val = JSON.parse(e.target.value);
                        setForm(prev => ({ ...prev, locked: val }));
                      } catch (err) {
                        // Ignore invalid JSON during typing
                      }
                    }}
                    className="w-full h-24 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-mono text-onestock-blue outline-none focus:border-onestock-blue"
                    placeholder='{ "key": "value" }'
                  />
                </div>
              </div>

              {/* Opening Hours */}
              <div className="col-span-full space-y-4 border-t border-gray-200 pt-8 mt-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2">Opening Hours</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Opening Hours ID</label>
                      <input 
                        type="text"
                        value={form.opening_hours.id}
                        onChange={e => setForm(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, id: e.target.value } }))}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Type</label>
                      <input 
                        type="text"
                        value={form.opening_hours.type}
                        onChange={e => setForm(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, type: e.target.value } }))}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-onestock-blue outline-none focus:border-onestock-blue"
                        placeholder="e.g. weekly"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase">Timespans</label>
                      <button 
                        onClick={() => setForm(prev => ({ 
                          ...prev, 
                          opening_hours: { 
                            ...prev.opening_hours, 
                            timespans: [...prev.opening_hours.timespans, { start: 0, end: 86400, options: { open: true } }] 
                          } 
                        }))}
                        className="text-[10px] font-bold text-onestock-blue hover:underline"
                      >
                        + Add Timespan
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {form.opening_hours.timespans.map((ts, index) => (
                        <div key={index} className="p-4 bg-white border border-gray-200 rounded-xl space-y-3 relative group">
                          <button 
                            onClick={() => {
                              const newTs = form.opening_hours.timespans.filter((_, i) => i !== index);
                              setForm(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, timespans: newTs } }));
                            }}
                            className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">Start (sec)</label>
                              <input 
                                type="number"
                                value={ts.start}
                                onChange={e => {
                                  const newTs = [...form.opening_hours.timespans];
                                  newTs[index] = { ...ts, start: parseInt(e.target.value) || 0 };
                                  setForm(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, timespans: newTs } }));
                                }}
                                className="w-full px-3 py-1 bg-gray-50 border border-gray-100 rounded text-xs font-bold text-onestock-blue"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1">End (sec)</label>
                              <input 
                                type="number"
                                value={ts.end}
                                onChange={e => {
                                  const newTs = [...form.opening_hours.timespans];
                                  newTs[index] = { ...ts, end: parseInt(e.target.value) || 0 };
                                  setForm(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, timespans: newTs } }));
                                }}
                                className="w-full px-3 py-1 bg-gray-50 border border-gray-100 rounded text-xs font-bold text-onestock-blue"
                              />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={ts.options.open} 
                              onChange={e => {
                                const newTs = [...form.opening_hours.timespans];
                                newTs[index] = { ...ts, options: { open: e.target.checked } };
                                setForm(prev => ({ ...prev, opening_hours: { ...prev.opening_hours, timespans: newTs } }));
                              }}
                              className="rounded text-onestock-blue scale-75" 
                            />
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Open</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
              <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-6 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancel</button>
              <button 
                onClick={handleSave}
                className="px-8 py-2 bg-[#002D72] text-white font-bold rounded-lg hover:bg-[#001F4D] shadow-lg transition-all text-sm"
              >
                {editingId ? 'Update Endpoint' : 'Save Endpoint'}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID / Name</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Capabilities</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settings.endpoints.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">No endpoints created yet. Click "Add Endpoint" to start.</td>
                  </tr>
                ) : (
                  settings.endpoints.map(endpoint => (
                    <tr key={endpoint.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-onestock-blue">{endpoint.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{endpoint.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {endpoint.classification.endpoint_type.map(t => (
                            <span key={t} className="px-2 py-1 bg-blue-50 text-onestock-blue text-[10px] font-bold rounded uppercase tracking-wider">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-600 font-medium">{endpoint.address.city} ({endpoint.address.regions.country.code})</div>
                        <div className="text-[10px] text-gray-400">{endpoint.address.zip_code}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(endpoint.modules).filter(([_, active]) => active).map(([m]) => (
                            <span key={m} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] font-bold rounded uppercase border border-emerald-100">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleGeneratePayload(endpoint)}
                            className="p-2 text-gray-400 hover:text-onestock-blue hover:bg-blue-50 rounded-lg transition-all"
                            title="Generate Payload"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                          </button>
                          <button 
                            onClick={() => {
                              const duplicate = { ...endpoint, id: `${endpoint.id}_copy`, name: `${endpoint.name} (Copy)` };
                              setForm(duplicate);
                              setEditingId(null);
                              setIsAdding(true);
                            }}
                            className="p-2 text-gray-400 hover:text-onestock-blue hover:bg-blue-50 rounded-lg transition-all"
                            title="Duplicate"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V7m-12 0h12" /></svg>
                          </button>
                          <button 
                            onClick={() => handleEdit(endpoint)}
                            className="p-2 text-gray-400 hover:text-onestock-blue hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button 
                            onClick={() => handleDelete(endpoint.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {generatedPayload && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#002D72]">Endpoint Payload</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setGeneratedPayload(null)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
              <button 
                onClick={handleCopy}
                className="px-4 py-2 text-xs font-bold text-onestock-blue border border-onestock-blue rounded-lg hover:bg-blue-50 transition-all"
              >
                {copyStatus || 'Copy JSON'}
              </button>
            </div>
          </div>
          <div className="bg-[#001F4D] rounded-xl overflow-hidden shadow-xl border border-white/10">
            <div className="p-6 max-h-96 overflow-y-auto text-[11px] font-mono text-blue-100">
              <pre>{generatedPayload}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepEndpointManager;
