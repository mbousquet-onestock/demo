
import { Product, AppSettings } from '../types';
import { onestockRequest, getActiveConnection, connectionFromSettings, describeError } from './onestockClient';

export const exportToOnestockApi = async (
  products: Product[],
  settings: AppSettings,
  onProgress: (msg: string) => void
): Promise<void> => {
  const { salesChannel } = settings;
  // Uses the active connection instance (token from /login), else the values typed in API Settings.
  // Every call goes through the Vercel proxy and gets site_id / token injected in its body.
  const connection = getActiveConnection() || connectionFromSettings(settings);
  const call = async (method: string, path: string, body: Record<string, unknown>) => {
    const { envelope } = await onestockRequest({ method, path, body, connection });
    if (!envelope.ok) throw new Error(describeError(envelope));
    return envelope.body as any;
  };

  const fixedMapping: Record<string, keyof Product | 'none'> = {
    id: 'sku',
    product_id: 'parentSku',
    name: 'name',
    color: 'color',
    size: 'size',
    image: 'imageUrl',
    description: 'description',
    brand: 'none',
    price: 'price',
    category: 'category'
  };

  const getValue = (p: Product, key: string): string | undefined => {
    const sourceField = fixedMapping[key];
    if (!sourceField || sourceField === 'none') return undefined;
    const val = p[sourceField as keyof Product];
    return val !== undefined ? String(val) : undefined;
  };

  onProgress(`Connecting to: ${connection.name}`);
  onProgress('Initializing import session...');
  let importId: string;
  try {
    ({ id: importId } = await call('POST', '/item_imports', {}));
  } catch (e: any) {
    throw new Error(`Failed to create import session: ${e.message}`);
  }
  onProgress(`Session created: ID ${importId}`);

  onProgress(`Uploading ${products.length} unique articles using dynamic schema...`);
  
  const mappedItems = products.map(p => {
    const rawPrice = getValue(p, 'price') || p.price;
    const numericPrice = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
    const currency = rawPrice.replace(/[0-9.,\s]/g, '') || 'EUR';

    const features: any = {
      name: [getValue(p, 'name') || p.name],
      active_sfs: ["true"],
      active: ["true"]
    };

    const optionalFeatureKeys: string[] = ['color', 'size', 'description', 'brand'];
    optionalFeatureKeys.forEach(key => {
      const val = getValue(p, key);
      if (val) features[key] = [val];
    });

    const imageVal = getValue(p, 'image');
    if (imageVal) {
      features.image = [imageVal];
      features.big_images = [imageVal];
    }

    const item: any = {
      id: getValue(p, 'id') || p.sku,
      product_id: getValue(p, 'product_id') || p.parentSku,
      category_ids: getValue(p, 'category') ? [getValue(p, 'category')] : ["uncategorized"],
      features: {
        en: features,
        fr: JSON.parse(JSON.stringify(features))
      },
      weight: settings.defaultWeight,
      height: settings.defaultHeight,
      width: settings.defaultWidth,
      length: settings.defaultLength,
      sales_channels_features: {
        [salesChannel]: {
          compare_at_price: 0,
          currency: currency,
          price: numericPrice
        }
      }
    };

    return item;
  });

  try {
    await call('POST', `/item_imports/${importId}/items`, { items: mappedItems });
  } catch (e: any) {
    throw new Error(`Failed to upload items: ${e.message}`);
  }

  onProgress('Closing import session...');
  try {
    await call('PATCH', `/item_imports/${importId}`, { item_import: { status: 'closed' } });
  } catch (e: any) {
    throw new Error(`Failed to close session: ${e.message}`);
  }
  onProgress('Import completed successfully!');
};

// Synchronous stock import (PATCH /stock_import), through the proxy with the active connection.
export const exportStockToOnestockApi = async (
  stocks: { item_id: string; endpoint_id: string; quantity: number }[],
  settings: AppSettings,
  onProgress: (msg: string) => void
): Promise<void> => {
  const connection = getActiveConnection() || connectionFromSettings(settings);
  onProgress(`Connecting to: ${connection.name}`);
  onProgress(`Sending ${stocks.length} stock line(s) to PATCH /stock_import...`);
  const { envelope } = await onestockRequest({
    method: 'PATCH',
    path: '/stock_import',
    body: { import: { incremental: false }, stocks },
    connection,
  });
  if (!envelope.ok) throw new Error(describeError(envelope));
  onProgress('Stock import completed successfully!');
};
