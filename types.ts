
export interface Product {
  id: string;
  sku: string;
  parentSku: string;
  name: string;
  description: string;
  imageUrl: string;
  productUrl: string;
  price: string;
  comparePrice?: string;
  currency: string;
  color: string;
  size: string;
  category: string;
  department: string;
  subdepartment: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  images_big: string[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export enum AppStep {
  HISTORY = 'HISTORY',
  INPUT = 'INPUT',
  SCANNING = 'SCANNING',
  RESULTS = 'RESULTS',
  IMPORTING = 'IMPORTING',
  SUCCESS = 'SUCCESS',
  SETTINGS = 'SETTINGS',
  STOCK_UPDATE = 'STOCK_UPDATE',
  JSON_VIEWER = 'JSON_VIEWER',
  ORDER_GENERATION = 'ORDER_GENERATION'
}

export interface ProcessedSite {
  id: string;
  url: string;
  hostname: string;
  date: string;
  products: Product[];
  sources?: GroundingSource[];
}

export interface AppSettings {
  apiName: string;
  apiUrl: string;
  siteId: string;
  token: string;
  salesChannel: string;
  stockEndpoints: string[];
  orderSalesChannels: string[];
  deliveryCountries: { code: string; name: string }[];
  rulesets: string[];
  defaultWeight: number;
  defaultHeight: number;
  defaultWidth: number;
  defaultLength: number;
  fieldMapping: {
    id: keyof Product | 'none';
    product_id: keyof Product | 'none';
    name: keyof Product | 'none';
    color: keyof Product | 'none';
    size: keyof Product | 'none';
    image: keyof Product | 'none';
    description: keyof Product | 'none';
    brand: keyof Product | 'none';
    price: keyof Product | 'none';
    category: keyof Product | 'none';
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiName: 'OneStock Item Import API',
  apiUrl: 'https://api.onestock-retail.com',
  siteId: '{{site_id}}',
  token: '{{token}}',
  salesChannel: 'sc_ois_1',
  stockEndpoints: ['Store_1', 'Store_2', 'Warehouse_Main'],
  orderSalesChannels: ['TikTok_Spain', 'Tefal_UK', 'Web_France', 'Mobile_App'],
  deliveryCountries: [
    { code: 'FR', name: 'France' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'ES', name: 'Spain' }
  ],
  rulesets: ['ruleset_ckc_01', 'ruleset_sfs_02'],
  defaultWeight: 0.4,
  defaultHeight: 3,
  defaultWidth: 15,
  defaultLength: 20,
  fieldMapping: {
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
  }
};
