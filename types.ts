
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
  features?: {
    [lang: string]: {
      [key: string]: (string | number | boolean)[];
    };
  };
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
  ORDER_GENERATION = 'ORDER_GENERATION',
  API_EXPLORER = 'API_EXPLORER',
  API_LOG = 'API_LOG',
  STOCK_POINTS = 'STOCK_POINTS'
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
  // Base URL of the OneStock API, e.g. https://c500.api.qualif.onestock-retail.com
  apiUrl: string;
  apiVersion?: OnestockApiVersion;
  siteId: string;
  // Token used by every call (stored encrypted in the database).
  token: string;
  // OpenAI key for AI generation (optional when OPENAI_API_KEY is set on the server; stored encrypted).
  openaiApiKey?: string;
  openaiModel?: string;
  salesChannel: string;
  stockEndpoints: string[];
  endpoints: Endpoint[];
  orderSalesChannels: string[];
  deliveryCountries: { code: string; name: string; currency?: string }[];
  // Sales channels last loaded with GET /sales_channels (Order Generator).
  salesChannelsCache?: { id: string; name?: string; description?: string; currency?: string }[];
  // Collection points used for CKC / ROPIS generated orders.
  orderDeliveryPoints?: string[];
  rulesets: string[];
  defaultWeight: number;
  defaultHeight: number;
  defaultWidth: number;
  defaultLength: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiName: 'OneStock Item Import API',
  apiUrl: '',
  apiVersion: 'v3',
  siteId: '',
  token: '',
  salesChannel: 'sc_ois_1',
  stockEndpoints: ['Store_1', 'Store_2', 'Warehouse_Main'],
  endpoints: [],
  orderSalesChannels: ['TikTok_Spain', 'Tefal_UK', 'Web_France', 'Mobile_App'],
  deliveryCountries: [
    { code: 'FR', name: 'France' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'ES', name: 'Spain' },
    { code: 'CH', name: 'Switzerland' }
  ],
  rulesets: ['ruleset_ckc_01', 'ruleset_sfs_02'],
  defaultWeight: 0.4,
  defaultHeight: 3,
  defaultWidth: 15,
  defaultLength: 20
};

export type OnestockApiVersion = 'v1' | 'v2' | 'v3' | 'v4';

export interface SavedPayload {
  id: string;
  name: string;
  // Free-form project label used to group saved payloads.
  project?: string;
  createdAt: string;
  source: 'explorer' | 'products' | 'stock';
  method: string;
  path: string;
  url?: string;
  connectionName?: string;
  request?: unknown;
  response?: unknown;
  status?: number;
  durationMs?: number;
}

export interface OnestockGetEndpoint {
  path: string;
  tag: string;
  summary: string;
  internal: boolean;
  pathParams: string[];
  bodyFields: string[];
  exampleBody: Record<string, unknown> | null;
  versions: OnestockApiVersion[];
}

// A OneStock stock location ("endpoint") as sent to POST /endpoints.
export interface StockPointDraft {
  id: string;
  name: string;
  address?: {
    lines?: string[];
    city?: string;
    zip_code?: string;
    regions?: { country?: { code?: string; name?: string } };
    coordinates?: { lat?: number; lon?: number };
    contact?: { email?: string; phone_number?: string };
  };
  timezone?: string;
  classification?: Record<string, string[]>;
  modules?: { ffs?: boolean; ckc?: boolean; cfs?: boolean; ropis?: boolean };
  [key: string]: unknown;
}

export interface StockPointPushResult {
  ok: boolean;
  status: number | null;
  message: string;
  at: string;
  requestId?: string;
}

// A generated set of stock points, saved and filed under a project.
export interface StockPointSet {
  id: string;
  name: string;
  project?: string;
  context: string;
  count: number;
  idPrefix?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  endpoints: StockPointDraft[];
  // Creation result per endpoint id (POST /endpoints).
  pushResults?: Record<string, StockPointPushResult>;
}

// A generated batch of customer orders (Order Generator), saved under a project.
export interface OrderBatch {
  id: string;
  name: string;
  project?: string;
  createdAt: string;
  updatedAt: string;
  // Parent order payload, sub-order payloads and customer, per generated order.
  packages: { parent: any; subOrders: any[]; customer: any }[];
  // Creation result per order, keyed "parent:<id>" / "order:<id>".
  pushResults?: Record<string, StockPointPushResult>;
}
