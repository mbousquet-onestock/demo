import React, { useState } from 'react';
import { deliveryConfigStore, loadDeliveryConfig } from '../services/deliveryRouteService';
import { useApiTarget, missingTargetFields } from '../services/onestockClient';
import DeliveryBuilder from './DeliveryBuilder';

// Delivery Routes → Create (AI): Delivery Promise configuration (timetables, zones, routes) from a prompt.
const StepDeliveryCreate: React.FC = () => {
  const config = deliveryConfigStore.use();
  const target = useApiTarget();
  const missing = missingTargetFields(target);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { await loadDeliveryConfig(setLoading); } catch (err: any) { setError(err?.message || String(err)); } finally { setLoading(null); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-2xl font-bold text-[#002D72]">Create delivery configuration</h2>
          <p className="text-sm text-gray-500 mt-1">
            Carrier timetables, zones and delivery routes from a prompt, run with <span className="font-mono">POST /timetables</span>,{' '}
            <span className="font-mono">/zones</span> and <span className="font-mono">/delivery_routes</span>, saved per project.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {config
              ? <>Checked against site <strong>{config.site}</strong> (read {new Date(config.loadedAt).toLocaleString()}): {config.zones.length} zone(s), {config.routes.length} route(s), {config.endpoints.length} stock point(s){config.site !== target.siteId && <span className="text-amber-600"> · another site is selected now: reload</span>}</>
              : 'Load the site configuration to check the references (existing zones, timetables, stock points) and give them to ChatGPT.'}
          </p>
        </div>
        <button onClick={load} disabled={!!loading || !!missing} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">
          {loading || (config ? 'Reload the site configuration' : 'Load the site configuration')}
        </button>
      </div>
      {missing && <p className="text-sm text-amber-700">Missing in API Settings: {missing}</p>}
      {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
      <DeliveryBuilder config={config} onDone={() => { if (config) load(); }} />
    </div>
  );
};

export default StepDeliveryCreate;
