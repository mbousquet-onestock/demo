
import { Product, AppSettings } from '../types';

export const exportToOnestockApi = async (
  products: Product[],
  settings: AppSettings,
  onProgress: (msg: string) => void
): Promise<void> => {
  const { apiUrl, siteId, token, salesChannel } = settings;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
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
