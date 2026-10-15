import { onestockRequest, describeCallError } from './onestockClient';

export interface SalesChannelInfo {
  id: string;
  name?: string;
  description?: string;
  currency?: string;
  timezone?: string;
}

// Sales channels of the site, from GET /sales_channels ({ sales_channels: [...] } or { sales_channel: ... }).
export const fetchSalesChannels = async (): Promise<SalesChannelInfo[]> => {
  const { envelope } = await onestockRequest({ method: 'GET', path: '/sales_channels', body: {} });
  if (!envelope.ok) throw new Error(describeCallError(envelope));
  const body: any = envelope.body;
  const raw = Array.isArray(body) ? body
    : Array.isArray(body?.sales_channels) ? body.sales_channels
    : Array.isArray(body?.sales_channel) ? body.sales_channel
    : body?.sales_channel ? [body.sales_channel]
    : [];
  const channels = raw
    .filter((c: any) => c && (typeof c === 'string' || c.id))
    .map((c: any) => (typeof c === 'string'
      ? { id: c }
      : {
        id: String(c.id),
        name: c.name,
        description: c.description || c.informations?.description || c.name,
        currency: c.currency,
        timezone: c.timezone,
      }));
  if (channels.length === 0) throw new Error('GET /sales_channels returned no sales channel.');
  return channels;
};
