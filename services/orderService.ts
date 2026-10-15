import { SITE_ID_VAR, TOKEN_VAR } from './onestockClient';
import { callAi } from './aiService';
import { Product } from '../types';

export type OrderStrategy = 'sfs' | 'ckc' | 'ropis';
export const ORDER_STRATEGIES: OrderStrategy[] = ['sfs', 'ckc', 'ropis'];

export interface OrderGenerationConfig {
  strategies: OrderStrategy[];
  // Number of customer orders (one parent order each).
  orderCount: number;
  subOrdersMin: number;
  subOrdersMax: number;
  itemsMin: number;
  itemsMax: number;
  qtyMin: number;
  qtyMax: number;
  // Destination countries: one is drawn per order (evenly spread).
  countries: DestinationCountry[];
  // Default currency, when neither the sales channel nor the country has one.
  currency: string;
  // Empty: a random sales channel among `salesChannels` for each order.
  salesChannel: string;
  salesChannels: string[];
  // Currency of each sales channel, when known (used instead of `currency`).
  channelCurrencies?: Record<string, string>;
  parentOrderId: string;
  // "{TYPE}" is replaced by the strategy of the sub-order (SFS, CKC, ROPIS).
  orderIdPrefix: string;
  startIndex: number;
  // Collection points for CKC / ROPIS sub-orders.
  deliveryPoints: string[];
}

export interface DestinationCountry {
  code: string;
  name?: string;
  currency?: string;
}

export interface CustomerIdentity {
  title: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  address: { lines: string[]; city: string; zip_code: string };
}

export interface OrderPackage {
  parent: any;
  subOrders: any[];
  customer: CustomerIdentity;
  country?: string;
}

// Customer of one order, in the country drawn for that order.
export interface OrderCustomer {
  customer: CustomerIdentity;
  country: DestinationCountry;
}

const FALLBACK_COUNTRY_DATA: Record<string, { phonePrefix: string; titles: string[]; firstNames: string[]; lastNames: string[]; addresses: { city: string; zip_code: string; lines: string[] }[] }> = {
  FR: {
    phonePrefix: '+336',
    titles: ['M.', 'Mme'],
    firstNames: ['Jean', 'Marie', 'Lucas', 'Sophie', 'Inès', 'Théo', 'Léa', 'Manon', 'Gabriel', 'Camille'],
    lastNames: ['Dupont', 'Lefebvre', 'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand'],
    addresses: [
      { city: 'Toulouse', zip_code: '31400', lines: ['8 Rue des Trente-Six Ponts'] },
      { city: 'Paris', zip_code: '75011', lines: ['24 Rue Oberkampf'] },
      { city: 'Lyon', zip_code: '69003', lines: ['15 Cours Lafayette'] },
      { city: 'Nantes', zip_code: '44000', lines: ['3 Rue Crébillon'] },
    ],
  },
  GB: {
    phonePrefix: '+447',
    titles: ['Mr', 'Mrs', 'Ms'],
    firstNames: ['James', 'Mary', 'Robert', 'Olivia', 'George'],
    lastNames: ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson'],
    addresses: [{ city: 'London', zip_code: 'W1U 1EE', lines: ['10-12 James St'] }, { city: 'Manchester', zip_code: 'M1 1AE', lines: ['5 Piccadilly'] }],
  },
  ES: {
    phonePrefix: '+346',
    titles: ['Sr.', 'Sra.'],
    firstNames: ['Antonio', 'Maria', 'Jose', 'Lucia', 'Pablo'],
    lastNames: ['Garcia', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Lopez'],
    addresses: [{ city: 'Madrid', zip_code: '28001', lines: ['Calle de Serrano, 1'] }, { city: 'Barcelona', zip_code: '08002', lines: ['Carrer de Ferran, 10'] }],
  },
  CH: {
    phonePrefix: '+417',
    titles: ['Herr', 'Frau'],
    firstNames: ['Lukas', 'Sophie', 'Thomas', 'Anna', 'Marc'],
    lastNames: ['Müller', 'Schmidt', 'Fischer', 'Meyer', 'Favre'],
    addresses: [{ city: 'Zürich', zip_code: '8001', lines: ['Bahnhofstrasse 1'] }, { city: 'Geneva', zip_code: '1201', lines: ['Rue du Rhône 10'] }],
  },
};

const randomInt = (min: number, max: number) => {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const fallbackCustomer = (countryCode: string): CustomerIdentity => {
  const data = FALLBACK_COUNTRY_DATA[countryCode] || FALLBACK_COUNTRY_DATA.FR;
  return {
    title: pick(data.titles),
    first_name: pick(data.firstNames),
    last_name: pick(data.lastNames),
    phone_number: `${data.phonePrefix}${randomInt(10000000, 99999999)}`,
    address: pick(data.addresses),
  };
};

// Customer identities / addresses with ChatGPT (batches of 25); local sample data when AI is not used.
export const generateCustomers = async (
  count: number,
  countryCode: string,
  countryName: string | undefined,
  useAi: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<CustomerIdentity[]> => {
  if (!useAi) return Array.from({ length: count }, () => fallbackCustomer(countryCode));
  const result: CustomerIdentity[] = [];
  while (result.length < count) {
    const batch = Math.min(25, count - result.length);
    const data = await callAi<{ customers: any[] }>('customers', { countryCode, countryName, count: batch }, `customers ${countryCode}`);
    const received = (data.customers || []).filter(c => c && c.first_name && c.address?.city);
    if (received.length === 0) throw new Error('The AI returned no customer.');
    received.slice(0, batch).forEach(c => result.push({
      title: String(c.title || ''),
      first_name: String(c.first_name),
      last_name: String(c.last_name || ''),
      phone_number: String(c.phone_number || ''),
      address: {
        lines: Array.isArray(c.address.lines) ? c.address.lines.map(String) : [String(c.address.lines || '')],
        city: String(c.address.city),
        zip_code: String(c.address.zip_code || ''),
      },
    }));
    onProgress?.(result.length, count);
  }
  return result;
};

// Draws a country per order (each selected country gets its share, order shuffled), then generates the customers
// country by country.
export const generateOrderCustomers = async (
  orderCount: number,
  countries: DestinationCountry[],
  useAi: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<{ customers: OrderCustomer[]; warnings: string[] }> => {
  const drawn = Array.from({ length: orderCount }, (_, i) => countries[i % countries.length]);
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [drawn[i], drawn[j]] = [drawn[j], drawn[i]];
  }
  const customers: OrderCustomer[] = new Array(orderCount);
  const warnings: string[] = [];
  let done = 0;
  for (const country of countries) {
    const slots = drawn.map((c, i) => (c.code === country.code ? i : -1)).filter(i => i >= 0);
    if (slots.length === 0) continue;
    let list: CustomerIdentity[];
    try {
      list = await generateCustomers(slots.length, country.code, country.name, useAi, d => onProgress?.(done + d, orderCount));
    } catch (err: any) {
      warnings.push(`AI customers failed for ${country.code} (${err?.message || err}): sample identities used.`);
      list = await generateCustomers(slots.length, country.code, country.name, false);
    }
    slots.forEach((slot, k) => { customers[slot] = { customer: list[k], country }; });
    done += slots.length;
    onProgress?.(done, orderCount);
  }
  return { customers, warnings };
};

export const hasPrice = (p: Product) => (parseFloat(String(p.price).replace(',', '.')) || 0) > 0;

// Prices for articles without a price, with ChatGPT (batches of 50); random 10–100 when AI is not used.
export const priceMissingArticles = async (
  products: Product[],
  currency: string,
  useAi: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<Record<string, number>> => {
  const missing = products.filter(p => !hasPrice(p));
  const prices: Record<string, number> = {};
  if (!useAi) {
    missing.forEach(p => { prices[p.sku] = round2(randomInt(1000, 10000) / 100); });
    return prices;
  }
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const data = await callAi<{ prices: { sku: string; price: number }[] }>('prices', {
      currency,
      items: chunk.map(p => ({ sku: p.sku, name: p.name, category: p.category, description: p.description })),
    }, `prices (${chunk.length} articles)`);
    (data.prices || []).forEach(r => {
      const price = Number(r?.price);
      if (r?.sku && price > 0) prices[String(r.sku)] = round2(price);
    });
    onProgress?.(Math.min(i + 50, missing.length), missing.length);
  }
  // Anything the AI skipped still gets a price.
  missing.forEach(p => { if (!prices[p.sku]) prices[p.sku] = round2(randomInt(1000, 10000) / 100); });
  return prices;
};

// Next id: the trailing number is incremented, keeping its width (2026100001 → 2026100002, ORD-9 → ORD-10).
export const incrementId = (id: string, by = 1): string => {
  const match = id.match(/^(.*?)(\d+)$/);
  if (!match) return `${id}-${by}`;
  const next = (BigInt(match[2]) + BigInt(by)).toString().padStart(match[2].length, '0');
  return `${match[1]}${next}`;
};

const STRATEGY_SETTINGS: Record<OrderStrategy, { types: string[]; deliveryMethod: string; shipping: number }> = {
  sfs: { types: ['ffs'], deliveryMethod: 'standard_hd', shipping: 10 },
  ckc: { types: ['ffs', 'ckc'], deliveryMethod: 'standard_ckc', shipping: 0 },
  ropis: { types: ['ropis'], deliveryMethod: 'standard_ropis', shipping: 0 },
};

export const validateConfig = (config: OrderGenerationConfig, products: Product[]): string | null => {
  if (products.length === 0) return 'No article selected: select items in the Product Manager first.';
  if (config.strategies.length === 0) return 'Select at least one order strategy.';
  if (config.countries.length === 0) return 'Select at least one destination country.';
  if (config.orderCount < 1) return 'The number of orders must be at least 1.';
  if ([config.subOrdersMin, config.itemsMin, config.qtyMin].some(v => v < 1)) return 'Minimum values must be at least 1.';
  if (config.subOrdersMin > config.subOrdersMax || config.itemsMin > config.itemsMax || config.qtyMin > config.qtyMax) return 'A minimum is greater than its maximum.';
  if (config.strategies.some(s => s !== 'sfs') && config.deliveryPoints.length === 0) return 'CKC / ROPIS need at least one delivery point.';
  if (!config.salesChannel && config.salesChannels.length === 0) return 'No sales channel: load them from OneStock or type one.';
  return null;
};

export const generateOrderPackages = (
  config: OrderGenerationConfig,
  products: Product[],
  customers: OrderCustomer[],
  aiPrices: Record<string, number>
): OrderPackage[] => {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const cutoff = now + 3600 * 4;
  const etaStart = now + day * 2;
  const etaEnd = now + day * 5;
  const email = 'alertes_os@onestock-retail.com';
  const unitPrice = (p: Product) => (hasPrice(p) ? round2(parseFloat(String(p.price).replace(',', '.'))) : aiPrices[p.sku] ?? 0);

  const packages: OrderPackage[] = [];
  let counter = config.startIndex;

  for (let o = 0; o < config.orderCount; o++) {
    const parentId = incrementId(config.parentOrderId, o);
    const country = customers[o]?.country || config.countries[o % config.countries.length];
    const customer = customers[o]?.customer || fallbackCustomer(country.code);
    const salesChannel = config.salesChannel || pick(config.salesChannels);
    const currency = config.channelCurrencies?.[salesChannel] || country.currency || config.currency;
    const contact = {
      title: customer.title,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone_number: customer.phone_number,
      email,
    };
    const address = {
      city: customer.address.city,
      contact,
      lines: customer.address.lines,
      regions: { country: { code: country.code } },
      zip_code: customer.address.zip_code,
    };

    const subOrders: any[] = [];
    let parentTotal = 0;
    const subCount = randomInt(config.subOrdersMin, config.subOrdersMax);

    for (let s = 0; s < subCount; s++) {
      const strategy = pick(config.strategies);
      const st = STRATEGY_SETTINGS[strategy];
      const itemCount = Math.min(randomInt(config.itemsMin, config.itemsMax), products.length);
      const selected = [...products].sort(() => 0.5 - Math.random()).slice(0, itemCount);

      let subtotal = 0;
      const orderItems = selected.map(p => {
        const quantity = randomInt(config.qtyMin, config.qtyMax);
        const unit = unitPrice(p);
        const price = round2(unit * quantity);
        subtotal += price;
        return {
          item_id: p.sku,
          quantity,
          pricing_details: { original_price: price, price, original_unit_price: unit, unit_price: unit },
          information: {},
        };
      });

      const total = round2(subtotal + st.shipping);
      parentTotal += total;
      const orderId = `${config.orderIdPrefix.replace(/\{TYPE\}/gi, strategy.toUpperCase())}${String(counter++).padStart(3, '0')}`;
      const endpointId = strategy === 'sfs' ? undefined : pick(config.deliveryPoints);

      subOrders.push({
        site_id: SITE_ID_VAR,
        token: TOKEN_VAR,
        order: {
          id: orderId,
          parent_order_id: parentId,
          types: st.types,
          sales_channel: salesChannel,
          date: now,
          delivery: {
            destination: { address, ...(endpointId ? { endpoint_id: endpointId } : {}) },
            carrier: { name: 'mock' },
            type: 'standard',
          },
          delivery_promise: {
            original_delivery_option: {
              carbon_footprint: 100,
              cost: st.shipping,
              cutoff,
              delivery_method: st.deliveryMethod,
              destination: { location: { country: country.code, zip_code: customer.address.zip_code } },
              eta_end: etaEnd,
              eta_start: etaStart,
              shipment_number: 1,
              status: 'valid',
            },
            sent_delivery_option: { eta_end: etaEnd, eta_start: etaStart },
          },
          customer: { email, first_name: customer.first_name, last_name: customer.last_name, phone_number: customer.phone_number, title: customer.title },
          pricing_details: { currency, address, price: total },
          order_items: orderItems,
          shipping_fees: [{ original_price: st.shipping, price: st.shipping }],
          ...(strategy === 'ckc' ? { sign_on_collect: true } : {}),
        },
      });
    }

    packages.push({
      customer,
      country: country.code,
      subOrders,
      parent: {
        site_id: SITE_ID_VAR,
        token: TOKEN_VAR,
        parent_order: {
          id: parentId,
          pricing_details: { price: round2(parentTotal), currency },
        },
      },
    });
  }
  return packages;
};
