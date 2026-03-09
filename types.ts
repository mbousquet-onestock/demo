
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

export interface Endpoint {
  id: string;
  name: string;
  sales_channel_id: string;
  timezone: string;
  workflow_id: string;
  currency: string | null;
  locked: any;
  modules: {
    cfs: boolean;
    ckc: boolean;
    ffs: boolean;
    ois: boolean;
    ropis: boolean;
  };
  address: {
    id: string;
    city: string;
    contact: {
      phone_number: string;
      email: string;
    };
    coordinates: {
      lon: number;
      lat: number;
    };
    lines: string[];
    regions: {
      country: {
        code: string;
      };
    };
    zip_code: string;
  };
  classification: {
    endpoint_type: string[];
    scan_mode: string[];
    store_profile: string[];
  };
  open: boolean;
  opening_hours: {
    id: string;
    type: string;
    timezone: string;
    timespans: any[];
  };
  opening_hours_next_seven_days: {
    opening_hours: any[];
  };
  execution_times: any;
  configurations: {
    order_in_store: {
      catalog: boolean;
      immediate_pickup: boolean;
      delivery: boolean;
    };
    delivery_promise: {
      milestones: boolean;
    };
  };
}

export interface AppSettings {
  apiName: string;
  apiUrl: string;
  siteId: string;
  token: string;
  salesChannel: string;
  stockEndpoints: string[];
  endpoints: Endpoint[];
  orderSalesChannels: string[];
  deliveryCountries: { code: string; name: string }[];
  rulesets: string[];
  defaultWeight: number;
  defaultHeight: number;
  defaultWidth: number;
  defaultLength: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiName: 'OneStock Item Import API',
  apiUrl: 'https://api.onestock-retail.com',
  siteId: '{{site_id}}',
  token: '{{token}}',
  salesChannel: 'sc_ois_1',
  stockEndpoints: ['Store_1', 'Store_2', 'Warehouse_Main'],
  endpoints: [],
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
  defaultLength: 20
};
