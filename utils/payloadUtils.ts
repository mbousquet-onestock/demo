import { Product, AppSettings } from '../types';

// Builds the OneStock item representation used by /items (shared by the JSON viewer, download and API push).
export const buildOnestockItem = (p: Product, settings: AppSettings) => {
  let features: any = null;
  if (p.features) {
    features = JSON.parse(JSON.stringify(p.features));
    Object.keys(features).forEach(lang => {
      if (features[lang].libelle_produit) {
        features[lang].name = features[lang].libelle_produit;
        delete features[lang].libelle_produit;
      }
    });
  }

  const defaultFeatures = () => ({
    color: [p.color],
    departement: [p.department],
    subdepartement: [p.subdepartment],
    image: [p.imageUrl],
    images_big: [p.imageUrl],
    long_description: [p.description],
    name: [p.description], // libelle_produit renamed to name
    price: [p.price],
    size: [p.size],
    weight: [p.weight]
  });

  return {
    id: p.sku,
    category_ids: [p.category],
    is_default: true,
    product_id: p.parentSku,
    features: features || { en: defaultFeatures(), fr: defaultFeatures() },
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
  };
};

export const buildItemsPayload = (products: Product[], settings: AppSettings) => ({
  items: products.map(p => buildOnestockItem(p, settings))
});

export type IdStrategy = 'random' | 'sequential' | 'timestamp';

export interface RegenerateIdsOptions {
  prefix: string;
  strategy: IdStrategy;
  startAt: number;
  // Keep variants grouped: products sharing a parentSku get the same new product_id.
  regenerateParent: boolean;
  // Suffix the item id with the size (e.g. MYPRE-0001_M) when available.
  appendSize: boolean;
}

const randomToken = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9-]+/g, '').toUpperCase();

// Returns new copies of the given products with fresh, unique sku / parentSku.
export const regenerateProductIds = (products: Product[], options: RegenerateIdsOptions): Product[] => {
  const prefix = options.prefix.trim();
  const runStamp = Date.now().toString(36).toUpperCase();
  let parentCounter = options.startAt;
  let itemCounter = options.startAt;
  const parentMap = new Map<string, string>();
  const used = new Set<string>();

  const makeBase = (counter: number) => {
    switch (options.strategy) {
      case 'sequential': return String(counter).padStart(4, '0');
      case 'timestamp': return `${runStamp}${String(counter).padStart(3, '0')}`;
      default: return randomToken();
    }
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join('-');

  return products.map(p => {
    let parentSku = p.parentSku;
    if (options.regenerateParent) {
      const key = p.parentSku || p.id;
      if (!parentMap.has(key)) parentMap.set(key, join(prefix, makeBase(parentCounter++)));
      parentSku = parentMap.get(key)!;
    }

    let sku: string;
    const size = options.appendSize ? sanitize(p.size || '') : '';
    do {
      sku = options.regenerateParent
        ? [parentSku, size || makeBase(itemCounter++)].join('_')
        : join(prefix, makeBase(itemCounter++), size);
      // Two variants with the same size under one parent: fall back to a counter.
      if (used.has(sku)) sku = `${sku}_${makeBase(itemCounter++)}`;
    } while (used.has(sku));
    used.add(sku);

    return { ...p, sku, parentSku };
  });
};
