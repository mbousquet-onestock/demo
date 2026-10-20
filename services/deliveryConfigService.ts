import { getWithFields } from './metricService';

// Delivery methods of the site, from the delivery configs (GET /delivery_configs): one config per delivery
// method / sales channel.
export interface DeliveryMethodInfo {
  id: string;
  // Sales channels having a delivery config for this method (empty: unknown / any).
  salesChannels: string[];
}

export const fetchDeliveryMethods = async (): Promise<DeliveryMethodInfo[]> => {
  const body: any = await getWithFields('/delivery_configs', ['delivery_method', 'sales_channel_id', 'delivery_zone_ids']);
  const raw: any[] = Array.isArray(body) ? body
    : Array.isArray(body?.delivery_configs) ? body.delivery_configs
    : body?.delivery_configs && typeof body.delivery_configs === 'object' ? Object.values(body.delivery_configs)
    : (Object.values(body || {}).find(v => Array.isArray(v)) as any[]) || [];
  const byMethod = new Map<string, Set<string>>();
  raw.forEach(c => {
    const method = c?.delivery_method;
    if (!method) return;
    const set = byMethod.get(method) || new Set<string>();
    if (c.sales_channel_id) set.add(String(c.sales_channel_id));
    byMethod.set(method, set);
  });
  if (byMethod.size === 0) throw new Error('GET /delivery_configs returned no delivery method.');
  return [...byMethod.entries()].map(([id, s]) => ({ id, salesChannels: [...s].sort() })).sort((a, b) => a.id.localeCompare(b.id));
};
