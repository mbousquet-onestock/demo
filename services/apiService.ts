
import { Product, AppSettings } from '../types';

export const exportToOnestockApi = async (
  products: Product[],
  settings: AppSettings,
  onProgress: (msg: string) => void
): Promise<void> => {
  const { apiUrl, siteId, token, salesChannel, fieldMapping } = settings;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const getValue = (p: Product, key: keyof AppSettings['fieldMapping']): string | undefined => {
    const sourceField = fieldMapping[key];
    if (!sourceField || sourceField === 'none') return undefined;
    // Fix: Explicitly convert the value to string. 
    // Product fields can be string, number, or string[], but this helper must return string | undefined.
    const val = p[sourceField as keyof Product];
    return val !== undefined ? String(val) : undefined;
  };

  onProgress(`Connecting to: ${settings.apiName}`);
  onProgress('Initializing import session...');
  const createResponse = await fetch(`${apiUrl}/item_imports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ site_id: siteId, token: token })
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create import session: ${errorText}`);
  }

  const { id: importId } = await createResponse.json();
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

    const optionalFeatureKeys: (keyof AppSettings['fieldMapping'])[] = ['color', 'size', 'description', 'brand'];
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

  const uploadResponse = await fetch(`${apiUrl}/item_imports/${importId}/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ site_id: siteId, token: token, items: mappedItems })
  });

  if (!uploadResponse.ok) throw new Error(`Failed to upload items.`);

  onProgress('Closing import session...');
  const patchResponse = await fetch(`${apiUrl}/item_imports/${importId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ site_id: siteId, token: token, item_import: { status: 'closed' } })
  });

  if (!patchResponse.ok) throw new Error(`Failed to close session.`);
  onProgress('Import completed successfully!');
};

/**
 * Pushes stock levels to OneStock API
 */
export const exportStockToOnestockApi = async (
  stockData: { item_id: string; endpoint_id: string; quantity: number }[],
  settings: AppSettings,
  onProgress: (msg: string) => void
): Promise<void> => {
  const { apiUrl, siteId, token } = settings;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  onProgress('Constructing inventory payload...');
  const payload = {
    token: token,
    site_id: siteId,
    import: {
      incremental: false
    },
    stocks: stockData
  };

  onProgress(`Synchronizing stock levels for ${stockData.length} item-endpoint pairs...`);
  
  // NOTE: OneStock usually uses /stock_imports for bulk updates
  const response = await fetch(`${apiUrl}/stock_imports`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stock Import Failed: ${errorText}`);
  }

  onProgress('Stock synchronization completed successfully.');
};
