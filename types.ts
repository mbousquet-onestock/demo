
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
  RESULTS = 'RESULTS',
  SETTINGS = 'SETTINGS',
  STOCK_UPDATE = 'STOCK_UPDATE',
  ORDER_GENERATION = 'ORDER_GENERATION',
  API_EXPLORER = 'API_EXPLORER',
  API_LOG = 'API_LOG',
  STOCK_POINTS = 'STOCK_POINTS',
  MANUAL_STEPS = 'MANUAL_STEPS',
  PROJECTS = 'PROJECTS'
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

// OneStock site usable by the app (API Settings), chosen in the top bar.
export interface SiteProfile {
  id: string;
  label: string;
  siteId: string;
  // Own token of this site (stored encrypted in the database), used when tokenId is not set.
  token: string;
  // Shared token used by this site (ApiTokenProfile id).
  tokenId?: string;
}

// Token shared by several sites (stored encrypted in the database).
export interface ApiTokenProfile {
  id: string;
  label: string;
  token: string;
}

// OneStock API URL usable by the app; "{site_id}" is replaced by the selected site.
export interface ApiUrlProfile {
  id: string;
  label: string;
  url: string;
}

export interface AppSettings {
  apiName: string;
  // Base URL of the OneStock API, e.g. https://c500.api.qualif.onestock-retail.com
  apiUrl: string;
  apiVersion?: OnestockApiVersion;
  siteId: string;
  // Token used by every call (stored encrypted in the database).
  token: string;
  // Sites / URLs defined in API Settings; apiUrl, siteId and token hold the selected ones.
  sites?: SiteProfile[];
  apiUrls?: ApiUrlProfile[];
  tokens?: ApiTokenProfile[];
  activeSiteId?: string;
  activeUrlId?: string;
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
  // Next order ids of the Order Generator, shared by every browser (avoids re-using ids already sent to OneStock).
  orderIds?: { parentOrderId: string; orderIdPrefix: string; startIndex: number };
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

// A step to perform by hand (outside the app), filed under a project.
export interface ManualStep {
  id: string;
  project?: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  // Position within its project.
  order: number;
  createdAt: string;
  updatedAt: string;
  doneAt?: string;
}

// Product sheet read on a client website (Product Manager → Capture).
export interface CapturedProduct {
  name: string;
  sku: string;
  gtin: string;
  productGroupId: string;
  brand: string;
  description: string;
  images: string[];
  url: string;
  // Page the product was read on.
  page: string;
  price: string;
  currency: string;
  availability: string;
  color: string;
  size: string;
  category: string;
  characteristics: { name: string; value: string }[];
  variants: {
    sku: string; gtin: string; name: string; color: string; size: string;
    price: string; currency: string; image: string; url: string; availability: string;
  }[];
  // json-ld | microdata | opengraph | html
  source: string;
  // Where the variants come from: json-ld | page-json | shopify | page-options (selector values, no variant SKU)
  variantSource?: string;
  capturedAt: string;
}

export interface ProductCaptureSet {
  id: string;
  name: string;
  project?: string;
  createdAt: string;
  updatedAt: string;
  products: CapturedProduct[];
}
