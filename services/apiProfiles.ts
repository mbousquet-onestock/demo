import { AppSettings, ApiUrlProfile, ApiTokenProfile, SiteProfile } from '../types';
import { QUALIF_URL_TEMPLATE, PROD_URL_TEMPLATE, hasRealValue } from './onestockClient';

export const newProfileId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const DEFAULT_API_URLS: ApiUrlProfile[] = [
  { id: 'qualif', label: 'Qualif', url: QUALIF_URL_TEMPLATE },
  { id: 'prod', label: 'Production', url: PROD_URL_TEMPLATE },
];

export const resolveUrl = (url: string, siteId: string) =>
  url.trim().replace(/\{site_id\}/g, hasRealValue(siteId) ? siteId.trim() : '{site_id}').replace(/\/+$/, '');

// Token of a site: its shared token when it uses one, else its own.
export const tokenOf = (site: SiteProfile, tokens: ApiTokenProfile[]) =>
  site.tokenId ? tokens.find(t => t.id === site.tokenId)?.token ?? '' : site.token;

// Sites and URLs of the settings; before they were defined, the current site / URL become the first entries.
export const profilesOf = (settings: AppSettings): { sites: SiteProfile[]; urls: ApiUrlProfile[]; tokens: ApiTokenProfile[] } => {
  const tokens = settings.tokens ?? [];
  const sites = settings.sites ?? (hasRealValue(settings.siteId)
    ? [{ id: 'current', label: settings.apiName && settings.apiName !== 'Default' ? settings.apiName : settings.siteId, siteId: settings.siteId, token: settings.token }]
    : []);
  let urls = settings.apiUrls ?? DEFAULT_API_URLS;
  if (!settings.apiUrls && settings.apiUrl && !urls.some(u => resolveUrl(u.url, settings.siteId) === settings.apiUrl.replace(/\/+$/, ''))) {
    urls = [{ id: 'current', label: 'Current', url: settings.apiUrl }, ...urls];
  }
  return { sites, urls, tokens };
};

// Active entries: the stored ids, else the entries matching the current site / URL.
export const activeProfiles = (settings: AppSettings) => {
  const { sites, urls, tokens } = profilesOf(settings);
  const site = sites.find(s => s.id === settings.activeSiteId) || sites.find(s => s.siteId === settings.siteId && tokenOf(s, tokens) === settings.token)
    || sites.find(s => s.siteId === settings.siteId);
  const url = urls.find(u => u.id === settings.activeUrlId && resolveUrl(u.url, settings.siteId) === (settings.apiUrl || '').replace(/\/+$/, ''))
    || urls.find(u => resolveUrl(u.url, settings.siteId) === (settings.apiUrl || '').replace(/\/+$/, ''));
  return { sites, urls, tokens, site, url };
};

// URL entry of a site: its own one, else the URL selected in the top bar.
export const siteUrlEntry = (settings: AppSettings, site: SiteProfile): ApiUrlProfile | undefined => {
  const { urls, url } = activeProfiles(settings);
  return (site.urlId && urls.find(u => u.id === site.urlId)) || url || urls.find(u => u.id === settings.activeUrlId);
};
// API URL of a site (its URL entry rebuilt for its site ID, else the current API URL).
export const siteBaseUrl = (settings: AppSettings, site: SiteProfile): string => {
  const entry = siteUrlEntry(settings, site);
  return entry ? resolveUrl(entry.url, site.siteId) : (settings.apiUrl || '').trim().replace(/\/+$/, '');
};

// Settings patch selecting a site: its id / token, and its URL (or the selected one) rebuilt for this site.
export const selectSite = (settings: AppSettings, id: string): Partial<AppSettings> => {
  const { sites, urls, tokens } = activeProfiles(settings);
  const site = sites.find(s => s.id === id);
  if (!site) return {};
  const urlEntry = siteUrlEntry(settings, site);
  return {
    sites, apiUrls: urls,
    activeSiteId: site.id, siteId: site.siteId, token: tokenOf(site, tokens),
    ...(urlEntry ? { apiUrl: resolveUrl(urlEntry.url, site.siteId), activeUrlId: urlEntry.id } : {}),
  };
};

// Selecting a URL in the top bar also makes it the URL of the selected site.
export const selectUrl = (settings: AppSettings, id: string): Partial<AppSettings> => {
  const { sites, urls, site } = activeProfiles(settings);
  const u = urls.find(x => x.id === id);
  if (!u) return {};
  const nextSites = site ? sites.map(s => (s.id === site.id ? { ...s, urlId: u.id } : s)) : sites;
  return { sites: nextSites, apiUrls: urls, activeUrlId: u.id, apiUrl: resolveUrl(u.url, settings.siteId) };
};
