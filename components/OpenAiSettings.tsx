import React, { useEffect, useState } from 'react';
import { AppSettings } from '../types';
import { getAiStatus, AiStatus, DEFAULT_AI_MODEL } from '../services/aiService';

interface OpenAiSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const inputClass = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-onestock-blue';

// OpenAI key and model used by the AI features (stock points, customers, prices).
const OpenAiSettings: React.FC<OpenAiSettingsProps> = ({ settings, onSave }) => {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => { getAiStatus().then(setStatus); }, []);

  const hasKey = !!settings.openaiApiKey?.trim();
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-bold text-[#002D72] uppercase tracking-widest border-l-4 border-[#002D72] pl-3">OpenAI (ChatGPT)</h3>
          <p className="text-gray-500 text-sm mt-2 max-w-2xl">
            Used to generate stock points, customer identities / addresses and missing article prices.
            The key is stored encrypted in the database and kept in this browser.
          </p>
        </div>
        <div className={`text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 ${hasKey || status?.serverKey ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {hasKey ? 'Key set' : status?.serverKey ? 'Server key (OPENAI_API_KEY)' : 'No key'}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">API key {status?.serverKey ? '(optional — the server key is used otherwise)' : ''}</label>
            <button onClick={() => setShow(v => !v)} className="text-[10px] font-bold text-onestock-blue hover:underline">{show ? 'Hide' : 'Show'}</button>
          </div>
          <input
            type={show ? 'text' : 'password'}
            value={settings.openaiApiKey || ''}
            onChange={e => onSave({ ...settings, openaiApiKey: e.target.value.trim() })}
            placeholder="sk-…"
            autoComplete="off"
            className={inputClass + ' font-mono'}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Model</label>
          <input
            value={settings.openaiModel || ''}
            onChange={e => onSave({ ...settings, openaiModel: e.target.value.trim() })}
            placeholder={status?.defaultModel || DEFAULT_AI_MODEL}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
};

export default OpenAiSettings;
