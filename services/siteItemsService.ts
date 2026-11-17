import { AppSettings, SiteProfile } from '../types';
import { buildUrl, proxyFetch, describeError, hasRealValue, ProxyResponseEnvelope } from './onestockClient';
import { activeProfiles, resolveUrl, tokenOf } from './apiProfiles';
import { loginSite, withSiteToken, hasCredentials } from './loginService';
import { settingsStore } from './appStores';

export interface SiteItemsQuery {
  itemIds: string[];
  productIds: string[];
  // Text search on the items (GET /items "pattern").
  pattern: string;
  lang: string;
  max: number;
}

const ITEM_FIELDS = ['product_id', 'features', 'sales_channels_features', 'category_ids'];
const isAuthError = (e: ProxyResponseEnvelope) => e.status === 401 || (e.body as any)?.error === 'auth_error';

// Items of another site of API Settings (GET /items with its own URL and token), page by page.
// A refused token is renewed with the site's user / password (POST /login) when it has them.
export const fetchSiteItems = async (siteProfileId: string, query: SiteItemsQuery, onProgress?: (n: number) => void): Promise<any[]> => {
  let settings: AppSettings = settingsStore.get();
  const { sites, tokens, url } = activeProfiles(settings);
  const site: SiteProfile | undefined = sites.find(s => s.id === siteProfileId);
  if (!site || !hasRealValue(site.siteId)) throw new Error('Unknown site.');
  const baseUrl = url ? resolveUrl(url.url, site.siteId) : settings.apiUrl.replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s{}]+/i.test(baseUrl)) throw new Error(`No usable API URL for ${site.siteId}.`);
  const endpoint = buildUrl({ baseUrl, version: settings.apiVersion === 'v4' ? 'v4' : 'v3' }, '/items');
  let token = tokenOf(site, tokens);
  let renewed = false;

  const base: Record<string, unknown> = {
    ...(query.itemIds.length ? { item_ids: query.itemIds } : {}),
    ...(query.productIds.length ? { product_ids: query.productIds } : {}),
    ...(query.pattern.trim() ? { pattern: query.pattern.trim() } : {}),
    ...(query.lang.trim() ? { lang: query.lang.trim() } : {}),
  };
  // With the fields first; without them when the API refuses them.
  let withFields = true;
  const call = async (start: number, limit: number): Promise<ProxyResponseEnvelope> => {
    if (!hasRealValue(token) && hasCredentials(site) && !renewed) await renew();
    let env = await proxyFetch(endpoint, 'GET', { site_id: site.siteId, token, ...base, ...(withFields ? { fields: ITEM_FIELDS } : {}), pagination: { start, limit } });
    if (isAuthError(env) && hasCredentials(site) && !renewed) {
      await renew();
      env = await proxyFetch(endpoint, 'GET', { site_id: site.siteId, token, ...base, ...(withFields ? { fields: ITEM_FIELDS } : {}), pagination: { start, limit } });
    }
    if (!env.ok && withFields && (env.status === 400 || env.status === 422)) {
      withFields = false;
      return call(start, limit);
    }
    return env;
  };
  const renew = async () => {
    renewed = true;
    token = await loginSite(settings, site);
    settingsStore.set(prev => ({ ...prev, ...withSiteToken(prev, site.id, token) }));
    settings = settingsStore.get();
  };

  const all: any[] = [];
  const limit = 100;
  for (let start = 0; all.length < query.max; start += limit) {
    const env = await call(start, Math.min(limit, query.max - all.length));
    if (env.status === 204) break;
    if (!env.ok) throw new Error(`GET /items on ${site.siteId}: ${describeError(env)}${isAuthError(env) && !hasCredentials(site) ? ' → set a token or a user / password for this site in API Settings' : ''}`);
    const items = (env.body as any)?.items;
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    onProgress?.(all.length);
    if (items.length < Math.min(limit, query.max)) break;
  }
  return all;
};
